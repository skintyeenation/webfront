// Sage Intacct sync — client contract (STUBBED).
//
// On approval, a timesheet or expense claim is pushed into Sage Intacct via its
// XML Web Services / Web Services Gateway. This file is the contract the sync
// service depends on; the concrete is bound in app.module.ts via a factory
// keyed on SAGE_INTACCT_DRIVER (mirrors the DOCUMENT_STORAGE pattern in
// storage/storage.module.ts). Phase-1 ships only the StubSageIntacctClient — a
// no-op that logs the mapped payload and returns a canned key. A future live
// client (driver='live') would post the XML envelopes below over HTTPS.
//
// See app/STUBS.md §2f for the replacement plan.

// DI token the sync service @Inject()s — bound to a concrete client at boot.
export const SAGE_INTACCT_CLIENT = Symbol.for('SageIntacctClient');

// 'stub' = the logging no-op shipped today; 'live' = a future real XML client.
export type SageIntacctDriver = 'stub' | 'live';

// ---- Intacct DTOs ----------------------------------------------------------
// App rows are mapped into these before handing them to the client. They mirror
// the Intacct XML object shapes 1:1 so a live client can serialise them
// directly without a second mapping layer.

/** One line of an Intacct timesheet → XML <TIMESHEETENTRY>. */
export interface IntacctTimesheetLine {
  entryDate: string; // YYYY-MM-DD  → ENTRYDATE
  qty: number;       // hours       → QTY
  description?: string; // task     → DESCRIPTION
}

/** A timesheet header + lines → XML <TIMESHEET> create. */
export interface IntacctTimesheet {
  employeeId: string;  // workerUpn  → EMPLOYEEID
  employeeName?: string;
  beginDate: string;   // pay-period id (cutoff Friday) → BEGINDATE
  description?: string;
  state?: string;      // posting state, e.g. 'Submitted' → STATE
  lines: IntacctTimesheetLine[]; // → TIMESHEETITEMS / TIMESHEETENTRY
}

/** One line of an Intacct expense report → XML <EEXPENSESITEM>. */
export interface IntacctExpenseLine {
  expenseDate?: string; // receipt date → EXPENSEDATE
  glAccount?: string;   // from ExpenseTag.glAccount → GLACCOUNTNO
  amount: number;       // → AMOUNT
  trxAmount?: number;   // tax-inclusive transaction amount
  currency?: string;    // → CURRENCY
  memo?: string;        // vendor / description → MEMO
}

/** An expense report header + lines → XML <EEXPENSES> create. */
export interface IntacctExpenseReport {
  employeeId: string;  // submitterUpn → EMPLOYEEID
  employeeName?: string;
  expenseReportDate: string; // pay-period id → WHENCREATED
  description?: string;
  baseCurrency?: string;     // → BASECURR
  state?: string;            // 'Submitted' → STATE
  lines: IntacctExpenseLine[]; // → EEXPENSESITEMS / EEXPENSESITEM
}

/** Outcome of a single push. ok=false never throws — the caller logs it. */
export interface SyncResult {
  ok: boolean;
  /** Intacct's record key for the created object (RECORDNO / synthetic in stub). */
  intacctKey?: string;
  message?: string;
}

export interface SageIntacctClient {
  readonly driver: SageIntacctDriver;
  /** True once the live driver has the env it needs to talk to Intacct. The
   *  stub is always false (it can't reach a real company). */
  readonly configured: boolean;

  /** Open (or reuse) an XML session and return a session id. The stub returns
   *  a canned id without any network call. */
  ensureSession(): Promise<string>;

  /** Create a timesheet in Intacct. */
  submitTimesheet(ts: IntacctTimesheet): Promise<SyncResult>;

  /** Create an expense report in Intacct. */
  submitExpenseReport(er: IntacctExpenseReport): Promise<SyncResult>;
}
