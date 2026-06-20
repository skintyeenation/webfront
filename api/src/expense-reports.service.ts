import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DOCUMENT_STORAGE } from './storage/storage.module';
import { DocumentStorageAdapter } from './storage/document-storage';
import { recentExpensePeriods, expensePeriodFor, ExpensePeriod } from './skintyee-expense-periods';
import { toCad } from './expense-fx';
import { buildPdf, PdfLine, PdfRect, PdfImage, PDF_CONST } from './pdf-builder';
import { TIMESHEET_LOGO } from './timesheet-logo';
import { BRAND } from './email-template';
import dayjs from 'dayjs';

// Expense reports — printable PDFs with the SAME band letterhead/cover/signature
// layout as the timesheet reports (timekeeping-reports.service.ts). Two scopes:
//   - per pay period: a cover + one page per claim (mirrors the timesheet report)
//   - per single claim: just that claim's page(s) (the "print this claim" button)
// Plus a flat CSV. Generated on demand + cached in memory (no DB report rows).

const LOGO_KEY = 'skintyee-logo';
const round2 = (n: number) => Math.round(n * 100) / 100;

function logoImage(x: number, yTop: number, w: number): PdfImage {
  const h = (w * TIMESHEET_LOGO.heightPx) / TIMESHEET_LOGO.widthPx;
  return { key: LOGO_KEY, flateRgbB64: TIMESHEET_LOGO.flateRgbB64, widthPx: TIMESHEET_LOGO.widthPx, heightPx: TIMESHEET_LOGO.heightPx, x, y: yTop - h, w, h };
}
function wrapText(text: string, maxChars: number): string[] {
  const out: string[] = []; let cur = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= maxChars) cur += ' ' + word;
    else { out.push(cur); cur = word; }
    while (cur.length > maxChars) { out.push(cur.slice(0, maxChars)); cur = cur.slice(maxChars); }
  }
  if (cur) out.push(cur);
  return out;
}

const money = (n: number, cur = 'CAD') => `${cur} ${round2(n).toFixed(2)}`;

// Receipt line-item summary detection (mirrors the app's isSummaryLine). Summary
// rows (subtotal/total/tax/…) aren't real items; tax/total are printed from the
// item fields, the subtotal line is shown.
const SUMMARY_RE = /^\s*(sub[\s-]*total|total|balance(\s*due)?|amount\s*due|change|tax|gst|hst|pst|qst|tip|gratuity|rounding|cash|visa|mastercard|debit|credit|payment|due)\b/i;
const isSubtotalLine = (li: any) => /sub[\s-]*total/i.test(li?.description ?? '');
const isSummaryLine = (li: any) => !!li && (li.isSummary === true || SUMMARY_RE.test(li.description ?? ''));
const isHiddenSummary = (li: any) => isSummaryLine(li) && !isSubtotalLine(li);

// Parse a JPEG's pixel dimensions from its SOF marker (no decode needed) so the
// PDF image XObject can declare Width/Height. Returns null if not a JPEG.
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let o = 2;
  while (o + 9 < buf.length) {
    if (buf[o] !== 0xff) { o++; continue; }
    const marker = buf[o + 1];
    // SOF0..SOF15 carry frame dimensions (skip non-frame DHT/DQT/RST/etc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buf.readUInt16BE(o + 5);
      const width = buf.readUInt16BE(o + 7);
      return { width, height };
    }
    const len = buf.readUInt16BE(o + 2);
    if (len < 2) return null;
    o += 2 + len;
  }
  return null;
}

const pdfCache = new Map<string, { bytes: Buffer; fileName: string }>();

export interface ExpenseReportSummary {
  payPeriodId: string;
  periodLabel: string;
  startISO: string;
  endISO: string;
  payDateISO: string;
  hasData: boolean;
  claimCount: number;
  totalAmount: number;
}

@Injectable()
export class ExpenseReportsService {
  private readonly log = new Logger(ExpenseReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageAdapter,
  ) {}

  async list(count = 12): Promise<ExpenseReportSummary[]> {
    const periods = [expensePeriodFor(), ...recentExpensePeriods(count - 1)];
    const seen = new Set<string>();
    const uniq = periods.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    const sums = new Map<string, { claimCount: number; totalAmount: number }>();
    if (this.prisma.isAvailable) {
      const grouped = await this.prisma.expenseClaim.groupBy({
        by: ['payPeriodId'],
        _count: { _all: true },
        _sum: { totalAmount: true },
        where: { payPeriodId: { in: uniq.map((p) => p.id) } },
      });
      for (const g of grouped) sums.set(g.payPeriodId, { claimCount: g._count?._all ?? 0, totalAmount: g._sum?.totalAmount ?? 0 });
    }
    return uniq.map((p) => {
      const s = sums.get(p.id) ?? { claimCount: 0, totalAmount: 0 };
      return {
        payPeriodId: p.id, periodLabel: p.label, startISO: p.startISO, endISO: p.endISO, payDateISO: p.payDateISO,
        hasData: s.claimCount > 0, claimCount: s.claimCount, totalAmount: round2(s.totalAmount),
      };
    });
  }

  /** Build (or refresh) the period PDF + cache it. */
  async generate(payPeriodId: string): Promise<ExpenseReportSummary> {
    if (!this.prisma.isAvailable) throw new Error('Postgres required to generate reports.');
    const period = recentExpensePeriods(24).find((p) => p.id === payPeriodId)
      ?? (expensePeriodFor().id === payPeriodId ? expensePeriodFor() : undefined);
    if (!period) throw new Error(`Unknown period: ${payPeriodId}`);
    const claims = await this.prisma.expenseClaim.findMany({
      where: { payPeriodId },
      include: { items: { orderBy: [{ date: 'asc' }] } },
      orderBy: [{ submitterName: 'asc' }],
    });
    if (claims.length === 0) throw new Error('No expense claims in this period yet.');
    const tagLabels = await this.tagLabelMap();
    const bytes = this.buildPeriodPdf(period, claims, tagLabels);
    const fileName = `expenses-${payPeriodId}.pdf`;
    pdfCache.set(`period:${payPeriodId}`, { bytes, fileName });
    return {
      payPeriodId, periodLabel: period.label, startISO: period.startISO, endISO: period.endISO, payDateISO: period.payDateISO,
      hasData: true, claimCount: claims.length, totalAmount: round2(claims.reduce((s, c) => s + (c.totalAmount ?? 0), 0)),
    };
  }

  async getPeriodPdf(payPeriodId: string): Promise<{ bytes: Buffer; fileName: string }> {
    const cached = pdfCache.get(`period:${payPeriodId}`);
    if (cached) return cached;
    await this.generate(payPeriodId);
    return pdfCache.get(`period:${payPeriodId}`)!;
  }

  /** Single-claim printout. */
  async getClaimPdf(claimId: string): Promise<{ bytes: Buffer; fileName: string }> {
    if (!this.prisma.isAvailable) throw new Error('Postgres required.');
    const claim = await this.prisma.expenseClaim.findUnique({ where: { id: claimId }, include: { items: { orderBy: [{ date: 'asc' }] } } });
    if (!claim) throw new Error('Claim not found');
    const period = expensePeriodFor(claim.payPeriodId);
    const tagLabels = await this.tagLabelMap();
    const pages: Page[] = [];
    this.claimPages(pages, period, claim, tagLabels, /*cover*/ true);
    const fileName = `expense-${claim.submitterUpn}-${claim.payPeriodId}.pdf`;
    return { bytes: buildPdf(pages as any), fileName };
  }

  /**
   * "Receipts & line items by user" — a SEPARATE detailed report (the general
   * expense summary is untouched). Grouped by submitter; for each receipt it
   * prints the line items (with subtotal/tax/total) in the left column and the
   * receipt IMAGE in the right column (JPEG embedded; non-JPEG shows a note).
   */
  async getByUserPdf(payPeriodId: string): Promise<{ bytes: Buffer; fileName: string }> {
    if (!this.prisma.isAvailable) throw new Error('Postgres required.');
    const claims = await this.prisma.expenseClaim.findMany({
      where: { payPeriodId }, include: { items: { orderBy: [{ date: 'asc' }] } }, orderBy: [{ submitterName: 'asc' }],
    });
    const period = expensePeriodFor(payPeriodId);
    const tagLabels = await this.tagLabelMap();
    const pages: Page[] = [];
    const totalAmount = claims.reduce((s, c) => s + (c.totalAmount ?? 0), 0);
    coverPage(pages, period, { claimCount: claims.length, totalAmount, currency: claims[0]?.currency ?? 'CAD' });
    for (const c of claims) await this.userReceiptPages(pages, period, c, tagLabels);
    return { bytes: buildPdf(pages as any), fileName: `expenses-by-user-${payPeriodId}.pdf` };
  }

  // One submitter section: each receipt = line items (left) + image (right).
  private async userReceiptPages(pages: Page[], period: ExpensePeriod, claim: any, tagLabels: Map<string, { label: string; gl: string | null }>) {
    const { PAGE_W, PAGE_MARGIN } = PDF_CONST;
    const LEFT_X = PAGE_MARGIN;
    const AMT_X = PAGE_MARGIN + 250;                 // right edge of the left column's numbers
    const IMG_X = PAGE_MARGIN + 330;                 // right-column receipt image
    const IMG_W = PAGE_W - PAGE_MARGIN - IMG_X;      // ~186pt
    const FLOOR = 96;

    let { page, y } = newClaimPage(period, claim.submitterName, { claim });
    if ((claim as any).submitterEmail) { page.lines.push({ size: 9, y, text: (claim as any).submitterEmail }); y -= 16; }

    const items = (claim.items ?? []) as any[];
    if (items.length === 0) { page.lines.push({ size: 10, y, text: '(no receipts)' }); pages.push(page); return; }

    let imgSeq = 0;
    for (const it of items) {
      // Resolve the receipt image up front so we know how tall the block is.
      const img = await this.receiptJpeg(it, IMG_X, IMG_W, `r${claim.id}-${imgSeq++}`);
      const lineRows = (Array.isArray(it.lineItems) ? it.lineItems : []).filter((li: any) => !isHiddenSummary(li));
      const textH = 26 + (lineRows.length + 2) * 12 + 18; // header + lines + tax/total
      const blockH = Math.max(textH, img ? img.h : 0) + 14;
      if (y - blockH < FLOOR) { pages.push(page); ({ page, y } = newClaimPage(period, `${claim.submitterName} (cont.)`)); }

      const topY = y;
      // Right column: the receipt image (or a note). PdfImage.y is the BOTTOM-
      // left corner — place the top of the image at the row top.
      if (img) {
        img.pdf.y = topY - img.pdf.h;
        page.images.push(img.pdf);
      } else {
        page.lines.push({ size: 8, x: IMG_X, y: topY - 10, text: it.mimeType?.includes('pdf') ? '[PDF receipt — see attachment]' : (it.fileName ? '[image receipt]' : '[no image]') });
      }

      // Left column: receipt header + line items — all in the RECEIPT's currency
      // (a "USD" prefix flags a foreign bill).
      const icur = it.currency ?? 'CAD';
      let ly = topY;
      const meta = tagLabels.get(it.tagSlug ?? '');
      const tagCell = `${meta?.gl ? meta.gl + ' ' : ''}${meta?.label ?? it.tagSlug ?? '-'}`;
      page.lines.push({ size: 11, x: LEFT_X, y: ly, text: (it.vendor || 'Receipt').slice(0, 34) });
      page.lines.push({ size: 10, x: AMT_X - 6, y: ly, text: money(it.amount ?? 0, icur) });
      ly -= 13;
      page.lines.push({ size: 8.5, x: LEFT_X, y: ly, text: `${it.date ?? '-'}  ·  ${tagCell}`.slice(0, 46) }); ly -= 14;
      for (const li of lineRows) {
        const isSub = isSubtotalLine(li);
        const label = isSub ? 'Subtotal' : `${li.qty && li.qty > 1 ? `${li.qty}× ` : ''}${li.description ?? ''}`;
        page.lines.push({ size: 9, x: LEFT_X + 10, y: ly, text: `${isSub ? '' : '· '}${label}${li.excluded ? ' (excluded)' : ''}`.slice(0, 38) });
        if (li.amount != null) page.lines.push({ size: 9, x: AMT_X - 6, y: ly, text: money(li.amount, icur) });
        ly -= 12;
      }
      if (it.taxAmount != null) { page.lines.push({ size: 9, x: LEFT_X + 10, y: ly, text: 'Tax' }); page.lines.push({ size: 9, x: AMT_X - 6, y: ly, text: money(it.taxAmount, icur) }); ly -= 12; }
      page.lines.push({ size: 9.5, x: LEFT_X + 10, y: ly, text: 'Total' }); page.lines.push({ size: 9.5, x: AMT_X - 6, y: ly, text: money(it.amount ?? 0, icur) });
      if (icur !== 'CAD') { ly -= 12; page.lines.push({ size: 8, x: LEFT_X + 10, y: ly, text: `≈ ${money(toCad(it.amount ?? 0, icur), 'CAD')} converted` }); }

      y = topY - blockH;
      page.rects.push({ x: LEFT_X, y: y + 8, w: PAGE_W - 2 * PAGE_MARGIN, h: 0.4 });
    }

    if (y - 26 < FLOOR) { pages.push(page); ({ page, y } = newClaimPage(period, `${claim.submitterName} (cont.)`)); }
    page.lines.push({ size: 11, x: LEFT_X, y: y - 8, text: 'Claim total (CAD)' });
    page.lines.push({ size: 11, x: AMT_X - 6, y: y - 8, text: money(claim.totalAmount ?? 0, 'CAD') });
    pages.push(page);
  }

  // Read a receipt's bytes + embed as a right-column JPEG (scaled into IMG_W).
  // Returns null for non-JPEG / unreadable receipts (caller prints a note).
  private async receiptJpeg(item: any, x: number, maxW: number, key: string): Promise<{ pdf: PdfImage; h: number; y: number } | null> {
    if (!item.fileKey) return null;
    try {
      const r = await this.storage.read(item.fileKey);
      if (!r) return null;
      // Detect JPEG by magic bytes (jpegSize returns null otherwise) rather than
      // trusting a possibly-generic stored mimeType.
      const dim = jpegSize(r.bytes);
      if (!dim) return null;
      const maxH = 150;
      let w = maxW, h = (maxW * dim.height) / dim.width;
      if (h > maxH) { h = maxH; w = (maxH * dim.width) / dim.height; }
      return { pdf: { key, jpegB64: r.bytes.toString('base64'), widthPx: dim.width, heightPx: dim.height, x, y: 0, w, h }, h, y: 0 };
    } catch (e: any) {
      this.log.warn(`receiptJpeg ${item.id}: ${e?.message ?? e}`);
      return null;
    }
  }

  async csv(payPeriodId: string): Promise<{ filename: string; csv: string }> {
    if (!this.prisma.isAvailable) throw new Error('Postgres required to export CSV.');
    const claims = await this.prisma.expenseClaim.findMany({
      where: { payPeriodId }, include: { items: { orderBy: [{ date: 'asc' }] } }, orderBy: [{ submitterName: 'asc' }],
    });
    const tagLabels = await this.tagLabelMap();
    const tagText = (slug?: string | null) => tagLabels.get(slug ?? '')?.label ?? slug ?? '';
    const glOf = (slug?: string | null) => tagLabels.get(slug ?? '')?.gl ?? '';
    const header = ['submitterUpn', 'submitterName', 'submitterEmail', 'claimStatus', 'date', 'vendor', 'tag', 'glAccount', 'amount', 'tax', 'currency', 'amountCAD', 'description', 'submittedAt', 'approvedBy', 'approvedAt', 'rejectedReason'];
    const esc = (v: any): string => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [header.join(',')];
    for (const c of claims) {
      const base = [c.submitterUpn, c.submitterName, (c as any).submitterEmail ?? '', c.status];
      const tail = [c.submittedAt?.toISOString() ?? '', c.approvedBy ?? '', c.approvedAt?.toISOString() ?? '', c.rejectedReason ?? ''];
      if (c.items.length === 0) { lines.push([...base, '', '', '', '', '', '', '', '', '', ...tail].map(esc).join(',')); continue; }
      for (const it of c.items) {
        const icur = (it as any).currency ?? 'CAD';
        lines.push([...base, it.date ?? '', it.vendor ?? '', tagText(it.tagSlug), glOf(it.tagSlug), it.amount, (it as any).taxAmount ?? '', icur, toCad(it.amount, icur), it.description ?? '', ...tail].map(esc).join(','));
      }
    }
    return { filename: `expenses-${payPeriodId}.csv`, csv: lines.join('\n') + '\n' };
  }

  private async tagLabelMap(): Promise<Map<string, { label: string; gl: string | null }>> {
    if (!this.prisma.isAvailable) return new Map();
    const tags = await this.prisma.expenseTag.findMany();
    return new Map(tags.map((t) => [t.slug, { label: t.label, gl: (t as any).glAccount ?? null }]));
  }

  // ---- PDF rendering (mirrors timekeeping-reports.service.ts) -------------
  private buildPeriodPdf(period: ExpensePeriod, claims: any[], tagLabels: Map<string, { label: string; gl: string | null }>): Buffer {
    const pages: Page[] = [];
    // Claim totals are already converted to CAD (the base), so the period total
    // is a straight CAD sum.
    const totalAmount = claims.reduce((s, c) => s + (c.totalAmount ?? 0), 0);
    coverPage(pages, period, { claimCount: claims.length, totalAmount, currency: 'CAD' });
    for (const c of claims) this.claimPages(pages, period, c, tagLabels, /*cover*/ false);
    return buildPdf(pages as any);
  }

  // Render a claim's page(s): letterhead, header, items table, notes, signatures.
  private claimPages(pages: Page[], period: ExpensePeriod, claim: any, tagLabels: Map<string, { label: string; gl: string | null }>, cover: boolean) {
    if (cover) coverPage(pages, period, { claimCount: 1, totalAmount: claim.totalAmount ?? 0, currency: 'CAD', single: claim });
    const { PAGE_W, PAGE_MARGIN } = PDF_CONST;
    const TAG_X = PAGE_MARGIN + 70, VENDOR_X = PAGE_MARGIN + 190, AMT_X = PAGE_MARGIN + 420;
    const LINE_H = 14, ENTRY_FLOOR = 70, CONTENT_FLOOR = 196;
    const items0 = (claim.items ?? []) as any[];
    const hasForeign = items0.some((it) => (it.currency ?? 'CAD') !== 'CAD');

    const tableHeader = (page: Page, y: number): number => {
      page.lines.push({ size: 9, x: PAGE_MARGIN, y, text: 'DATE' });
      page.lines.push({ size: 9, x: TAG_X, y, text: 'GL · TAG' });
      page.lines.push({ size: 9, x: VENDOR_X, y, text: 'VENDOR' });
      page.lines.push({ size: 9, x: AMT_X, y, text: 'AMOUNT' });
      return y - 14;
    };

    let { page, y } = newClaimPage(period, claim.submitterName, { claim });
    y = tableHeader(page, y);
    const items = (claim.items ?? []) as any[];
    if (items.length === 0) { page.lines.push({ size: 10, y, text: '(no receipts)' }); y -= LINE_H; }
    else {
      for (const it of items) {
        const vendorLines = wrapText(String(it.vendor ?? '-'), 36);
        const rowH = Math.max(1, vendorLines.length) * LINE_H;
        if (y - rowH < ENTRY_FLOOR) { pages.push(page); ({ page, y } = newClaimPage(period, `${claim.submitterName} (cont.)`)); y = tableHeader(page, y); }
        const meta = tagLabels.get(it.tagSlug ?? '');
        const tagCell = `${meta?.gl ? meta.gl + ' ' : ''}${meta?.label ?? it.tagSlug ?? '-'}`.slice(0, 20);
        page.lines.push({ size: 10, x: PAGE_MARGIN, y, text: it.date ?? '-' });
        page.lines.push({ size: 10, x: TAG_X, y, text: tagCell });
        // Show each receipt in its OWN currency (the "USD" prefix flags foreign).
        page.lines.push({ size: 10, x: AMT_X, y, text: money(it.amount ?? 0, it.currency ?? 'CAD') });
        vendorLines.forEach((vl, i) => page.lines.push({ size: 10, x: VENDOR_X, y: y - i * LINE_H, text: vl }));
        y -= rowH;
      }
    }
    y -= 6;
    // Claim total is the CAD-converted sum.
    page.lines.push({ size: 11, x: AMT_X - 60, y, text: `Total (CAD): ${money(claim.totalAmount ?? 0, 'CAD')}` });
    y -= 14;
    if (hasForeign) { page.lines.push({ size: 8, x: PAGE_MARGIN, y, text: 'Includes foreign-currency receipts — total converted to CAD.' }); y -= 12; }
    y -= 4;

    if (claim.notes) {
      y -= 4;
      for (const ln of wrapText(`Notes: ${claim.notes}`, 96)) {
        if (y < CONTENT_FLOOR) { pages.push(page); ({ page, y } = newClaimPage(period, `${claim.submitterName} (notes cont.)`)); }
        page.lines.push({ size: 9, y, text: ln }); y -= 12;
      }
    }
    if (y < CONTENT_FLOOR) { pages.push(page); ({ page, y } = newClaimPage(period, `${claim.submitterName} (cont.)`)); }
    signatureBlock(page, claim);
    pages.push(page);
  }
}

// ---- shared page primitives (same letterhead/cover/signature as timesheets) -
type Page = { lines: PdfLine[]; rects: PdfRect[]; images: PdfImage[] };
const ACCENT_H = 1.4;
const contactLine1 = `${BRAND.tagline}  ·  ${BRAND.address}`;
const contactLine2 = `${BRAND.phone}  ·  ${BRAND.email}  ·  ${BRAND.website}`;

function letterhead(page: Page): number {
  const { PAGE_W, PAGE_H, PAGE_MARGIN } = PDF_CONST;
  const TOP_Y = PAGE_H - PAGE_MARGIN;
  const logoW = 50;
  const logoH = (logoW * TIMESHEET_LOGO.heightPx) / TIMESHEET_LOGO.widthPx;
  page.images.push(logoImage(PAGE_MARGIN, TOP_Y + 6, logoW));
  const tx = PAGE_MARGIN + logoW + 12;
  page.lines.push({ size: 12, x: tx, y: TOP_Y - 2, text: BRAND.name });
  page.lines.push({ size: 7.5, x: tx, y: TOP_Y - 13, text: contactLine1 });
  page.lines.push({ size: 7.5, x: tx, y: TOP_Y - 23, text: contactLine2 });
  const ruleY = TOP_Y - logoH - 6;
  page.rects.push({ x: PAGE_MARGIN, y: ruleY, w: PAGE_W - 2 * PAGE_MARGIN, h: ACCENT_H });
  return ruleY - 18;
}

function newClaimPage(period: ExpensePeriod, title: string, meta?: { claim: any }): { page: Page; y: number } {
  const page: Page = { lines: [], rects: [], images: [] };
  let y = letterhead(page);
  page.lines.push({ size: 14, y, text: title });
  y -= 16;
  if (meta) {
    const c = meta.claim;
    page.lines.push({ size: 10, y, text: `${c.submitterUpn}  ·  ${period.label}` });
    y -= 14;
    page.lines.push({ size: 10, y, text: `Status: ${(c.status as string).toUpperCase()} - Total ${money(c.totalAmount ?? 0, c.currency ?? 'CAD')} - ${(c.items ?? []).length} receipts` });
    y -= 18;
    if (c.submittedAt) { page.lines.push({ size: 9, y, text: `Submitted ${dayjs(c.submittedAt).format('YYYY-MM-DD HH:mm')}${c.approvedBy ? ` - Approved by ${c.approvedBy}` : ''}${c.rejectedReason ? ` - Rejected: ${c.rejectedReason}` : ''}` }); y -= 16; }
  } else { y -= 2; }
  return { page, y };
}

function signatureBlock(page: Page, c: any) {
  const { PAGE_MARGIN } = PDF_CONST;
  const X = PAGE_MARGIN, sigW = 250, dateX = PAGE_MARGIN + 300, dateW = 120;
  page.lines.push({ size: 11, y: 176, text: 'Signatures' });
  page.lines.push({ size: 7.5, y: 162, text: 'Electronic signatures may replace handwritten signatures in future.' });
  page.rects.push({ x: X, y: 124, w: sigW, h: 0.8 });
  page.rects.push({ x: dateX, y: 124, w: dateW, h: 0.8 });
  page.lines.push({ size: 9, y: 112, text: 'Submitter signature' });
  if (c.submitterName) page.lines.push({ size: 8, y: 101, text: c.submitterName });
  if (c.submittedAt) page.lines.push({ size: 9, x: dateX + 4, y: 128, text: dayjs(c.submittedAt).format('MMM D, YYYY') });
  page.lines.push({ size: 9, x: dateX, y: 112, text: 'Date' });
  page.rects.push({ x: X, y: 72, w: sigW, h: 0.8 });
  page.rects.push({ x: dateX, y: 72, w: dateW, h: 0.8 });
  page.lines.push({ size: 9, y: 60, text: 'Finance approval signature' });
  if (c.approvedBy) page.lines.push({ size: 8, y: 49, text: `Approved in app by ${c.approvedBy}` });
  if (c.approvedAt) page.lines.push({ size: 9, x: dateX + 4, y: 76, text: dayjs(c.approvedAt).format('MMM D, YYYY') });
  page.lines.push({ size: 9, x: dateX, y: 60, text: 'Date' });
}

function coverPage(pages: Page[], period: ExpensePeriod, info: { claimCount: number; totalAmount: number; currency: string; single?: any }) {
  const { PAGE_W, PAGE_H, PAGE_MARGIN } = PDF_CONST;
  const TOP_Y = PAGE_H - PAGE_MARGIN;
  const page: Page = { lines: [], rects: [], images: [] };
  const logoW = 130;
  const logoH = (logoW * TIMESHEET_LOGO.heightPx) / TIMESHEET_LOGO.widthPx;
  page.images.push(logoImage((PAGE_W - logoW) / 2, TOP_Y, logoW));
  let y = TOP_Y - logoH - 22;
  page.lines.push({ size: 18, y, center: true, text: BRAND.name }); y -= 16;
  page.lines.push({ size: 9, y, center: true, text: contactLine1 }); y -= 12;
  page.lines.push({ size: 9, y, center: true, text: contactLine2 }); y -= 12;
  const rw = 380; page.rects.push({ x: (PAGE_W - rw) / 2, y, w: rw, h: ACCENT_H }); y -= 30;
  page.lines.push({ size: 20, y, center: true, text: info.single ? 'Expense Claim' : 'Expense Report' }); y -= 24;
  if (info.single) { page.lines.push({ size: 13, y, center: true, text: info.single.submitterName }); y -= 17; }
  page.lines.push({ size: 13, y, center: true, text: `Period ${period.label}` }); y -= 17;
  page.lines.push({ size: 10, y, center: true, text: `Cutoff ${dayjs(period.endISO).format('ddd MMM D, YYYY')}  ·  Reimburse ${dayjs(period.payDateISO).format('ddd MMM D, YYYY')}` }); y -= 26;
  page.lines.push({ size: 11, y, center: true, text: info.single ? `Receipts: ${(info.single.items ?? []).length}` : `Claims: ${info.claimCount}` }); y -= 15;
  page.lines.push({ size: 11, y, center: true, text: `Total: ${money(info.totalAmount, info.currency)}` }); y -= 26;
  page.lines.push({ size: 9, y, center: true, text: `Generated ${dayjs().format('YYYY-MM-DD HH:mm')}  ·  Skin Tyee Expenses` });
  pages.push(page);
}
