import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DOCUMENT_STORAGE } from './storage/storage.module';
import { DocumentStorageAdapter } from './storage/document-storage';
import { DOCUMENT_TAG_SEED } from './documents.seed';
import { FORM_PDF_B64 } from './documents-form-assets';

// CRA / Service Canada forms seeded into the library on boot (idempotent by
// title), all finance-scoped (audience:'finance'). The three with a `pdfKey`
// embed the flat blank PDF AND keep the canada.ca link; the rest are link-only
// because no public blank exists (ROE Web portal, mailed INS5097, the PDOC web
// tool, CRA mileage guidance). `categorySlug` is a tag under the 'records'
// bucket (see documents.seed.ts).
interface FormSeed {
  title: string;
  description: string;
  linkUrl: string;
  categorySlug: string;
  pdfKey?: string;
  fileName?: string;
}

const FORM_SEED: FormSeed[] = [
  {
    title: 'T4 — Statement of Remuneration Paid',
    categorySlug: 'payroll-slips', pdfKey: 't4', fileName: 't4-25e.pdf',
    linkUrl: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t4.html',
    description: 'CRA T4 slip employers issue to employees. Embedded flat blank; the canada.ca link has the current-year and fillable versions.',
  },
  {
    title: 'T4 Summary — Summary of Remuneration Paid',
    categorySlug: 'payroll-slips', pdfKey: 't4sum', fileName: 't4sum-25e.pdf',
    linkUrl: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t4sum.html',
    description: 'CRA T4 Summary (T4SUM) — the employer summary filed with the T4 slips.',
  },
  {
    title: 'Record of Employment (ROE)',
    categorySlug: 'payroll-slips',
    linkUrl: 'https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-roe.html',
    description: 'Service Canada ROE — issued through the ROE Web portal; there is no public blank PDF. Link to the overview + ROE Web access.',
  },
  {
    title: 'Request for Record of Employment (INS3166)',
    categorySlug: 'payroll-slips', pdfKey: 'ins3166', fileName: 'SC-INS3166.pdf',
    linkUrl: 'https://catalogue.servicecanada.gc.ca/content/EForms/en/Detail.html?Form=INS3166',
    description: 'Worker-side form to request an ROE a former employer has not issued. Embedded blank + Service Canada catalogue link.',
  },
  {
    title: 'Request for Payroll Information (INS5097)',
    categorySlug: 'payroll-slips',
    linkUrl: 'https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-employers-payroll-info-form.html',
    description: 'Service Canada mails this per EI claim to validate an ROE; no public blank. Link to the employer instructions.',
  },
  {
    title: 'Payroll Deductions Online Calculator (PDOC)',
    categorySlug: 'payroll-slips',
    linkUrl: 'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/payroll-deductions-online-calculator.html',
    description: 'CRA web tool — calculates CPP, EI, and income tax. Web-only (nothing to download).',
  },
  {
    title: 'Mileage / Motor-Vehicle Records (CRA guidance)',
    categorySlug: 'mileage-records',
    linkUrl: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses/motor-vehicle-records.html',
    description: 'CRA logbook requirements (date, destination, purpose, km, odometer). No official template — keep your own band-branded sheet.',
  },
];

// Application-level Documents service. Wraps Prisma + the storage
// adapter, and gracefully falls back to an in-memory store when Postgres
// isn't available (mirrors the pattern in TimeKeepingController). Also
// owns one-time seeding of the starter tag catalog.

export interface DocumentRecord {
  id: string;
  title: string;
  description: string | null;
  storage: string | null;
  fileKey: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  linkUrl: string | null;
  audience: string;
  companyId: string | null;
  tagIds: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface DocumentTagRecord {
  id: string;
  category: string;
  slug: string;
  displayName: string;
  /** How many documents currently reference this tag. Drives the UI's
   *  "in use (N)" badge + the disabled state on the delete button —
   *  matches the server-side guard that throws 409 on delete if > 0. */
  inUseCount: number;
}

@Injectable()
export class DocumentsService implements OnApplicationBootstrap {
  private readonly log = new Logger(DocumentsService.name);

  // In-memory fallback — used when Prisma isn't available so the POC can
  // demo on a fresh checkout without DATABASE_URL. Tags are seeded on
  // startup; documents start empty.
  private memDocs = new Map<string, DocumentRecord>();
  private memTags = new Map<string, DocumentTagRecord>();
  private memSeq = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageAdapter,
  ) {}

  // Seed on bootstrap (NOT onModuleInit): PrismaService connects asynchronously
  // and `prisma.isAvailable` is still false during onModuleInit, so seeding
  // there lands in the in-memory fallback instead of Postgres. onApplicationBootstrap
  // runs after connections are up — same hook OnboardingService uses.
  async onApplicationBootstrap() {
    await this.seedTagsIfNeeded();
    await this.seedDocumentsIfNeeded();
  }

  // ---- Form seed (CRA / Service Canada) -----------------------------------

  // Dedupe the seed on the stable linkUrl (the canada.ca form URL), NOT the
  // title. Title is the user-facing label and can be renamed in the editor;
  // keying on it would re-create the form as a "duplicate" after any rename,
  // and a user upload sharing the title would silently block the seed. linkUrl
  // is unique per form and never changes, so titles are safe to edit.
  private async documentExistsByLink(linkUrl: string): Promise<boolean> {
    if (this.prisma.isAvailable) {
      const r = await this.prisma.document.findFirst({ where: { linkUrl }, select: { id: true } });
      return !!r;
    }
    for (const d of this.memDocs.values()) if (d.linkUrl === linkUrl) return true;
    return false;
  }

  private async recordsTagId(slug: string): Promise<string | null> {
    if (this.prisma.isAvailable) {
      const t = await this.prisma.documentTag.findUnique({
        where: { category_slug: { category: 'records', slug } },
      });
      return t?.id ?? null;
    }
    const id = `tag-records-${slug}`;
    return this.memTags.has(id) ? id : null;
  }

  // Seed the payroll/AP forms once (idempotent by title). Uses the public
  // create() path so the embedded blanks go through the storage adapter and
  // serve via /pdf identically to user uploads. Best-effort per form.
  async seedDocumentsIfNeeded(): Promise<void> {
    let created = 0;
    for (const f of FORM_SEED) {
      try {
        if (await this.documentExistsByLink(f.linkUrl)) continue;
        const tagId = await this.recordsTagId(f.categorySlug);
        const b64 = f.pdfKey ? FORM_PDF_B64[f.pdfKey] : undefined;
        const file = b64
          ? { fileName: f.fileName ?? `${f.pdfKey}.pdf`, mimeType: 'application/pdf', bytes: Buffer.from(b64, 'base64') }
          : undefined;
        await this.create({
          title: f.title,
          description: f.description,
          linkUrl: f.linkUrl,
          audience: 'finance',
          tagIds: tagId ? [tagId] : [],
          createdBy: 'system-seed',
          file,
        });
        created++;
      } catch (e: any) {
        this.log.warn(`seedDocuments: "${f.title}" failed: ${e?.message ?? e}`);
      }
    }
    if (created) this.log.log(`Document seed: created ${created} CRA/Service Canada form(s), finance-scoped.`);
  }

  // ---- Tag catalog --------------------------------------------------------

  async seedTagsIfNeeded(): Promise<void> {
    if (this.prisma.isAvailable) {
      for (const t of DOCUMENT_TAG_SEED) {
        await this.prisma.documentTag.upsert({
          where: { category_slug: { category: t.category, slug: t.slug } },
          update: {},
          create: { category: t.category, slug: t.slug, displayName: t.displayName },
        });
      }
      const count = await this.prisma.documentTag.count();
      this.log.log(`DocumentTag seed: ${count} rows total (${DOCUMENT_TAG_SEED.length} starter).`);
    } else {
      for (const t of DOCUMENT_TAG_SEED) {
        const id = `tag-${t.category}-${t.slug}`;
        if (!this.memTags.has(id)) {
          this.memTags.set(id, { id, category: t.category, slug: t.slug, displayName: t.displayName, inUseCount: 0 });
        }
      }
      this.log.log(`DocumentTag in-memory seed: ${this.memTags.size} rows.`);
    }
  }

  async listTags(): Promise<DocumentTagRecord[]> {
    if (this.prisma.isAvailable) {
      const rows = await this.prisma.documentTag.findMany({
        orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
        include: { _count: { select: { documents: true } } },
      });
      return rows.map((r) => ({
        id: r.id, category: r.category, slug: r.slug, displayName: r.displayName,
        inUseCount: r._count.documents,
      }));
    }
    // In-memory: walk documents to compute the count fresh each call.
    const counts = new Map<string, number>();
    for (const d of this.memDocs.values()) {
      for (const tagId of d.tagIds) counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
    return Array.from(this.memTags.values())
      .map((t) => ({ ...t, inUseCount: counts.get(t.id) ?? 0 }))
      .sort((a, b) =>
        a.category === b.category ? a.displayName.localeCompare(b.displayName) : a.category.localeCompare(b.category)
      );
  }

  async createTag(input: { category: string; slug: string; displayName: string }): Promise<DocumentTagRecord> {
    if (this.prisma.isAvailable) {
      const r = await this.prisma.documentTag.create({ data: input });
      return { id: r.id, category: r.category, slug: r.slug, displayName: r.displayName, inUseCount: 0 };
    }
    const id = `tag-${input.category}-${input.slug}`;
    if (this.memTags.has(id)) throw new Error('Tag already exists');
    const row: DocumentTagRecord = { id, ...input, inUseCount: 0 };
    this.memTags.set(id, row);
    return row;
  }

  async updateTag(id: string, patch: Partial<{ slug: string; displayName: string }>): Promise<DocumentTagRecord> {
    if (this.prisma.isAvailable) {
      const r = await this.prisma.documentTag.update({
        where: { id }, data: patch,
        include: { _count: { select: { documents: true } } },
      });
      return { id: r.id, category: r.category, slug: r.slug, displayName: r.displayName, inUseCount: r._count.documents };
    }
    const cur = this.memTags.get(id);
    if (!cur) throw new Error('Not found');
    const next = { ...cur, ...patch };
    this.memTags.set(id, next);
    return next;
  }

  async deleteTag(id: string): Promise<{ deleted: true } | { deleted: false; usedBy: string[] }> {
    if (this.prisma.isAvailable) {
      const usingDocs = await this.prisma.document.findMany({
        where: { tags: { some: { id } } },
        select: { title: true },
        take: 5,
      });
      if (usingDocs.length) return { deleted: false, usedBy: usingDocs.map((d) => d.title) };
      await this.prisma.documentTag.delete({ where: { id } });
      return { deleted: true };
    }
    const usedBy = Array.from(this.memDocs.values()).filter((d) => d.tagIds.includes(id)).map((d) => d.title).slice(0, 5);
    if (usedBy.length) return { deleted: false, usedBy };
    this.memTags.delete(id);
    return { deleted: true };
  }

  // ---- Documents ----------------------------------------------------------

  async list(opts: { audiences: string[]; category?: string; tagId?: string; search?: string }): Promise<DocumentRecord[]> {
    if (this.prisma.isAvailable) {
      const where: any = { audience: { in: opts.audiences } };
      if (opts.tagId) where.tags = { some: { id: opts.tagId } };
      if (opts.search) where.title = { contains: opts.search, mode: 'insensitive' };
      const rows = await this.prisma.document.findMany({
        where,
        include: { tags: { select: { id: true } } },
        orderBy: [{ updatedAt: 'desc' }],
      });
      return rows.map(toRecord);
    }
    return Array.from(this.memDocs.values())
      .filter((d) => opts.audiences.includes(d.audience))
      .filter((d) => !opts.tagId || d.tagIds.includes(opts.tagId))
      .filter((d) => !opts.search || d.title.toLowerCase().includes(opts.search.toLowerCase()))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<DocumentRecord | null> {
    if (this.prisma.isAvailable) {
      const row = await this.prisma.document.findUnique({
        where: { id },
        include: { tags: { select: { id: true } } },
      });
      if (!row) return null;
      const r = toRecord(row);
      // Refresh the canonical URL via the adapter — Blob SAS may have
      // rolled, SharePoint webUrl is long-lived but harmless to re-issue.
      if (r.fileKey && r.storage) {
        try { r.fileUrl = await this.storage.urlFor(r.fileKey); } catch { /* keep cached */ }
      }
      return r;
    }
    return this.memDocs.get(id) ?? null;
  }

  async create(input: {
    title: string;
    description?: string;
    linkUrl?: string;
    audience: string;
    companyId?: string;
    tagIds: string[];
    createdBy: string;
    file?: { fileName: string; mimeType: string; bytes: Buffer };
  }): Promise<DocumentRecord> {
    if (!input.file && !input.linkUrl) {
      throw new Error('Document requires either a file or a linkUrl.');
    }
    let storageDriver: string | null = null;
    let fileKey: string | null = null;
    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let sizeBytes: number | null = null;
    if (input.file) {
      const up = await this.storage.upload(input.file);
      storageDriver = this.storage.driver;
      fileKey = up.key;
      fileUrl = up.url;
      fileName = input.file.fileName;
      mimeType = up.mimeType ?? input.file.mimeType;
      sizeBytes = up.sizeBytes ?? input.file.bytes.length;
    }
    if (this.prisma.isAvailable) {
      const row = await this.prisma.document.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          storage: storageDriver,
          fileKey, fileUrl, fileName, mimeType, sizeBytes,
          linkUrl: input.linkUrl ?? null,
          audience: input.audience,
          companyId: input.companyId ?? null,
          createdBy: input.createdBy,
          tags: input.tagIds.length ? { connect: input.tagIds.map((id) => ({ id })) } : undefined,
        },
        include: { tags: { select: { id: true } } },
      });
      return toRecord(row);
    }
    const id = `doc-${++this.memSeq}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const r: DocumentRecord = {
      id, title: input.title, description: input.description ?? null,
      storage: storageDriver, fileKey, fileUrl, fileName, mimeType, sizeBytes,
      linkUrl: input.linkUrl ?? null,
      audience: input.audience, companyId: input.companyId ?? null,
      tagIds: input.tagIds.slice(),
      createdAt: now, createdBy: input.createdBy, updatedAt: now,
    };
    this.memDocs.set(id, r);
    return r;
  }

  async update(id: string, patch: Partial<{
    title: string; description: string | null; linkUrl: string | null;
    audience: string; companyId: string | null; tagIds: string[];
  }>): Promise<DocumentRecord | null> {
    if (this.prisma.isAvailable) {
      const data: any = {};
      if (patch.title != null) data.title = patch.title;
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.linkUrl !== undefined) data.linkUrl = patch.linkUrl;
      if (patch.audience != null) data.audience = patch.audience;
      if (patch.companyId !== undefined) data.companyId = patch.companyId;
      if (patch.tagIds) data.tags = { set: patch.tagIds.map((id) => ({ id })) };
      const row = await this.prisma.document.update({
        where: { id },
        data,
        include: { tags: { select: { id: true } } },
      });
      return toRecord(row);
    }
    const cur = this.memDocs.get(id);
    if (!cur) return null;
    const next: DocumentRecord = { ...cur };
    if (patch.title != null) next.title = patch.title;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.linkUrl !== undefined) next.linkUrl = patch.linkUrl;
    if (patch.audience != null) next.audience = patch.audience;
    if (patch.companyId !== undefined) next.companyId = patch.companyId;
    if (patch.tagIds) next.tagIds = patch.tagIds.slice();
    next.updatedAt = new Date().toISOString();
    this.memDocs.set(id, next);
    return next;
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    if (existing.fileKey) {
      try { await this.storage.delete(existing.fileKey); } catch (e: any) {
        this.log.warn(`Storage delete failed for ${existing.fileKey}: ${e?.message ?? e}`);
      }
    }
    if (this.prisma.isAvailable) {
      await this.prisma.document.delete({ where: { id } });
    } else {
      this.memDocs.delete(id);
    }
    return true;
  }
}

function toRecord(row: any): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    storage: row.storage,
    fileKey: row.fileKey,
    fileUrl: row.fileUrl,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    linkUrl: row.linkUrl,
    audience: row.audience,
    companyId: row.companyId,
    tagIds: (row.tags ?? []).map((t: { id: string }) => t.id),
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    createdBy: row.createdBy,
    updatedAt: (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)).toISOString(),
  };
}
