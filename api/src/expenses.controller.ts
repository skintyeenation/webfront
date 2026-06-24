import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Logger,
  NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from './roles';
import { PrismaService } from './prisma.service';
import { ExpensesService } from './expenses.service';
import { ExpenseReportsService } from './expense-reports.service';
import { SageIntacctSyncService } from './sage-intacct/sage-intacct-sync.service';
import { OnboardingService } from './onboarding.service';
import { MailgunService } from './mailgun.service';
import { SettingsService } from './settings.service';
import { renderExpenseEventEmail, ExpenseEvent } from './email-template';
import { expensePeriodFor, recentExpensePeriods, EXPENSE_PERIOD_CONFIG } from './skintyee-expense-periods';
import { FX_TO_CAD, SUPPORTED_CURRENCIES, BASE_CURRENCY } from './expense-fx';

// Expenses module — mirrors TimeKeeping. Staff submit expense claims (a batch of
// receipt items) for reimbursement; finance (BandMember.bandGroups includes
// 'finance') or admins approve. Lifecycle: draft → submitted → approved |
// rejected (+ reopen). Receipts are AI-prefilled by Claude (ExpensesService).

function callerUpn(req: any): string {
  return ((req?.headers?.['x-upn'] as string) || '').toLowerCase();
}
function callerRole(req: any): string {
  return (req?.headers?.['x-role'] as string) || 'public';
}

@Controller('expenses')
export class ExpensesController {
  private readonly log = new Logger(ExpensesController.name);

  constructor(
    private readonly svc: ExpensesService,
    private readonly reports: ExpenseReportsService,
    private readonly prisma: PrismaService,
    private readonly people: OnboardingService,
    private readonly mailgun: MailgunService,
    private readonly settings: SettingsService,
    private readonly intacct: SageIntacctSyncService,
  ) {}

  // Approvers = admins OR members of the 'finance' Entra group.
  private async assertCanApprove(req: any): Promise<void> {
    if (callerRole(req) === 'admin') return;
    const upn = callerUpn(req);
    if (this.prisma.isAvailable && upn) {
      const me = await this.prisma.bandMember.findUnique({ where: { upn }, select: { bandGroups: true } });
      const groups = (me?.bandGroups ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (groups.includes('finance')) return;
    }
    throw new ForbiddenException('Approving expenses requires the Finance group (or admin).');
  }

  // Enabled BandMembers whose bandGroups include any of `slugs` (finance + admins).
  private async groupEmails(slugs: string[]): Promise<string[]> {
    if (!this.prisma.isAvailable) return [];
    const members = await this.prisma.bandMember.findMany({ where: { enabled: true }, select: { email: true, bandGroups: true } });
    return members
      .filter((m) => (m.bandGroups ?? '').split(',').map((s) => s.trim()).some((g) => slugs.includes(g)))
      .map((m) => m.email)
      .filter((e): e is string => !!e);
  }

  // Notify the submitter + finance/admins of a claim lifecycle event. Best-effort
  // — a mail failure never fails the request. Gated by the expenseEvents toggle.
  private async emailExpenseEvent(event: ExpenseEvent, claim: any, opts?: { actor?: string; reason?: string }): Promise<void> {
    try {
      if (!(await this.settings.isEnabled('expenseEvents'))) return;
      const others = event === 'edited'
        ? (opts?.actor ? [opts.actor] : [])
        : await this.groupEmails(['finance', 'admins']);
      const recipients = [...new Set([claim.submitterUpn, ...others].filter(Boolean))];
      if (recipients.length === 0) return;
      const cur = claim.currency ?? 'CAD';
      const m = (n: number) => `${cur === 'CAD' ? '$' : cur + ' '}${(Number(n) || 0).toFixed(2)}`;
      const lines = (claim.items ?? []).map((it: any) =>
        `${it.vendor || 'Unknown vendor'} — ${m(it.amount)}${it.tagSlug ? ` (${it.tagSlug})` : ''}${it.date ? ` · ${it.date}` : ''}`);
      const mail = renderExpenseEventEmail({
        event,
        submitterName: claim.submitterName,
        periodLabel: expensePeriodFor(claim.payPeriodId).label,
        status: claim.status,
        totalAmount: claim.totalAmount ?? 0,
        currency: cur,
        receiptCount: (claim.items ?? []).length,
        lines,
        actor: opts?.actor,
        reason: opts?.reason,
      });
      await this.mailgun.sendBulk({ recipients, subject: mail.subject, html: mail.html, text: mail.text });
    } catch (e: any) {
      this.log.warn(`expense ${event} email failed: ${e?.message ?? e}`);
    }
  }

  // ---- Eligibility + periods ---------------------------------------------
  @Get('me/eligible') @Roles('member', 'staff', 'admin')
  async meEligible(@Req() req: any) {
    const upn = callerUpn(req);
    return { upn, eligible: await this.people.isExpenseEligible(upn) };
  }

  @Get('eligible-people') @Roles('admin')
  eligiblePeople() {
    return this.people.listExpenseWorkers();
  }

  @Get('periods') @Roles('member', 'staff', 'admin')
  periods(@Query('count') count?: string) {
    const n = Math.min(24, Math.max(1, parseInt(count ?? '12', 10) || 12));
    return {
      current: expensePeriodFor(),
      recent: recentExpensePeriods(n),
      config: EXPENSE_PERIOD_CONFIG,
      // Currency support — base + the fixed FX table so the app can show foreign
      // receipts in their own currency and convert claim totals to CAD live.
      fx: { base: BASE_CURRENCY, supported: SUPPORTED_CURRENCIES, toCad: FX_TO_CAD },
    };
  }

  // ---- Tags (editable expense-category catalog) --------------------------
  @Get('tags') @Roles('member', 'staff', 'admin')
  tags(@Query('active') active?: string) {
    return this.svc.listTags(active === '1' || active === 'true');
  }

  @Post('tags') @Roles('admin')
  createTag(@Body() b: { slug?: string; label?: string; glAccount?: string }) {
    if (!b?.slug || !b?.label) throw new BadRequestException('slug + label required');
    return this.svc.createTag(b.slug, b.label, b.glAccount);
  }

  @Patch('tags/:slug') @Roles('admin')
  updateTag(@Param('slug') slug: string, @Body() b: { label?: string; active?: boolean; glAccount?: string | null }) {
    return this.svc.updateTag(slug, b ?? {});
  }

  @Delete('tags/:slug') @Roles('admin') @HttpCode(204)
  async deleteTag(@Param('slug') slug: string) {
    await this.svc.deleteTag(slug);
  }

  // ---- Reports (PDF/CSV with band letterhead — like timesheets) ----------
  @Get('reports') @Roles('staff', 'admin')
  async listReports(@Req() req: any, @Query('count') count?: string) {
    await this.assertCanApprove(req);
    return this.reports.list(Math.max(1, Math.min(24, Number(count) || 12)));
  }

  @Post('reports/:periodId/generate') @Roles('staff', 'admin')
  async generateReport(@Param('periodId') periodId: string, @Req() req: any) {
    await this.assertCanApprove(req);
    return this.reports.generate(periodId);
  }

  @Get('reports/:periodId/pdf') @Roles('staff', 'admin')
  async reportPdf(@Param('periodId') periodId: string, @Query('download') download: string | undefined, @Req() req: any, @Res() res: any) {
    await this.assertCanApprove(req);
    const { bytes, fileName } = await this.reports.getPeriodPdf(periodId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.send(bytes);
  }

  // Separate "receipts & line items by user" PDF (general summary untouched).
  @Get('reports/:periodId/by-user/pdf') @Roles('staff', 'admin')
  async reportByUserPdf(@Param('periodId') periodId: string, @Query('download') download: string | undefined, @Req() req: any, @Res() res: any) {
    await this.assertCanApprove(req);
    const { bytes, fileName } = await this.reports.getByUserPdf(periodId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.send(bytes);
  }

  @Get('reports/:periodId/csv') @Roles('staff', 'admin')
  async reportCsv(@Param('periodId') periodId: string, @Req() req: any, @Res() res: any) {
    await this.assertCanApprove(req);
    const { filename, csv } = await this.reports.csv(periodId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // Single-claim printout — the submitter (own claim) or an approver.
  @Get('claims/:id/pdf') @Roles('staff', 'admin')
  async claimPdf(@Param('id') id: string, @Query('download') download: string | undefined, @Res() res: any) {
    const { bytes, fileName } = await this.reports.getClaimPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.send(bytes);
  }

  // ---- Claims ------------------------------------------------------------
  @Get('claims') @Roles('staff', 'admin')
  myClaims(@Req() req: any, @Query('period') period?: string) {
    return this.svc.myClaims(callerUpn(req), period);
  }

  // Idempotent: returns (or creates) the caller's draft claim for the period.
  @Post('claims/start') @Roles('staff', 'admin')
  async start(@Req() req: any, @Body() b: { periodId?: string }) {
    const upn = callerUpn(req);
    if (!(await this.people.isExpenseEligible(upn))) {
      throw new ForbiddenException('You are not enabled for Expenses. Ask an admin to enable it on your People record.');
    }
    const me = this.prisma.isAvailable ? await this.prisma.bandMember.findUnique({ where: { upn }, select: { name: true, email: true } }) : null;
    return this.svc.startClaim({ submitterUpn: upn, submitterName: me?.name ?? upn, submitterEmail: me?.email ?? upn, periodId: b?.periodId });
  }

  @Patch('claims/:id') @Roles('staff', 'admin')
  updateClaim(@Param('id') id: string, @Body() b: { title?: string; notes?: string; currency?: string }) {
    return this.svc.updateClaim(id, b ?? {});
  }

  @Post('claims/:id/submit') @Roles('staff', 'admin')
  async submit(@Param('id') id: string) {
    const claim = await this.svc.submit(id);
    await this.emailExpenseEvent('submitted', claim);
    return claim;
  }

  @Get('claims/all') @Roles('staff', 'admin')
  async allClaims(@Req() req: any, @Query('period') period?: string, @Query('status') status?: string) {
    await this.assertCanApprove(req);
    return this.svc.allClaims(period, status);
  }

  @Post('claims/:id/approve') @Roles('staff', 'admin')
  async approve(@Param('id') id: string, @Req() req: any) {
    await this.assertCanApprove(req);
    const claim = await this.svc.approve(id, callerUpn(req));
    await this.emailExpenseEvent('approved', claim, { actor: callerUpn(req) });
    // STUB: push the approved claim to Sage Intacct (no-op stub, best-effort —
    // the service swallows its own errors, so this never fails the approval).
    await this.intacct.syncExpenseClaim(claim.id);
    return claim;
  }

  @Post('claims/:id/reject') @Roles('staff', 'admin')
  async reject(@Param('id') id: string, @Req() req: any, @Body() b: { reason?: string }) {
    await this.assertCanApprove(req);
    const claim = await this.svc.reject(id, b?.reason, callerUpn(req));
    await this.emailExpenseEvent('rejected', claim, { actor: callerUpn(req), reason: b?.reason });
    return claim;
  }

  @Post('claims/:id/reopen') @Roles('admin')
  reopen(@Param('id') id: string) {
    return this.svc.reopen(id);
  }

  @Get('claims/admin/:id') @Roles('staff', 'admin')
  async adminGet(@Param('id') id: string, @Req() req: any) {
    await this.assertCanApprove(req);
    return this.svc.getClaim(id);
  }

  @Patch('claims/admin/:id') @Roles('staff', 'admin')
  async adminUpdate(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    await this.assertCanApprove(req);
    const claim = await this.svc.updateClaim(id, b ?? {});
    await this.emailExpenseEvent('edited', claim, { actor: callerUpn(req) });
    return claim;
  }

  @Delete('claims/:id') @Roles('admin') @HttpCode(204)
  async deleteClaim(@Param('id') id: string) {
    await this.svc.deleteClaim(id);
  }

  // ---- Items (receipts) --------------------------------------------------
  // multipart: `file` part (the receipt image/PDF, optional) + `payload` JSON.
  @Post('claims/:id/items') @Roles('staff', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  async addItem(@Param('id') id: string, @UploadedFile() file: any, @Body() body: any) {
    let fields: any = {};
    try { fields = body?.payload ? JSON.parse(body.payload) : {}; } catch { fields = {}; }
    const f = file ? { fileName: file.originalname, mimeType: file.mimetype, bytes: file.buffer } : null;
    return this.svc.addItem(id, f, {
      date: fields.date, vendor: fields.vendor,
      amount: typeof fields.amount === 'number' ? fields.amount : (fields.amount ? Number(fields.amount) : undefined),
      tagSlug: fields.tagSlug, description: fields.description,
    });
  }

  @Patch('items/:id') @Roles('staff', 'admin')
  updateItem(@Param('id') id: string, @Body() b: any) {
    return this.svc.updateItem(id, {
      date: b?.date, vendor: b?.vendor,
      amount: typeof b?.amount === 'number' ? b.amount : (b?.amount ? Number(b.amount) : undefined),
      taxAmount: b?.taxAmount === undefined ? undefined : (b?.taxAmount === null ? null : Number(b.taxAmount)),
      currency: b?.currency,
      tagSlug: b?.tagSlug, description: b?.description,
      lineItems: Array.isArray(b?.lineItems) ? b.lineItems : undefined,
    });
  }

  @Delete('items/:id') @Roles('staff', 'admin') @HttpCode(204)
  async deleteItem(@Param('id') id: string) {
    await this.svc.deleteItem(id);
  }

  // Redirect to the receipt's (re-issued) storage URL.
  @Get('items/:id/receipt') @Roles('member', 'staff', 'admin')
  async receipt(@Param('id') id: string, @Req() req: any) {
    const r = await this.svc.getReceipt(id);
    if (!r) throw new NotFoundException('No receipt on this item.');
    const res = req.res;
    res.redirect(r.url);
  }

  // Stream the raw receipt bytes (api/ reads them from storage) so the app can
  // render an authenticated thumbnail/preview without a presigned URL.
  @Get('items/:id/receipt/raw') @Roles('member', 'staff', 'admin')
  async receiptRaw(@Param('id') id: string, @Res() res: any) {
    const r = await this.svc.getReceiptBytes(id);
    if (!r) throw new NotFoundException('No receipt on this item (it may have been removed, or its file was lost on a dev restart).');
    res.setHeader('Content-Type', r.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${r.fileName}"`);
    res.setHeader('Content-Length', String(r.bytes.length));
    res.send(r.bytes);
  }
}
