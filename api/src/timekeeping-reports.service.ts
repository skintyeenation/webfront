import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DOCUMENT_STORAGE } from './storage/storage.module';
import { DocumentStorageAdapter } from './storage/document-storage';
import { recentPayPeriods, payPeriodFor, PayPeriod } from './skintyee-pay-periods';
import { buildPdf, PdfLine, PDF_CONST } from './pdf-builder';
import dayjs from 'dayjs';

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
          t.overtimeHours, t.requiresAdminApproval,
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
          t.overtimeHours, t.requiresAdminApproval,
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
    const { PAGE_H, PAGE_MARGIN } = PDF_CONST;
    const TOP_Y = PAGE_H - PAGE_MARGIN;
    const LINE_H = 14;
    const ENTRIES_PER_PAGE = 30;

    const pages: { lines: PdfLine[] }[] = [];

    // Cover sheet
    {
      const cover: PdfLine[] = [];
      let y = TOP_Y;
      cover.push({ size: 22, y, text: `Skin Tyee Timesheet Report` });
      y -= 28;
      cover.push({ size: 14, y, text: `Pay period ${period.label}` });
      y -= 18;
      cover.push({ size: 11, y, text: `Cutoff ${dayjs(period.endISO).format('ddd MMM D, YYYY')} - Pay date ${dayjs(period.payDateISO).format('ddd MMM D, YYYY')}` });
      y -= 24;
      cover.push({ size: 12, y, text: `Workers: ${timesheets.length}` });
      y -= 16;
      const totalHours = timesheets.reduce((s, t) => s + (t.totalHours ?? 0), 0);
      cover.push({ size: 12, y, text: `Total hours: ${Math.round(totalHours * 100) / 100}` });
      y -= 16;
      const totalOT = timesheets.reduce((s, t) => s + (t.overtimeHours ?? 0), 0);
      cover.push({ size: 12, y, text: `Total OT: ${Math.round(totalOT * 100) / 100}` });
      y -= 24;
      cover.push({ size: 10, y, text: `Generated ${dayjs().format('YYYY-MM-DD HH:mm')} - Skin Tyee Time Keeping` });
      pages.push({ lines: cover });
    }

    // Per-worker pages
    for (const t of timesheets) {
      const all = t.entries as Array<any>;
      const chunks: any[][] = [];
      for (let i = 0; i < Math.max(1, all.length); i += ENTRIES_PER_PAGE) {
        chunks.push(all.slice(i, i + ENTRIES_PER_PAGE));
      }
      chunks.forEach((entries, idx) => {
        const lines: PdfLine[] = [];
        let y = TOP_Y;
        lines.push({ size: 16, y, text: `${t.workerName}${idx > 0 ? ` (cont. ${idx + 1})` : ''}` });
        y -= 18;
        lines.push({ size: 10, y, text: `${t.workerUpn} - ${period.label}` });
        y -= 16;
        lines.push({ size: 10, y, text: `Status: ${(t.status as string).toUpperCase()} - Total ${t.totalHours}h - OT ${t.overtimeHours}h - W1 ${t.week1Hours}h - W2 ${t.week2Hours}h` });
        y -= 22;
        if (t.submittedAt) {
          lines.push({ size: 9, y, text: `Submitted ${dayjs(t.submittedAt).format('YYYY-MM-DD HH:mm')}${t.approvedBy ? ` - Approved by ${t.approvedBy}` : ''}${t.rejectedReason ? ` - Rejected: ${t.rejectedReason}` : ''}` });
          y -= 18;
        }
        // Table header
        lines.push({ size: 9, x: PAGE_MARGIN,      y, text: `DATE` });
        lines.push({ size: 9, x: PAGE_MARGIN + 90, y, text: `TASK` });
        lines.push({ size: 9, x: PAGE_MARGIN + 300, y, text: `IN` });
        lines.push({ size: 9, x: PAGE_MARGIN + 350, y, text: `OUT` });
        lines.push({ size: 9, x: PAGE_MARGIN + 420, y, text: `HOURS` });
        y -= 14;
        if (entries.length === 0) {
          lines.push({ size: 10, y, text: '(no entries)' });
        } else {
          for (const e of entries) {
            lines.push({ size: 10, x: PAGE_MARGIN,       y, text: e.date });
            lines.push({ size: 10, x: PAGE_MARGIN + 90,  y, text: (e.task ?? '').slice(0, 40) });
            lines.push({ size: 10, x: PAGE_MARGIN + 300, y, text: e.timeIn ?? '-' });
            lines.push({ size: 10, x: PAGE_MARGIN + 350, y, text: e.timeOut ?? '-' });
            lines.push({ size: 10, x: PAGE_MARGIN + 420, y, text: String(e.hours) });
            y -= LINE_H;
          }
        }
        // Footer note
        if (t.notes && idx === chunks.length - 1) {
          y -= 10;
          lines.push({ size: 9, y, text: `Notes: ${t.notes.slice(0, 200)}` });
        }
        pages.push({ lines });
      });
    }

    return buildPdf(pages);
  }
}
