import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IntacctExpenseReport,
  IntacctTimesheet,
  SAGE_INTACCT_CLIENT,
  SageIntacctClient,
  SyncResult,
} from './sage-intacct-client';

// Pushes an APPROVED timesheet / expense claim into Sage Intacct. Invoked from
// the approve handlers (TimeKeepingController + ExpensesController) as a
// best-effort side-effect — like emailTimesheetEvent, a failure here NEVER
// fails the approval. Loads the row + its lines from Prisma, maps app→Intacct
// DTOs, hands them to the injected client (the stub today), and logs the result.
//
// The app→Intacct mapping lives HERE so a live client just serialises the DTOs:
//   Timesheet.workerUpn   → IntacctTimesheet.employeeId
//   TimesheetEntry        → IntacctTimesheetLine (date/hours/task)
//   ExpenseClaim.submitterUpn → IntacctExpenseReport.employeeId
//   ExpenseItem           → IntacctExpenseLine (date/amount/currency/memo)
//   ExpenseItem.tagSlug   → ExpenseTag.glAccount → IntacctExpenseLine.glAccount

@Injectable()
export class SageIntacctSyncService {
  private readonly log = new Logger(SageIntacctSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SAGE_INTACCT_CLIENT) private readonly client: SageIntacctClient,
  ) {}

  /** Sync an approved timesheet by id or by an already-loaded row. Best-effort. */
  async syncTimesheet(timesheetIdOrRow: string | { id: string }): Promise<SyncResult | null> {
    if (!this.prisma.isAvailable) return null;
    try {
      const id = typeof timesheetIdOrRow === 'string' ? timesheetIdOrRow : timesheetIdOrRow.id;
      const row = await this.prisma.timesheet.findUnique({
        where: { id },
        include: { entries: { orderBy: { date: 'asc' } } },
      });
      if (!row) {
        this.log.warn(`syncTimesheet: timesheet ${id} not found — skipping`);
        return null;
      }
      const dto: IntacctTimesheet = {
        employeeId: row.workerUpn,
        employeeName: row.workerName,
        beginDate: row.payPeriodId,
        description: `Timesheet ${row.payPeriodId} — ${row.workerName}`,
        state: 'Submitted',
        lines: row.entries.map((e) => ({
          entryDate: e.date,
          qty: e.hours,
          description: e.task,
        })),
      };
      const res = await this.client.submitTimesheet(dto);
      this.log.log(
        `syncTimesheet ${id} via ${this.client.driver}: ${res.ok ? 'ok' : 'failed'}` +
          (res.intacctKey ? ` key=${res.intacctKey}` : '') +
          (res.message ? ` (${res.message})` : ''),
      );
      return res;
    } catch (e: any) {
      // Best-effort: never propagate to the approval request.
      this.log.warn(`syncTimesheet failed: ${e?.message ?? e}`);
      return null;
    }
  }

  /** Sync an approved expense claim by id or row. Best-effort. */
  async syncExpenseClaim(claimIdOrRow: string | { id: string }): Promise<SyncResult | null> {
    if (!this.prisma.isAvailable) return null;
    try {
      const id = typeof claimIdOrRow === 'string' ? claimIdOrRow : claimIdOrRow.id;
      const row = await this.prisma.expenseClaim.findUnique({
        where: { id },
        include: { items: { orderBy: { date: 'asc' } } },
      });
      if (!row) {
        this.log.warn(`syncExpenseClaim: claim ${id} not found — skipping`);
        return null;
      }
      // tagSlug → glAccount: one lookup of the tags referenced by this claim.
      const slugs = [...new Set(row.items.map((i) => i.tagSlug).filter((s): s is string => !!s))];
      const tags = slugs.length
        ? await this.prisma.expenseTag.findMany({ where: { slug: { in: slugs } }, select: { slug: true, glAccount: true } })
        : [];
      const glBySlug = new Map(tags.map((t) => [t.slug, t.glAccount ?? undefined]));

      const dto: IntacctExpenseReport = {
        employeeId: row.submitterUpn,
        employeeName: row.submitterName,
        expenseReportDate: row.payPeriodId,
        description: row.title ?? `Expense claim ${row.payPeriodId} — ${row.submitterName}`,
        baseCurrency: row.currency,
        state: 'Submitted',
        lines: row.items.map((it) => ({
          expenseDate: it.date ?? undefined,
          glAccount: it.tagSlug ? glBySlug.get(it.tagSlug) : undefined,
          amount: it.amount,
          trxAmount: it.taxAmount != null ? it.amount + it.taxAmount : undefined,
          currency: it.currency ?? row.currency,
          memo: [it.vendor, it.description].filter(Boolean).join(' — ') || undefined,
        })),
      };
      const res = await this.client.submitExpenseReport(dto);
      this.log.log(
        `syncExpenseClaim ${id} via ${this.client.driver}: ${res.ok ? 'ok' : 'failed'}` +
          (res.intacctKey ? ` key=${res.intacctKey}` : '') +
          (res.message ? ` (${res.message})` : ''),
      );
      return res;
    } catch (e: any) {
      this.log.warn(`syncExpenseClaim failed: ${e?.message ?? e}`);
      return null;
    }
  }
}
