import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AnthropicService, ReceiptExtraction } from './anthropic.service';
import { DOCUMENT_STORAGE } from './storage/storage.module';
import { DocumentStorageAdapter } from './storage/document-storage';
import { EXPENSE_TAG_SEED } from './expense-tags.seed';
import { expensePeriodFor } from './skintyee-expense-periods';

// Data layer for the Expenses module — claims (per submitter+period), receipt
// items (uploaded via the pluggable storage adapter + AI-prefilled by Claude),
// and the editable tag catalog. Mirrors documents.service.ts (storage) +
// timekeeping's claim lifecycle. Postgres-backed; throws when Prisma is down.

const round2 = (n: number) => Math.round(n * 100) / 100;

// Friendly stored receipt filename: "<date>_<submitter>_<vendor>.<ext>".
// Each segment is slugified; missing parts are dropped. Keeps the original
// extension so the file still opens with the right viewer.
function receiptFileName(opts: { date?: string | null; submitter?: string | null; vendor?: string | null; originalName: string }): string {
  const slug = (s?: string | null) => (s ?? '').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const ext = (opts.originalName.match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase();
  const parts = [slug(opts.date), slug(opts.submitter), slug(opts.vendor)].filter(Boolean);
  const base = parts.length ? parts.join('_') : 'receipt';
  return `${base}.${ext}`;
}

@Injectable()
export class ExpensesService implements OnModuleInit {
  private readonly log = new Logger(ExpensesService.name);
  // Self-heal guard: if the boot seed didn't run (e.g. the table wasn't ready
  // yet at onModuleInit), seed once on the first empty tag read so a fresh DB
  // recovers without a manual step. One attempt per process.
  private autoSeedTried = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageAdapter,
  ) {}

  async onModuleInit() {
    await this.seedTagsIfNeeded();
  }

  private requireDb() {
    if (!this.prisma.isAvailable) {
      throw new NotFoundException('Prisma not connected — set DATABASE_URL and re-deploy');
    }
  }

  // ---- Tags (the editable expense-category catalog) ----------------------
  // Idempotent boot seed. On an empty table we insert the full standard
  // catalog; on a populated one we leave admin customisations alone but
  // backfill the GL account onto any standard tag that predates the
  // glAccount field (only where it's still null — never clobbers an edit).
  private async seedTagsIfNeeded() {
    if (!this.prisma.isAvailable) return;
    try {
      const count = await this.prisma.expenseTag.count();
      if (count === 0) {
        await this.prisma.expenseTag.createMany({ data: EXPENSE_TAG_SEED, skipDuplicates: true });
        this.log.log(`seeded ${EXPENSE_TAG_SEED.length} expense tags`);
        return;
      }
      let filled = 0;
      for (const t of EXPENSE_TAG_SEED) {
        const r = await this.prisma.expenseTag.updateMany({
          where: { slug: t.slug, glAccount: null },
          data: { glAccount: t.glAccount },
        });
        filled += r.count;
      }
      if (filled) this.log.log(`backfilled GL account on ${filled} expense tags`);
    } catch (e: any) {
      this.log.warn(`expense tag seed skipped: ${e?.message ?? e}`);
    }
  }

  async listTags(activeOnly = false) {
    this.requireDb();
    const query = () => this.prisma.expenseTag.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { label: 'asc' },
    });
    let rows = await query();
    // Empty catalog on first read → the boot seed never landed; seed now.
    if (rows.length === 0 && !this.autoSeedTried) {
      this.autoSeedTried = true;
      await this.seedTagsIfNeeded();
      rows = await query();
    }
    return rows;
  }

  async createTag(slug: string, label: string, glAccount?: string) {
    this.requireDb();
    return this.prisma.expenseTag.create({ data: { slug, label, glAccount: glAccount || null } });
  }

  async updateTag(slug: string, patch: { label?: string; active?: boolean; glAccount?: string | null }) {
    this.requireDb();
    return this.prisma.expenseTag.update({
      where: { slug },
      data: {
        label: patch.label,
        active: patch.active,
        glAccount: patch.glAccount === undefined ? undefined : (patch.glAccount || null),
      },
    });
  }

  async deleteTag(slug: string) {
    this.requireDb();
    await this.prisma.expenseTag.delete({ where: { slug } }).catch(() => null);
  }

  // ---- Claims ------------------------------------------------------------
  private claimId(upn: string, periodId: string) {
    return `${upn.toLowerCase()}:${periodId}`;
  }

  /** Worker view — their claim for a period + recent history. */
  async myClaims(upn: string, periodId?: string) {
    this.requireDb();
    const period = expensePeriodFor(periodId);
    const u = upn.toLowerCase();
    const current = await this.prisma.expenseClaim.findUnique({
      where: { id: this.claimId(u, period.id) },
      include: { items: { orderBy: { date: 'asc' } } },
    });
    const history = await this.prisma.expenseClaim.findMany({
      where: { submitterUpn: u },
      orderBy: { payPeriodId: 'desc' },
      take: 6,
      include: { items: true },
    });
    return { period, current, history };
  }

  /** Idempotent: create or return the draft claim for (submitter, period). */
  async startClaim(input: { submitterUpn: string; submitterName: string; submitterEmail?: string; periodId?: string }) {
    this.requireDb();
    const period = expensePeriodFor(input.periodId);
    const u = input.submitterUpn.toLowerCase();
    const id = this.claimId(u, period.id);
    const existing = await this.prisma.expenseClaim.findUnique({ where: { id }, include: { items: true } });
    if (existing) return existing;
    return this.prisma.expenseClaim.create({
      data: { id, submitterUpn: u, submitterName: input.submitterName, submitterEmail: input.submitterEmail ?? null, payPeriodId: period.id, status: 'draft' },
      include: { items: true },
    });
  }

  async getClaim(id: string) {
    this.requireDb();
    const c = await this.prisma.expenseClaim.findUnique({ where: { id }, include: { items: { orderBy: { date: 'asc' } } } });
    if (!c) throw new NotFoundException('Expense claim not found');
    return c;
  }

  async updateClaim(id: string, patch: { title?: string | null; notes?: string | null; currency?: string }) {
    this.requireDb();
    const c = await this.getClaim(id);
    if (c.status === 'approved') throw new ForbiddenException('Approved claims are locked. Ask finance to reopen it.');
    return this.prisma.expenseClaim.update({
      where: { id },
      data: { title: patch.title ?? undefined, notes: patch.notes ?? undefined, currency: patch.currency ?? undefined },
      include: { items: { orderBy: { date: 'asc' } } },
    });
  }

  async submit(id: string) {
    this.requireDb();
    const c = await this.getClaim(id);
    if (c.status === 'approved') throw new ForbiddenException('Already approved.');
    await this.recomputeTotal(id);
    return this.prisma.expenseClaim.update({
      where: { id },
      data: { status: 'submitted', submittedAt: new Date() },
      include: { items: { orderBy: { date: 'asc' } } },
    });
  }

  async allClaims(periodId?: string, status?: string) {
    this.requireDb();
    return this.prisma.expenseClaim.findMany({
      where: { ...(periodId ? { payPeriodId: periodId } : {}), ...(status ? { status } : {}) },
      orderBy: [{ status: 'asc' }, { submitterName: 'asc' }],
      include: { items: true },
    });
  }

  async approve(id: string, approverUpn: string) {
    this.requireDb();
    const c = await this.getClaim(id);
    if (c.status !== 'submitted') throw new ForbiddenException(`Can only approve submitted claims (current: ${c.status}).`);
    return this.prisma.expenseClaim.update({
      where: { id },
      data: { status: 'approved', approvedBy: approverUpn, approvedAt: new Date(), rejectedReason: null },
      include: { items: { orderBy: { date: 'asc' } } },
    });
  }

  async reject(id: string, reason: string | undefined, approverUpn: string) {
    this.requireDb();
    const c = await this.getClaim(id);
    return this.prisma.expenseClaim.update({
      where: { id },
      data: { status: 'rejected', rejectedReason: reason ?? null, approvedBy: approverUpn, approvedAt: new Date() },
      include: { items: { orderBy: { date: 'asc' } } },
    });
  }

  async reopen(id: string) {
    this.requireDb();
    const c = await this.getClaim(id);
    if (c.status !== 'approved') throw new ForbiddenException(`Only approved claims can be reopened (current: ${c.status}).`);
    return this.prisma.expenseClaim.update({
      where: { id },
      data: { status: 'submitted', approvedBy: null, approvedAt: null },
      include: { items: { orderBy: { date: 'asc' } } },
    });
  }

  async deleteClaim(id: string) {
    this.requireDb();
    const c = await this.prisma.expenseClaim.findUnique({ where: { id }, include: { items: true } });
    for (const it of c?.items ?? []) {
      if (it.fileKey) await this.storage.delete(it.fileKey).catch(() => null);
    }
    await this.prisma.expenseClaim.delete({ where: { id } }).catch(() => null);
  }

  // ---- Items (receipts) --------------------------------------------------
  /**
   * Add a receipt: upload the file, AI-extract amount/vendor/date + suggest a
   * tag (the caller's explicit fields win over the AI), persist the item, and
   * recompute the claim total. Returns the created item + the AI suggestion.
   */
  async addItem(
    claimId: string,
    file: { fileName: string; mimeType: string; bytes: Buffer } | null,
    fields: { date?: string; vendor?: string; amount?: number; tagSlug?: string; description?: string },
  ) {
    this.requireDb();
    const claim = await this.getClaim(claimId);
    if (claim.status === 'approved') throw new ForbiddenException('Approved claims are locked.');

    let storageDriver: string | null = null;
    let fileKey: string | null = null, fileUrl: string | null = null;
    let fileName: string | null = null, mimeType: string | null = null, sizeBytes: number | null = null;
    let ai: ReceiptExtraction = { amount: null, tax: null, vendor: null, date: null, currency: null, suggestedTagSlug: null, confidence: null, lineItems: [], status: 'extracted', message: null };

    if (file) {
      mimeType = file.mimeType;
      sizeBytes = file.bytes.length;
      // Run AI extraction FIRST so we can name the stored file by date/submitter/
      // vendor (best-effort — manual entry still works if it fails).
      const tags = await this.listTags(true);
      ai = await this.anthropic.extractReceipt(file.bytes, file.mimeType, tags.map((t) => ({ slug: t.slug, label: t.label })));
      const date = fields.date ?? ai.date ?? null;
      const vendor = fields.vendor ?? ai.vendor ?? null;
      fileName = receiptFileName({ date, submitter: claim.submitterName ?? claim.submitterUpn, vendor, originalName: file.fileName });
      const up = await this.storage.upload({ fileName, mimeType: file.mimeType, bytes: file.bytes });
      storageDriver = this.storage.driver;
      fileKey = up.key; fileUrl = up.url;
      sizeBytes = up.sizeBytes ?? file.bytes.length;
    }

    const amount = round2(typeof fields.amount === 'number' ? fields.amount : (ai.amount ?? 0));
    // Tag real (non-summary) AI lines with excluded:false so the UI can toggle
    // them; summary rows (subtotal/total/tax) carry isSummary and stay
    // non-toggleable + out of the claimed amount.
    const lineItems = ai.lineItems && ai.lineItems.length
      ? ai.lineItems.map((li) => ({ ...li, excluded: false }))
      : undefined;

    // Tax at scan time: when the receipt itemised, derive tax = total − subtotal
    // (subtotal = sum of the real, non-summary line items) instead of trusting
    // the AI's own tax read. The user can override the Tax field afterward.
    let taxAmount = ai.tax ?? null;
    if (ai.lineItems && ai.lineItems.length && ai.amount != null) {
      const subtotal = ai.lineItems.filter((li) => !li.isSummary).reduce((s, li) => s + (Number(li.amount) || 0), 0);
      const derived = round2(ai.amount - subtotal);
      if (subtotal > 0 && derived >= 0) taxAmount = derived;
    }

    const item = await this.prisma.expenseItem.create({
      data: {
        claimId,
        date: fields.date ?? ai.date ?? null,
        vendor: fields.vendor ?? ai.vendor ?? null,
        amount,
        taxAmount,
        currency: 'CAD', // forced CAD for now — multi-currency entry disabled, ignore AI-detected currency
        tagSlug: fields.tagSlug ?? ai.suggestedTagSlug ?? null,
        description: fields.description ?? null,
        submitterUpn: claim.submitterUpn,
        submitterName: claim.submitterName,
        submitterEmail: (claim as any).submitterEmail ?? null,
        aiExtracted: !!file && (ai.amount != null || ai.vendor != null || ai.date != null),
        lineItems: lineItems as any,
        storage: storageDriver, fileKey, fileUrl, fileName, mimeType, sizeBytes,
      },
    });
    await this.recomputeTotal(claimId);
    return { item, ai };
  }

  async updateItem(id: string, patch: { date?: string; vendor?: string; amount?: number; taxAmount?: number | null; currency?: string | null; tagSlug?: string; description?: string; lineItems?: any[] }) {
    this.requireDb();
    const it = await this.prisma.expenseItem.findUnique({ where: { id }, include: { claim: true } });
    if (!it) throw new NotFoundException('Item not found');
    if (it.claim.status === 'approved') throw new ForbiddenException('Approved claims are locked.');
    const updated = await this.prisma.expenseItem.update({
      where: { id },
      data: {
        date: patch.date ?? undefined,
        vendor: patch.vendor ?? undefined,
        amount: typeof patch.amount === 'number' ? round2(patch.amount) : undefined,
        taxAmount: patch.taxAmount === undefined ? undefined : (patch.taxAmount === null ? null : round2(patch.taxAmount)),
        currency: patch.currency === undefined ? undefined : (patch.currency || null),
        tagSlug: patch.tagSlug ?? undefined,
        description: patch.description ?? undefined,
        lineItems: patch.lineItems === undefined ? undefined : (patch.lineItems as any),
      },
    });
    await this.recomputeTotal(it.claimId);
    return updated;
  }

  async deleteItem(id: string) {
    this.requireDb();
    const it = await this.prisma.expenseItem.findUnique({ where: { id }, include: { claim: true } });
    if (!it) return;
    if (it.claim.status === 'approved') throw new ForbiddenException('Approved claims are locked.');
    if (it.fileKey) await this.storage.delete(it.fileKey).catch(() => null);
    await this.prisma.expenseItem.delete({ where: { id } });
    await this.recomputeTotal(it.claimId);
  }

  /** Receipt bytes for the proxy endpoint. Returns null if no file. */
  async getReceipt(itemId: string): Promise<{ url: string; mimeType: string; fileName: string } | null> {
    this.requireDb();
    const it = await this.prisma.expenseItem.findUnique({ where: { id: itemId } });
    if (!it?.fileKey) return null;
    const url = await this.storage.urlFor(it.fileKey).catch(() => it.fileUrl ?? '');
    return { url, mimeType: it.mimeType ?? 'application/octet-stream', fileName: it.fileName ?? 'receipt' };
  }

  /** Raw receipt bytes streamed by the api/ itself (for in-app thumbnails +
   *  previews that can't carry auth to a presigned URL). */
  async getReceiptBytes(itemId: string): Promise<{ bytes: Buffer; mimeType: string; fileName: string } | null> {
    this.requireDb();
    const it = await this.prisma.expenseItem.findUnique({ where: { id: itemId } });
    if (!it?.fileKey) return null;
    const r = await this.storage.read(it.fileKey).catch(() => null);
    if (!r) return null;
    return { bytes: r.bytes, mimeType: it.mimeType ?? r.mimeType, fileName: it.fileName ?? 'receipt' };
  }

  private async recomputeTotal(claimId: string) {
    const agg = await this.prisma.expenseItem.aggregate({ where: { claimId }, _sum: { amount: true } });
    await this.prisma.expenseClaim.update({ where: { id: claimId }, data: { totalAmount: round2(agg._sum.amount ?? 0) } });
  }
}
