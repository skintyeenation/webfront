import { Injectable, Logger } from '@nestjs/common';
import {
  IntacctExpenseReport,
  IntacctTimesheet,
  SageIntacctClient,
  SageIntacctDriver,
  SyncResult,
} from './sage-intacct-client';

// Stubbed Sage Intacct client — NO real HTTP. It logs the mapped Intacct
// payload and returns a canned record key so the approval side-effect is
// observable end-to-end without a live Intacct company. Mirrors the repo's
// other mock services (anthropic.service.ts's graceful no-op when unconfigured).
//
// A future LIVE client (driver='live') would XML-POST to the Intacct Web
// Services Gateway over HTTPS and needs these env vars (XML session auth):
//
//   SAGE_INTACCT_DRIVER           'stub' (default) | 'live'
//   SAGE_INTACCT_SENDER_ID        Web Services sender id (partner-level)
//   SAGE_INTACCT_SENDER_PASSWORD  Web Services sender password
//   SAGE_INTACCT_COMPANY_ID       target company id
//   SAGE_INTACCT_USER_ID          API/integration user login
//   SAGE_INTACCT_USER_PASSWORD    API/integration user password
//
// In prod these would be Azure Container App secrets, like ANTHROPIC_API_KEY.

@Injectable()
export class StubSageIntacctClient implements SageIntacctClient {
  readonly driver: SageIntacctDriver = 'stub';
  // The stub can't reach a real Intacct company — always unconfigured.
  readonly configured = false;

  private readonly log = new Logger('SageIntacct(stub)');
  private seq = 0;

  async ensureSession(): Promise<string> {
    // No XML <getAPISession> round-trip — just hand back a canned session id.
    return 'SESSION-STUB';
  }

  async submitTimesheet(ts: IntacctTimesheet): Promise<SyncResult> {
    await this.ensureSession();
    const intacctKey = `TS-STUB-${++this.seq}`;
    this.log.log(
      `TIMESHEET → ${intacctKey} employee=${ts.employeeId} begin=${ts.beginDate} ` +
        `lines=${ts.lines.length} qty=${ts.lines.reduce((s, l) => s + l.qty, 0)} ` +
        `state=${ts.state ?? 'Submitted'}`,
    );
    // Full mapped payload at debug level so it never floods normal logs.
    this.log.debug(JSON.stringify(ts));
    return { ok: true, intacctKey, message: 'stubbed — not posted to Intacct' };
  }

  async submitExpenseReport(er: IntacctExpenseReport): Promise<SyncResult> {
    await this.ensureSession();
    const intacctKey = `EE-STUB-${++this.seq}`;
    this.log.log(
      `EEXPENSES → ${intacctKey} employee=${er.employeeId} date=${er.expenseReportDate} ` +
        `lines=${er.lines.length} amount=${er.lines.reduce((s, l) => s + l.amount, 0)} ` +
        `base=${er.baseCurrency ?? 'CAD'} state=${er.state ?? 'Submitted'}`,
    );
    this.log.debug(JSON.stringify(er));
    return { ok: true, intacctKey, message: 'stubbed — not posted to Intacct' };
  }
}
