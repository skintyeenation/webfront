import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DOCUMENT_STORAGE } from './storage/storage.module';
import { DocumentStorageAdapter } from './storage/document-storage';
import { recentPayPeriods, payPeriodFor, PayPeriod, PAY_PERIOD_CONFIG } from './skintyee-pay-periods';
import { buildPdf, PdfLine, PdfRect, PdfImage, PDF_CONST } from './pdf-builder';
import { TIMESHEET_LOGO } from './timesheet-logo';
import { BRAND } from './email-template';
import dayjs from 'dayjs';

// Overtime is calculated OVER THE TWO WEEKS — i.e. per-week hours beyond the
// weekly threshold (40h) in each of the period's two weeks — NOT as total hours
// over 80 across the timesheet. Computed here from week1/week2 so the PDF is
// authoritative and immune to any stale stored overtimeHours value.
function weeklyOvertime(t: any): number {
  const th = PAY_PERIOD_CONFIG.overtimeWeeklyHoursThreshold;
  const ot = Math.max(0, (t.week1Hours ?? 0) - th) + Math.max(0, (t.week2Hours ?? 0) - th);
  return Math.round(ot * 100) / 100;
}

// ---- PDF layout helpers ----------------------------------------------------

const LOGO_KEY = 'skintyee-logo';

// A logo placement: `yTop` is the image's TOP edge; the builder takes the
// bottom-left corner, so we subtract the (aspect-correct) height.
function logoImage(x: number, yTop: number, w: number): PdfImage {
  const h = (w * TIMESHEET_LOGO.heightPx) / TIMESHEET_LOGO.widthPx;
  return {
    key: LOGO_KEY,
    flateRgbB64: TIMESHEET_LOGO.flateRgbB64,
    widthPx: TIMESHEET_LOGO.widthPx,
    heightPx: TIMESHEET_LOGO.heightPx,
    x,
    y: yTop - h,
    w,
    h,
  };
}

// Greedy word-wrap so notes are never truncated or run off the page edge.
// `maxChars` is sized for the font/width by the caller (Helvetica ≈ 0.5em
// average, so usable-width / (0.5 * size) chars per line).
function wrapText(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= maxChars) cur += ' ' + word;
    else { out.push(cur); cur = word; }
    // Hard-break a single token longer than a line.
    while (cur.length > maxChars) { out.push(cur.slice(0, maxChars)); cur = cur.slice(maxChars); }
  }
  if (cur) out.push(cur);
  return out;
}

// In-memory cache of the last PDF bytes per period so a quick re-open
// after generation doesn't go back to storage. Refreshed by generate().
const pdfCache = new Map<string, { bytes: Buffer; fileName: string; generatedAt: number }>();

// Reports surface for the Time Keeping screen's Approvals tab. Two
// outputs per pay period:
//   - PDF (printable) — built by api/src/pdf-builder.ts and stored
//     in the active DocumentStorageAdapter (Blob today). Persisted in
//     TimesheetReport so the URL survives between sessions.
//   - CSV (no persistence) — generated on demand, streamed inline.
//
// Listing returns *every* recent pay period, including ones with no
// timesheets — the UI shows those greyed-out so the admin can see the
// catalog at a glance.

export interface ReportSummary {
  payPeriodId: string;
  periodLabel: string;
  startISO: string;
  endISO: string;
  payDateISO: string;
  hasData: boolean;
  workerCount: number;
  totalHours: number;
  // Existing PDF, if previously generated.
  reportId?: string;
  reportUrl?: string;
  reportGeneratedAt?: string;
  reportSizeBytes?: number;
}

@Injectable()
export class TimekeepingReportsService {
  private readonly log = new Logger(TimekeepingReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageAdapter,
  ) {}

  // List the last N pay periods + whether each has timesheets + any
  // previously-generated report. Defaults to 12 periods (≈ 6 months).
  async list(count = 12): Promise<ReportSummary[]> {
    const periods = [payPeriodFor(), ...recentPayPeriods(count - 1)];
    // Dedupe (payPeriodFor() may overlap recentPayPeriods()[0]).
    const seen = new Set<string>();
    const uniq = periods.filter((p) => seen.has(p.id) ? false : (seen.add(p.id), true));

    // For each period, count timesheets + sum hours from Prisma when
    // available, otherwise fall back to "no data".
    const sums = new Map<string, { workerCount: number; totalHours: number }>();
    if (this.prisma.isAvailable) {
      const grouped = await this.prisma.timesheet.groupBy({
        by: ['payPeriodId'],
        _count: { _all: true },
        _sum: { totalHours: true },
        where: { payPeriodId: { in: uniq.map((p) => p.id) } },
      });
      for (const g of grouped) {
        sums.set(g.payPeriodId, {
          workerCount: g._count?._all ?? 0,
          totalHours: g._sum?.totalHours ?? 0,
        });
      }
    }

    // Existing reports
    const reports = this.prisma.isAvailable
      ? await this.prisma.timesheetReport.findMany({
          where: { payPeriodId: { in: uniq.map((p) => p.id) } },
        })
      : [];
    const byId = new Map(reports.map((r) => [r.payPeriodId, r]));

    return uniq.map((p) => {
      const s = sums.get(p.id) ?? { workerCount: 0, totalHours: 0 };
      const r = byId.get(p.id);
      return {
        payPeriodId: p.id,
        periodLabel: p.label,
        startISO: p.startISO,
        endISO: p.endISO,
        payDateISO: p.payDateISO,
        hasData: s.workerCount > 0,
        workerCount: s.workerCount,
        totalHours: Math.round(s.totalHours * 100) / 100,
        ...(r ? {
          reportId: r.id,
          reportUrl: r.fileUrl ?? undefined,
          reportGeneratedAt: r.generatedAt.toISOString(),
          reportSizeBytes: r.sizeBytes,
        } : {}),
      };
    });
  }

  // Generate a fresh PDF for a period. Replaces any existing report for
  // the same period (idempotent regenerate). Returns the persisted row.
  async generate(payPeriodId: string, adminUpn: string): Promise<ReportSummary> {
    if (!this.prisma.isAvailable) {
      throw new Error('Postgres required to generate reports.');
    }
    const periodMatch = recentPayPeriods(24).find((p) => p.id === payPeriodId)
      ?? (payPeriodFor().id === payPeriodId ? payPeriodFor() : undefined);
    if (!periodMatch) throw new Error(`Unknown pay period: ${payPeriodId}`);

    const timesheets = await this.prisma.timesheet.findMany({
      where: { payPeriodId },
      include: { entries: { orderBy: [{ date: 'asc' }] } },
      orderBy: [{ workerName: 'asc' }],
    });
    if (timesheets.length === 0) throw new Error('No timesheets in this period yet.');

    const pdf = this.buildPdf(periodMatch, timesheets);
    // Replace any existing blob for this period before persisting.
    const existing = await this.prisma.timesheetReport.findUnique({ where: { payPeriodId } });
    if (existing) {
      try { await this.storage.delete(existing.fileKey); } catch (e: any) {
        this.log.warn(`Old report blob delete failed: ${e?.message ?? e}`);
      }
    }
    const fileName = `timesheets-${payPeriodId}.pdf`;
    const up = await this.storage.upload({ fileName, mimeType: 'application/pdf', bytes: pdf });
    pdfCache.set(payPeriodId, { bytes: pdf, fileName, generatedAt: Date.now() });
    const totalHours = timesheets.reduce((s, t) => s + (t.totalHours ?? 0), 0);
    const data = {
      payPeriodId,
      storage: this.storage.driver,
      fileKey: up.key,
      fileUrl: up.url,
      fileName,
      sizeBytes: up.sizeBytes ?? pdf.length,
      workerCount: timesheets.length,
      totalHours: Math.round(totalHours * 100) / 100,
      generatedBy: adminUpn,
      generatedAt: new Date(),
    };
    const r = await this.prisma.timesheetReport.upsert({
      where: { payPeriodId },
      create: data,
      update: { ...data },
    });
    return {
      payPeriodId,
      periodLabel: periodMatch.label,
      startISO: periodMatch.startISO,
      endISO: periodMatch.endISO,
      payDateISO: periodMatch.payDateISO,
      hasData: true,
      workerCount: timesheets.length,
      totalHours: Math.round(totalHours * 100) / 100,
      reportId: r.id,
      reportUrl: r.fileUrl ?? undefined,
      reportGeneratedAt: r.generatedAt.toISOString(),
      reportSizeBytes: r.sizeBytes,
    };
  }

  // Read the PDF bytes for a period. Tries (in order): hot in-memory
  // cache from a recent generate(); the storage adapter via fileKey;
  // a fresh on-the-fly regenerate. Used by the streaming endpoint so
  // the client doesn't need direct access to the storage URL (avoids
  // the in-memory `mem://` URL issue + lets us keep the role guard on
  // the route).
  async getPdfBytes(payPeriodId: string, adminUpn: string): Promise<{ bytes: Buffer; fileName: string }> {
    const cached = pdfCache.get(payPeriodId);
    if (cached) return { bytes: cached.bytes, fileName: cached.fileName };
    if (this.prisma.isAvailable) {
      const r = await this.prisma.timesheetReport.findUnique({ where: { payPeriodId } });
      if (r) {
        try {
          const url = await this.storage.urlFor(r.fileKey);
          // The adapter's URL can be `mem://...` (in-memory degraded
          // mode) or a real https URL. For mem://, regenerate inline.
          if (url && url.startsWith('http')) {
            const res = await fetch(url);
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              pdfCache.set(payPeriodId, { bytes: buf, fileName: r.fileName, generatedAt: Date.now() });
              return { bytes: buf, fileName: r.fileName };
            }
          }
        } catch (e: any) {
          this.log.warn(`getPdfBytes: storage read failed, regenerating: ${e?.message ?? e}`);
        }
      }
    }
    // Fall through — regenerate fresh.
    const fresh = await this.generate(payPeriodId, adminUpn);
    const cachedNow = pdfCache.get(payPeriodId);
    return { bytes: cachedNow?.bytes ?? Buffer.alloc(0), fileName: cachedNow?.fileName ?? `timesheets-${payPeriodId}.pdf` };
  }

  // CSV export — flat per-entry rows, no persistence. Same column shape
  // as `Timesheet * TimesheetEntry` join + the entry's parent's totals
  // duplicated on each row for spreadsheet pivots.
  async csv(payPeriodId: string): Promise<{ filename: string; csv: string }> {
    if (!this.prisma.isAvailable) {
      throw new Error('Postgres required to export CSV.');
    }
    const timesheets = await this.prisma.timesheet.findMany({
      where: { payPeriodId },
      include: { entries: { orderBy: [{ date: 'asc' }] } },
      orderBy: [{ workerName: 'asc' }],
    });
    const header = [
      'workerUpn', 'workerName', 'date', 'task',
      'timeIn', 'timeOut', 'hours',
      'timesheetStatus', 'week1Hours', 'week2Hours', 'totalHours',
      'overtimeHours', 'requiresAdminApproval',
      'submittedAt', 'approvedBy', 'approvedAt', 'rejectedReason',
    ];
    const lines = [header.join(',')];
    const esc = (v: any): string => {
      if (v == null) return '';
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    for (const t of timesheets) {
      if (t.entries.length === 0) {
        // Still emit a row so the worker's totals + status are
        // representable on a per-period summary pivot.
        lines.push([
          t.workerUpn, t.workerName, '', '', '', '', '',
          t.status, t.week1Hours, t.week2Hours, t.totalHours,
          weeklyOvertime(t), t.requiresAdminApproval,
          t.submittedAt?.toISOString() ?? '', t.approvedBy ?? '',
          t.approvedAt?.toISOString() ?? '', t.rejectedReason ?? '',
        ].map(esc).join(','));
        continue;
      }
      for (const e of t.entries) {
        lines.push([
          t.workerUpn, t.workerName, e.date, e.task,
          e.timeIn ?? '', e.timeOut ?? '', e.hours,
          t.status, t.week1Hours, t.week2Hours, t.totalHours,
          weeklyOvertime(t), t.requiresAdminApproval,
          t.submittedAt?.toISOString() ?? '', t.approvedBy ?? '',
          t.approvedAt?.toISOString() ?? '', t.rejectedReason ?? '',
        ].map(esc).join(','));
      }
    }
    return { filename: `timesheets-${payPeriodId}.csv`, csv: lines.join('\n') + '\n' };
  }

  // ---- PDF rendering -----------------------------------------------------
  //
  // One page per worker with a small per-page header (period + worker
  // name + status + totals) followed by the entries table. Page breaks
  // happen between workers; if a single worker has > 30 entries (rare,
  // would need a long bi-weekly period) we cascade onto another page.

  private buildPdf(period: PayPeriod, timesheets: any[]): Buffer {
    const { PAGE_W, PAGE_H, PAGE_MARGIN } = PDF_CONST;
    const TOP_Y = PAGE_H - PAGE_MARGIN;
    const LINE_H = 14;
    const NOTE_LH = 12;
    const NOTE_MAX_CHARS = 96;     // wrap width for notes at size 9
    const CONTENT_FLOOR = 196;     // entries/notes must stay above signatures
    const TASK_X = PAGE_MARGIN + 90;
    const TASK_MAX_CHARS = 40;     // ~fits the 210pt TASK column at size 10
    const ENTRY_FLOOR = 70;        // entries flow down to here before a page break

    type Page = { lines: PdfLine[]; rects: PdfRect[]; images: PdfImage[] };
    const pages: Page[] = [];

    const ACCENT_H = 1.4;
    const contactLine1 = `${BRAND.tagline}  ·  ${BRAND.address}`;
    const contactLine2 = `${BRAND.phone}  ·  ${BRAND.email}  ·  ${BRAND.website}`;

    // Letterhead — Skin Tyee logo on the LEFT + full band info/contact to its
    // right + an accent rule. Shown on every worker page (matches the emails).
    // Returns the y where page content should begin.
    const letterhead = (page: Page): number => {
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
    };

    // Cover sheet — fully centered: logo, band letterhead/contact, report title,
    // then the period summary.
    {
      const page: Page = { lines: [], rects: [], images: [] };
      const logoW = 130;
      const logoH = (logoW * TIMESHEET_LOGO.heightPx) / TIMESHEET_LOGO.widthPx;
      page.images.push(logoImage((PAGE_W - logoW) / 2, TOP_Y, logoW));
      let y = TOP_Y - logoH - 22;
      page.lines.push({ size: 18, y, center: true, text: BRAND.name });
      y -= 16;
      page.lines.push({ size: 9, y, center: true, text: contactLine1 });
      y -= 12;
      page.lines.push({ size: 9, y, center: true, text: contactLine2 });
      y -= 12;
      const rw = 380;
      page.rects.push({ x: (PAGE_W - rw) / 2, y, w: rw, h: ACCENT_H });
      y -= 30;
      page.lines.push({ size: 20, y, center: true, text: 'Timesheet Report' });
      y -= 24;
      page.lines.push({ size: 13, y, center: true, text: `Pay period ${period.label}` });
      y -= 17;
      page.lines.push({ size: 10, y, center: true, text: `Cutoff ${dayjs(period.endISO).format('ddd MMM D, YYYY')}  ·  Pay date ${dayjs(period.payDateISO).format('ddd MMM D, YYYY')}` });
      y -= 26;
      page.lines.push({ size: 11, y, center: true, text: `Workers: ${timesheets.length}` });
      y -= 15;
      const totalHours = timesheets.reduce((s, t) => s + (t.totalHours ?? 0), 0);
      page.lines.push({ size: 11, y, center: true, text: `Total hours: ${Math.round(totalHours * 100) / 100}` });
      y -= 15;
      const totalOT = timesheets.reduce((s, t) => s + weeklyOvertime(t), 0);
      page.lines.push({ size: 11, y, center: true, text: `Total OT: ${Math.round(totalOT * 100) / 100}` });
      y -= 26;
      page.lines.push({ size: 9, y, center: true, text: `Generated ${dayjs().format('YYYY-MM-DD HH:mm')}  ·  Skin Tyee Time Keeping` });
      pages.push(page);
    }

    // A fresh worker page: the letterhead (logo left + band info) then the
    // worker's name + meta. `meta` omitted for continuation pages.
    const newWorkerPage = (title: string, meta?: { t: any }): { page: Page; y: number } => {
      const page: Page = { lines: [], rects: [], images: [] };
      let y = letterhead(page);
      page.lines.push({ size: 14, y, text: title });
      y -= 16;
      if (meta) {
        const t = meta.t;
        page.lines.push({ size: 10, y, text: `${t.workerUpn}  ·  ${period.label}` });
        y -= 14;
        page.lines.push({ size: 10, y, text: `Status: ${(t.status as string).toUpperCase()} - Total ${t.totalHours}h - OT ${weeklyOvertime(t)}h - W1 ${t.week1Hours}h - W2 ${t.week2Hours}h` });
        y -= 18;
        if (t.submittedAt) {
          page.lines.push({ size: 9, y, text: `Submitted ${dayjs(t.submittedAt).format('YYYY-MM-DD HH:mm')}${t.approvedBy ? ` - Approved by ${t.approvedBy}` : ''}${t.rejectedReason ? ` - Rejected: ${t.rejectedReason}` : ''}` });
          y -= 16;
        }
      } else {
        y -= 2;
      }
      return { page, y };
    };

    // Employee/Contractor + Manager signature lines in a fixed bottom band.
    // The gap above each rule leaves space for a future e-signature image.
    const signatureBlock = (page: Page, t: any) => {
      const X = PAGE_MARGIN, sigW = 250, dateX = PAGE_MARGIN + 300, dateW = 120;
      page.lines.push({ size: 11, y: 176, text: 'Signatures' });
      page.lines.push({ size: 7.5, y: 162, text: 'Electronic signatures may replace handwritten signatures in future.' });
      // Employee / Contractor — Date auto-fills with the submission date.
      page.rects.push({ x: X, y: 124, w: sigW, h: 0.8 });
      page.rects.push({ x: dateX, y: 124, w: dateW, h: 0.8 });
      page.lines.push({ size: 9, y: 112, text: 'Employee / Contractor signature' });
      if (t.workerName) page.lines.push({ size: 8, y: 101, text: t.workerName });
      if (t.submittedAt) page.lines.push({ size: 9, x: dateX + 4, y: 128, text: dayjs(t.submittedAt).format('MMM D, YYYY') });
      page.lines.push({ size: 9, x: dateX, y: 112, text: 'Date' });
      // Manager — Date auto-fills with the approval date.
      page.rects.push({ x: X, y: 72, w: sigW, h: 0.8 });
      page.rects.push({ x: dateX, y: 72, w: dateW, h: 0.8 });
      page.lines.push({ size: 9, y: 60, text: 'Manager signature' });
      if (t.approvedBy) page.lines.push({ size: 8, y: 49, text: `Approved in app by ${t.approvedBy}` });
      if (t.approvedAt) page.lines.push({ size: 9, x: dateX + 4, y: 76, text: dayjs(t.approvedAt).format('MMM D, YYYY') });
      page.lines.push({ size: 9, x: dateX, y: 60, text: 'Date' });
    };

    // Table header (reused on every continuation page).
    const tableHeader = (page: Page, y: number): number => {
      page.lines.push({ size: 9, x: PAGE_MARGIN,       y, text: 'DATE' });
      page.lines.push({ size: 9, x: TASK_X,            y, text: 'TASK' });
      page.lines.push({ size: 9, x: PAGE_MARGIN + 300, y, text: 'IN' });
      page.lines.push({ size: 9, x: PAGE_MARGIN + 350, y, text: 'OUT' });
      page.lines.push({ size: 9, x: PAGE_MARGIN + 420, y, text: 'HOURS' });
      return y - 14;
    };

    // Per-worker pages. Entries flow across pages; the TASK column WRAPS (never
    // truncated) so long descriptions stay intact; notes + signatures follow.
    for (const t of timesheets) {
      // Sort by date (then time-in) so a day's entries are contiguous, and
      // pre-sum per day so days with multiple entries get a "Day total" line.
      const all = ((t.entries ?? []) as Array<any>)
        .slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.timeIn ?? '').localeCompare(String(b.timeIn ?? '')));
      const dayCount: Record<string, number> = {};
      const daySum: Record<string, number> = {};
      for (const e of all) {
        const d = String(e.date);
        dayCount[d] = (dayCount[d] ?? 0) + 1;
        daySum[d] = (daySum[d] ?? 0) + (Number(e.hours) || 0);
      }
      let { page, y } = newWorkerPage(t.workerName, { t });
      y = tableHeader(page, y);

      if (all.length === 0) {
        page.lines.push({ size: 10, y, text: '(no entries)' });
        y -= LINE_H;
      } else {
        for (let idx = 0; idx < all.length; idx++) {
          const e = all[idx];
          const taskLines = wrapText(String(e.task ?? ''), TASK_MAX_CHARS);
          if (taskLines.length === 0) taskLines.push('-');
          const rowH = taskLines.length * LINE_H;
          // Break to a continuation page if this (variable-height) row won't fit.
          if (y - rowH < ENTRY_FLOOR) {
            pages.push(page);
            ({ page, y } = newWorkerPage(`${t.workerName} (cont.)`));
            y = tableHeader(page, y);
          }
          page.lines.push({ size: 10, x: PAGE_MARGIN,       y, text: e.date });
          page.lines.push({ size: 10, x: PAGE_MARGIN + 300, y, text: e.timeIn ?? '-' });
          page.lines.push({ size: 10, x: PAGE_MARGIN + 350, y, text: e.timeOut ?? '-' });
          page.lines.push({ size: 10, x: PAGE_MARGIN + 420, y, text: String(e.hours) });
          taskLines.forEach((tl, i) => {
            page.lines.push({ size: 10, x: TASK_X, y: y - i * LINE_H, text: tl });
          });
          y -= rowH;

          // End of a day: show the day's total hours (when it had more than one
          // entry) and a horizontal rule to clearly separate days.
          const d = String(e.date);
          const lastOfDay = idx === all.length - 1 || String(all[idx + 1].date) !== d;
          if (lastOfDay) {
            if (dayCount[d] > 1) {
              if (y - LINE_H < ENTRY_FLOOR) {
                pages.push(page);
                ({ page, y } = newWorkerPage(`${t.workerName} (cont.)`));
                y = tableHeader(page, y);
              }
              page.lines.push({ size: 9, x: PAGE_MARGIN + 300, y, text: `Day total ${e.date}:` });
              page.lines.push({ size: 9, x: PAGE_MARGIN + 420, y, text: `${Math.round(daySum[d] * 100) / 100}h` });
              y -= LINE_H;
            }
            // Horizontal rule separating this day from the next (not trailing).
            if (idx !== all.length - 1) {
              if (y - 12 < ENTRY_FLOOR) {
                pages.push(page);
                ({ page, y } = newWorkerPage(`${t.workerName} (cont.)`));
                y = tableHeader(page, y);
              }
              y -= 4;
              page.rects.push({ x: PAGE_MARGIN, y, w: PAGE_W - PAGE_MARGIN * 2, h: 0.6 });
              y -= 9;
            }
          }
        }
      }

      // Notes — wrapped, never truncated; overflow flows to a fresh page.
      if (t.notes) {
        y -= 8;
        for (const ln of wrapText(`Notes: ${t.notes}`, NOTE_MAX_CHARS)) {
          if (y < CONTENT_FLOOR) {
            pages.push(page);
            ({ page, y } = newWorkerPage(`${t.workerName} (notes cont.)`));
          }
          page.lines.push({ size: 9, y, text: ln });
          y -= NOTE_LH;
        }
      }

      // The signature band sits at a fixed bottom position — give it clearance.
      if (y < CONTENT_FLOOR) {
        pages.push(page);
        ({ page, y } = newWorkerPage(`${t.workerName} (cont.)`));
      }
      signatureBlock(page, t);
      pages.push(page);
    }

    return buildPdf(pages);
  }
}
