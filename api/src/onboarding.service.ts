import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from './prisma.service';
import { DOCUMENT_STORAGE } from './storage/storage.module';
import { DocumentStorageAdapter } from './storage/document-storage';
import { ONBOARDING_SEED } from './onboarding.seed';

// Application-level Onboarding service. Wraps Prisma + the storage
// adapter (reused from Documents). Like DocumentsService, gracefully
// degrades to an in-memory store when Postgres isn't available so the
// POC runs on a clean checkout.

export type StepCompletion = 'admin_marks' | 'person_uploads' | 'both';
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface FlowRecord {
  id: string;
  title: string;
  description: string | null;
  companyId: string | null;
  active: boolean;
  steps: StepRecord[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface StepRecord {
  id: string;
  flowId: string;
  order: number;
  title: string;
  instructions: string | null;
  completion: StepCompletion;
  documents: Array<{ id: string; documentId: string; personUploadAllowed: boolean }>;
  links: Array<{ id: string; label: string; url: string }>;
}

export interface PersonRecord {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  /** Optional 1:1 link to a BandMember row (Entra-backed). When set,
   *  the linked member's name/email/phone are kept in sync on save. */
  bandMemberId: string | null;
  /** Inlined display name from the linked BandMember so the UI doesn't
   *  need a second fetch. Null when bandMemberId is null. */
  bandMemberName: string | null;
  bandMemberUpn: string | null;
  /** Toggle gating Time Keeping. When true, the worker shows up in
   *  the Approvals roster + is allowed to enter timesheets via the
   *  saveDraft / submit endpoints. */
  timesheetsEnabled: boolean;
  /** Toggle gating Expenses. When true, the person shows up in the
   *  expense Approvals roster + may start/submit expense claims. */
  expensesEnabled: boolean;
  /** Whether this Person has a password set for the email/password
   *  sign-in path (staff-auth feature). Always false when
   *  bandMemberId is set (Entra-backed Persons use SSO). Drives the
   *  Edit Person UI's "Reset" vs "Issue" labelling. */
  hasAppSignIn: boolean;
  createdAt: string;
}

export interface AssignmentRecord {
  id: string;
  flowId: string;
  personId: string;
  publicToken: string;
  startedAt: string;
  completedAt: string | null;
  stepStates: StepStateRecord[];
}

export interface StepStateRecord {
  id: string;
  assignmentId: string;
  stepId: string;
  status: StepStatus;
  personFileKey: string | null;
  personFileUrl: string | null;
  personFileName: string | null;
  personMimeType: string | null;
  personSizeBytes: number | null;
  notes: string | null;
  completedAt: string | null;
  completedBy: string | null;
}

function mintToken(): string {
  return randomBytes(24).toString('hex'); // 48 chars
}

@Injectable()
export class OnboardingService implements OnApplicationBootstrap {
  private readonly log = new Logger(OnboardingService.name);

  // In-memory fallback
  private memFlows = new Map<string, FlowRecord>();
  private memPeople = new Map<string, PersonRecord>();
  private memAssignments = new Map<string, AssignmentRecord>();
  // In-memory document tracking — used only when running without
  // Postgres so the seeded sample doc round-trips through the same
  // surface DocumentsService would expose.
  private memSeededDocId: string | null = null;
  private memSeq = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageAdapter,
  ) {}

  // Bootstrap — seed a single sample flow + NDA document so the UI
  // has something to demo on a fresh install. Idempotent: checks by
  // exact title match and skips if already present.
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seedSampleFlow();
    } catch (e: any) {
      this.log.warn(`Onboarding seed skipped: ${e?.message ?? e}`);
    }
  }

  private async seedSampleFlow(): Promise<void> {
    if (this.prisma.isAvailable) {
      const existingFlow = await this.prisma.onboardingFlow.findFirst({
        where: { title: ONBOARDING_SEED.SAMPLE_FLOW_TITLE },
      });
      if (existingFlow) return;
      // Ensure the sample NDA document exists, uploading the bytes
      // through the active storage adapter.
      let doc = await this.prisma.document.findFirst({
        where: { title: ONBOARDING_SEED.SAMPLE_DOC_TITLE },
      });
      if (!doc) {
        const bytes = ONBOARDING_SEED.buildSampleNdaPdf();
        const up = await this.storage.upload({
          fileName: 'sample-nda.pdf',
          mimeType: 'application/pdf',
          bytes,
        });
        doc = await this.prisma.document.create({
          data: {
            title: ONBOARDING_SEED.SAMPLE_DOC_TITLE,
            description: 'Sample placeholder NDA used by the onboarding demo flow. Replace before production use.',
            storage: this.storage.driver,
            fileKey: up.key, fileUrl: up.url,
            fileName: 'sample-nda.pdf', mimeType: 'application/pdf',
            sizeBytes: bytes.length,
            audience: 'staff',
            createdBy: ONBOARDING_SEED.SEED_AUTHOR_UPN,
          },
        });
      }
      const flow = await this.prisma.onboardingFlow.create({
        data: {
          title: ONBOARDING_SEED.SAMPLE_FLOW_TITLE,
          description: 'Demo flow showing one step with an attached document. Edit / delete freely.',
          createdBy: ONBOARDING_SEED.SEED_AUTHOR_UPN,
          steps: {
            create: [{
              order: 0,
              title: ONBOARDING_SEED.SAMPLE_STEP_TITLE,
              instructions: 'Read the attached NDA, sign it, and upload the signed copy.',
              completion: 'person_uploads',
              documentLinks: {
                create: [{ documentId: doc.id, personUploadAllowed: true }],
              },
            }],
          },
        },
      });
      this.log.log(`Seeded sample onboarding flow ${flow.id} → step "${ONBOARDING_SEED.SAMPLE_STEP_TITLE}"`);
      return;
    }

    // ---- in-memory fallback ----------------------------------------------
    for (const f of this.memFlows.values()) {
      if (f.title === ONBOARDING_SEED.SAMPLE_FLOW_TITLE) return;
    }
    const bytes = ONBOARDING_SEED.buildSampleNdaPdf();
    const up = await this.storage.upload({
      fileName: 'sample-nda.pdf',
      mimeType: 'application/pdf',
      bytes,
    });
    const docId = `seed-doc-${Math.random().toString(36).slice(2, 8)}`;
    this.memSeededDocId = docId;
    const stepId = `seed-step-${Math.random().toString(36).slice(2, 8)}`;
    const flowId = `seed-flow-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    this.memFlows.set(flowId, {
      id: flowId,
      title: ONBOARDING_SEED.SAMPLE_FLOW_TITLE,
      description: 'Demo flow showing one step with an attached document. Edit / delete freely.',
      companyId: null, active: true,
      steps: [{
        id: stepId, flowId, order: 0,
        title: ONBOARDING_SEED.SAMPLE_STEP_TITLE,
        instructions: 'Read the attached NDA, sign it, and upload the signed copy.',
        completion: 'person_uploads',
        documents: [{ id: `seed-sd`, documentId: docId, personUploadAllowed: true }],
        links: [],
      }],
      createdAt: now, createdBy: ONBOARDING_SEED.SEED_AUTHOR_UPN, updatedAt: now,
    });
    // Stash the sample doc on the seeded record's first document so the
    // app's documents.list (mock fallback) sees it too via a side query.
    (this as any).memSeededDoc = {
      id: docId,
      title: ONBOARDING_SEED.SAMPLE_DOC_TITLE,
      description: 'Sample placeholder NDA used by the onboarding demo flow. Replace before production use.',
      storage: this.storage.driver,
      fileKey: up.key, fileUrl: up.url,
      fileName: 'sample-nda.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length,
      linkUrl: null, audience: 'staff', companyId: null, tagIds: [],
      createdAt: now, createdBy: ONBOARDING_SEED.SEED_AUTHOR_UPN, updatedAt: now,
    };
    this.log.log(`Seeded in-memory sample onboarding flow ${flowId} (no Postgres detected).`);
  }

  // ---- Flows --------------------------------------------------------------

  async listFlows(): Promise<FlowRecord[]> {
    if (this.prisma.isAvailable) {
      const rows = await this.prisma.onboardingFlow.findMany({
        include: { steps: { include: { documentLinks: true, links: true }, orderBy: { order: 'asc' } } },
        orderBy: [{ updatedAt: 'desc' }],
      });
      return rows.map(toFlowRecord);
    }
    return Array.from(this.memFlows.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getFlow(id: string): Promise<FlowRecord | null> {
    if (this.prisma.isAvailable) {
      const row = await this.prisma.onboardingFlow.findUnique({
        where: { id },
        include: { steps: { include: { documentLinks: true, links: true }, orderBy: { order: 'asc' } } },
      });
      return row ? toFlowRecord(row) : null;
    }
    return this.memFlows.get(id) ?? null;
  }

  async createFlow(input: { title: string; description?: string; companyId?: string; createdBy: string }): Promise<FlowRecord> {
    if (this.prisma.isAvailable) {
      const r = await this.prisma.onboardingFlow.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          companyId: input.companyId ?? null,
          createdBy: input.createdBy,
        },
        include: { steps: { include: { documentLinks: true, links: true }, orderBy: { order: 'asc' } } },
      });
      return toFlowRecord(r);
    }
    const id = `flow-${++this.memSeq}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const r: FlowRecord = {
      id, title: input.title, description: input.description ?? null,
      companyId: input.companyId ?? null, active: true, steps: [],
      createdAt: now, createdBy: input.createdBy, updatedAt: now,
    };
    this.memFlows.set(id, r);
    return r;
  }

  async updateFlow(id: string, patch: Partial<{ title: string; description: string | null; active: boolean; companyId: string | null }>): Promise<FlowRecord | null> {
    if (this.prisma.isAvailable) {
      const data: any = {};
      if (patch.title != null) data.title = patch.title;
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.active != null) data.active = patch.active;
      if (patch.companyId !== undefined) data.companyId = patch.companyId;
      const r = await this.prisma.onboardingFlow.update({
        where: { id }, data,
        include: { steps: { include: { documentLinks: true, links: true }, orderBy: { order: 'asc' } } },
      });
      return toFlowRecord(r);
    }
    const cur = this.memFlows.get(id);
    if (!cur) return null;
    const next: FlowRecord = { ...cur, ...patch as any, updatedAt: new Date().toISOString() };
    this.memFlows.set(id, next);
    return next;
  }

  async deleteFlow(id: string): Promise<boolean> {
    if (this.prisma.isAvailable) {
      await this.prisma.onboardingFlow.delete({ where: { id } }).catch(() => null);
    } else {
      this.memFlows.delete(id);
    }
    return true;
  }

  // ---- Steps --------------------------------------------------------------

  async addStep(flowId: string, input: { title: string; instructions?: string; completion?: StepCompletion }): Promise<StepRecord | null> {
    if (this.prisma.isAvailable) {
      const last = await this.prisma.onboardingStep.findFirst({ where: { flowId }, orderBy: { order: 'desc' } });
      const order = last ? last.order + 1 : 0;
      const r = await this.prisma.onboardingStep.create({
        data: {
          flowId, order,
          title: input.title,
          instructions: input.instructions ?? null,
          completion: input.completion ?? 'admin_marks',
        },
        include: { documentLinks: true, links: true },
      });
      await this.prisma.onboardingFlow.update({ where: { id: flowId }, data: { updatedAt: new Date() } }).catch(() => null);
      return toStepRecord(r);
    }
    const flow = this.memFlows.get(flowId);
    if (!flow) return null;
    const order = flow.steps.length ? Math.max(...flow.steps.map((s) => s.order)) + 1 : 0;
    const r: StepRecord = {
      id: `step-${++this.memSeq}-${Math.random().toString(36).slice(2, 6)}`,
      flowId, order, title: input.title,
      instructions: input.instructions ?? null,
      completion: input.completion ?? 'admin_marks',
      documents: [], links: [],
    };
    flow.steps = [...flow.steps, r];
    flow.updatedAt = new Date().toISOString();
    return r;
  }

  async updateStep(id: string, patch: Partial<{ title: string; instructions: string | null; completion: StepCompletion; order: number }>): Promise<StepRecord | null> {
    if (this.prisma.isAvailable) {
      const r = await this.prisma.onboardingStep.update({
        where: { id }, data: patch,
        include: { documentLinks: true, links: true },
      });
      return toStepRecord(r);
    }
    for (const flow of this.memFlows.values()) {
      const idx = flow.steps.findIndex((s) => s.id === id);
      if (idx !== -1) {
        flow.steps[idx] = { ...flow.steps[idx], ...patch as any };
        flow.updatedAt = new Date().toISOString();
        return flow.steps[idx];
      }
    }
    return null;
  }

  async deleteStep(id: string): Promise<boolean> {
    if (this.prisma.isAvailable) {
      await this.prisma.onboardingStep.delete({ where: { id } }).catch(() => null);
      return true;
    }
    for (const flow of this.memFlows.values()) {
      const idx = flow.steps.findIndex((s) => s.id === id);
      if (idx !== -1) {
        flow.steps.splice(idx, 1);
        flow.updatedAt = new Date().toISOString();
        return true;
      }
    }
    return false;
  }

  // Step attachments — documents + free URL links.

  async attachDocument(stepId: string, documentId: string, personUploadAllowed = false): Promise<void> {
    if (this.prisma.isAvailable) {
      await this.prisma.onboardingStepDocument.create({
        data: { stepId, documentId, personUploadAllowed },
      });
      return;
    }
    for (const flow of this.memFlows.values()) {
      const step = flow.steps.find((s) => s.id === stepId);
      if (step) {
        step.documents.push({ id: `sd-${++this.memSeq}`, documentId, personUploadAllowed });
        return;
      }
    }
  }

  async detachDocument(rowId: string): Promise<void> {
    if (this.prisma.isAvailable) {
      await this.prisma.onboardingStepDocument.delete({ where: { id: rowId } }).catch(() => null);
      return;
    }
    for (const flow of this.memFlows.values()) {
      for (const step of flow.steps) {
        const idx = step.documents.findIndex((d) => d.id === rowId);
        if (idx !== -1) step.documents.splice(idx, 1);
      }
    }
  }

  async addLink(stepId: string, label: string, url: string): Promise<void> {
    if (this.prisma.isAvailable) {
      await this.prisma.onboardingStepLink.create({ data: { stepId, label, url } });
      return;
    }
    for (const flow of this.memFlows.values()) {
      const step = flow.steps.find((s) => s.id === stepId);
      if (step) step.links.push({ id: `sl-${++this.memSeq}`, label, url });
    }
  }

  async removeLink(rowId: string): Promise<void> {
    if (this.prisma.isAvailable) {
      await this.prisma.onboardingStepLink.delete({ where: { id: rowId } }).catch(() => null);
      return;
    }
    for (const flow of this.memFlows.values()) {
      for (const step of flow.steps) {
        const idx = step.links.findIndex((l) => l.id === rowId);
        if (idx !== -1) step.links.splice(idx, 1);
      }
    }
  }

  // ---- People -------------------------------------------------------------

  async listPeople(): Promise<PersonRecord[]> {
    if (this.prisma.isAvailable) {
      const rows = await this.prisma.person.findMany({
        orderBy: { createdAt: 'desc' },
        include: { bandMember: { select: { id: true, name: true, upn: true } } },
      });
      return rows.map(toPersonRecord);
    }
    return Array.from(this.memPeople.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updatePerson(id: string, patch: Partial<{ displayName: string; email: string | null; phone: string | null; companyId: string | null; bandMemberId: string | null; timesheetsEnabled: boolean; expensesEnabled: boolean }>): Promise<PersonRecord | null> {
    if (this.prisma.isAvailable) {
      const data: any = {};
      if (patch.displayName != null) data.displayName = patch.displayName;
      if (patch.email !== undefined) data.email = patch.email;
      if (patch.phone !== undefined) data.phone = patch.phone;
      if (patch.companyId !== undefined) data.companyId = patch.companyId;
      if (patch.timesheetsEnabled !== undefined) data.timesheetsEnabled = patch.timesheetsEnabled;
      if (patch.expensesEnabled !== undefined) data.expensesEnabled = patch.expensesEnabled;
      // Switching the band-member link → re-pull name/email/phone from
      // the new linked member so it stays authoritative.
      if (patch.bandMemberId !== undefined) {
        data.bandMemberId = patch.bandMemberId;
        if (patch.bandMemberId) {
          const bm = await this.prisma.bandMember.findUnique({
            where: { id: patch.bandMemberId },
            select: { name: true, email: true, phone: true },
          });
          if (!bm) throw new Error('Linked band member not found.');
          data.displayName = bm.name;
          data.email = bm.email ?? data.email ?? null;
          data.phone = bm.phone ?? data.phone ?? null;
          // staff-auth lifecycle: linking to a BandMember means the
          // Person now uses Entra SSO; null out the password-auth
          // columns in the same transaction so the email/password
          // path is dormant. The login endpoint also defensively
          // rejects when bandMemberId is set, but clearing the data
          // here is the source-of-truth state. See
          // docs/features/staff-auth.md "Lifecycle: password ->
          // linked to BandMember".
          data.passwordHash = null;
          data.passwordSetAt = null;
          data.resetToken = null;
          data.resetTokenAt = null;
        }
      }
      const r = await this.prisma.person.update({
        where: { id }, data,
        include: { bandMember: { select: { id: true, name: true, upn: true } } },
      });
      return toPersonRecord(r);
    }
    const cur = this.memPeople.get(id);
    if (!cur) return null;
    const next: PersonRecord = { ...cur };
    if (patch.displayName != null) next.displayName = patch.displayName;
    if (patch.email !== undefined) next.email = patch.email;
    if (patch.phone !== undefined) next.phone = patch.phone;
    if (patch.companyId !== undefined) next.companyId = patch.companyId;
    if (patch.bandMemberId !== undefined) next.bandMemberId = patch.bandMemberId;
    if (patch.timesheetsEnabled !== undefined) next.timesheetsEnabled = patch.timesheetsEnabled;
    if (patch.expensesEnabled !== undefined) next.expensesEnabled = patch.expensesEnabled;
    this.memPeople.set(id, next);
    return next;
  }

  // ---- Time keeping bridge ------------------------------------------------

  /** People with timesheetsEnabled=true + their derived workerUpn /
   *  workerName for the Time Keeping screen. The UPN comes from the
   *  linked BandMember when present, else from email (most external
   *  contractors); rows without either are dropped (can't key a
   *  Timesheet to them). */
  // ---- Expenses eligibility (mirrors the timesheet helpers, expensesEnabled) -
  async listExpenseWorkers(): Promise<Array<{ personId: string; workerUpn: string; workerName: string; isBandMember: boolean }>> {
    if (!this.prisma.isAvailable) return [];
    const rows = await this.prisma.person.findMany({
      where: { expensesEnabled: true },
      include: { bandMember: { select: { upn: true, name: true } } },
      orderBy: { displayName: 'asc' },
    });
    return rows
      .map((p) => {
        const upn = (p.bandMember?.upn ?? p.email ?? '').toLowerCase();
        if (!upn) return null;
        return { personId: p.id, workerUpn: upn, workerName: p.bandMember?.name ?? p.displayName, isBandMember: !!p.bandMember };
      })
      .filter((x): x is { personId: string; workerUpn: string; workerName: string; isBandMember: boolean } => !!x);
  }

  async isExpenseEligible(upn: string): Promise<boolean> {
    if (!upn || !this.prisma.isAvailable) return false;
    const u = upn.toLowerCase();
    const row = await this.prisma.person.findFirst({
      where: {
        expensesEnabled: true,
        OR: [
          { email: { equals: u, mode: 'insensitive' } },
          { bandMember: { upn: { equals: u, mode: 'insensitive' } } },
        ],
      },
      select: { id: true },
    });
    return !!row;
  }

  async listTimesheetWorkers(): Promise<Array<{ personId: string; workerUpn: string; workerName: string; isBandMember: boolean }>> {
    if (this.prisma.isAvailable) {
      const rows = await this.prisma.person.findMany({
        where: { timesheetsEnabled: true },
        include: { bandMember: { select: { upn: true, name: true } } },
        orderBy: { displayName: 'asc' },
      });
      return rows
        .map((p) => {
          const upn = (p.bandMember?.upn ?? p.email ?? '').toLowerCase();
          if (!upn) return null;
          return {
            personId: p.id,
            workerUpn: upn,
            workerName: p.bandMember?.name ?? p.displayName,
            isBandMember: !!p.bandMember,
          };
        })
        .filter((x): x is { personId: string; workerUpn: string; workerName: string; isBandMember: boolean } => !!x);
    }
    return Array.from(this.memPeople.values())
      .filter((p) => p.timesheetsEnabled)
      .map((p) => {
        const upn = ((p as any).bandMemberUpn ?? p.email ?? '').toLowerCase();
        if (!upn) return null;
        return { personId: p.id, workerUpn: upn, workerName: p.displayName, isBandMember: !!p.bandMemberId };
      })
      .filter((x): x is { personId: string; workerUpn: string; workerName: string; isBandMember: boolean } => !!x)
      .sort((a, b) => a.workerName.localeCompare(b.workerName));
  }

  /** Whether a given UPN is a timesheet-eligible worker. Drives both
   *  the worker-side AddTimesheet gate and the server's save/submit
   *  refusal for non-eligible UPNs.
   *
   *  Matches case-insensitively on both Person.email AND BandMember.upn,
   *  even though BandMember.upn is conventionally stored lowercased
   *  (Entra seed step) — belt + suspenders. */
  async isWorkerEligible(upn: string): Promise<boolean> {
    if (!upn) return false;
    const u = upn.toLowerCase();
    if (this.prisma.isAvailable) {
      const row = await this.prisma.person.findFirst({
        where: {
          timesheetsEnabled: true,
          OR: [
            { email: { equals: u, mode: 'insensitive' } },
            { bandMember: { upn: { equals: u, mode: 'insensitive' } } },
          ],
        },
        select: { id: true },
      });
      return !!row;
    }
    return (await this.listTimesheetWorkers()).some((w) => w.workerUpn === u);
  }

  async deletePerson(id: string): Promise<boolean> {
    if (this.prisma.isAvailable) {
      await this.prisma.person.delete({ where: { id } }).catch(() => null);
    } else {
      this.memPeople.delete(id);
    }
    return true;
  }

  // If bandMemberId is supplied, pull name/email/phone from the linked
  // BandMember row so they stay authoritative; admin's overrides are only
  // used when there's no link.
  async createPerson(input: { displayName: string; email?: string; phone?: string; companyId?: string; bandMemberId?: string; timesheetsEnabled?: boolean; expensesEnabled?: boolean }): Promise<PersonRecord> {
    if (this.prisma.isAvailable) {
      let displayName = input.displayName;
      let email = input.email;
      let phone = input.phone;
      if (input.bandMemberId) {
        const bm = await this.prisma.bandMember.findUnique({
          where: { id: input.bandMemberId },
          select: { id: true, name: true, email: true, phone: true },
        });
        if (!bm) throw new Error('Linked band member not found.');
        displayName = bm.name;
        email = bm.email ?? email;
        phone = bm.phone ?? phone;
      }
      const r = await this.prisma.person.create({
        data: {
          displayName,
          email: email ?? null,
          phone: phone ?? null,
          companyId: input.companyId ?? null,
          bandMemberId: input.bandMemberId ?? null,
          timesheetsEnabled: !!input.timesheetsEnabled,
          expensesEnabled: !!input.expensesEnabled,
        },
        include: { bandMember: { select: { id: true, name: true, upn: true } } },
      });
      return toPersonRecord(r);
    }
    const id = `c-${++this.memSeq}-${Math.random().toString(36).slice(2, 6)}`;
    const r: PersonRecord = {
      id, displayName: input.displayName,
      email: input.email ?? null, phone: input.phone ?? null,
      companyId: input.companyId ?? null,
      bandMemberId: input.bandMemberId ?? null,
      bandMemberName: null,
      bandMemberUpn: null,
      timesheetsEnabled: !!input.timesheetsEnabled,
      expensesEnabled: !!input.expensesEnabled,
      hasAppSignIn: false,  // in-memory mode: no password path
      createdAt: new Date().toISOString(),
    };
    this.memPeople.set(id, r);
    return r;
  }

  // ---- Assignments --------------------------------------------------------

  async listAssignments(opts?: { flowId?: string; personId?: string }): Promise<AssignmentRecord[]> {
    if (this.prisma.isAvailable) {
      const where: any = {};
      if (opts?.flowId) where.flowId = opts.flowId;
      if (opts?.personId) where.personId = opts.personId;
      const rows = await this.prisma.onboardingAssignment.findMany({
        where, include: { stepStates: true }, orderBy: { startedAt: 'desc' },
      });
      return rows.map(toAssignmentRecord);
    }
    return Array.from(this.memAssignments.values())
      .filter((a) => !opts?.flowId || a.flowId === opts.flowId)
      .filter((a) => !opts?.personId || a.personId === opts.personId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async getAssignment(id: string): Promise<AssignmentRecord | null> {
    if (this.prisma.isAvailable) {
      const row = await this.prisma.onboardingAssignment.findUnique({
        where: { id }, include: { stepStates: true },
      });
      return row ? toAssignmentRecord(row) : null;
    }
    return this.memAssignments.get(id) ?? null;
  }

  async getAssignmentByToken(token: string): Promise<AssignmentRecord | null> {
    if (this.prisma.isAvailable) {
      const row = await this.prisma.onboardingAssignment.findUnique({
        where: { publicToken: token }, include: { stepStates: true },
      });
      return row ? toAssignmentRecord(row) : null;
    }
    for (const a of this.memAssignments.values()) if (a.publicToken === token) return a;
    return null;
  }

  async createAssignment(flowId: string, personId: string): Promise<AssignmentRecord> {
    const token = mintToken();
    if (this.prisma.isAvailable) {
      // Seed a StepState row for every step in the flow so the timeline
      // renders immediately + the upload endpoint always has a row to
      // mutate. Status defaults to 'pending'.
      const steps = await this.prisma.onboardingStep.findMany({ where: { flowId }, select: { id: true } });
      const row = await this.prisma.onboardingAssignment.create({
        data: {
          flowId, personId, publicToken: token,
          stepStates: { create: steps.map((s) => ({ stepId: s.id })) },
        },
        include: { stepStates: true },
      });
      return toAssignmentRecord(row);
    }
    const id = `a-${++this.memSeq}-${Math.random().toString(36).slice(2, 6)}`;
    const flow = this.memFlows.get(flowId);
    const r: AssignmentRecord = {
      id, flowId, personId, publicToken: token,
      startedAt: new Date().toISOString(), completedAt: null,
      stepStates: (flow?.steps ?? []).map((s) => ({
        id: `ss-${++this.memSeq}`, assignmentId: id, stepId: s.id,
        status: 'pending',
        personFileKey: null, personFileUrl: null, personFileName: null,
        personMimeType: null, personSizeBytes: null,
        notes: null, completedAt: null, completedBy: null,
      })),
    };
    this.memAssignments.set(id, r);
    return r;
  }

  async rotateToken(id: string): Promise<string | null> {
    const token = mintToken();
    if (this.prisma.isAvailable) {
      const r = await this.prisma.onboardingAssignment.update({ where: { id }, data: { publicToken: token } }).catch(() => null);
      return r ? token : null;
    }
    const a = this.memAssignments.get(id);
    if (!a) return null;
    a.publicToken = token;
    return token;
  }

  // ---- Step state transitions --------------------------------------------

  async markStepComplete(assignmentId: string, stepId: string, completedBy: string, notes?: string): Promise<StepStateRecord | null> {
    return this.transitionStep(assignmentId, stepId, 'completed', { completedBy, notes });
  }
  async rejectStep(assignmentId: string, stepId: string, completedBy: string, notes?: string): Promise<StepStateRecord | null> {
    return this.transitionStep(assignmentId, stepId, 'rejected', { completedBy, notes });
  }
  async markStepInProgress(assignmentId: string, stepId: string): Promise<StepStateRecord | null> {
    return this.transitionStep(assignmentId, stepId, 'in_progress', {});
  }
  async resetStep(assignmentId: string, stepId: string): Promise<StepStateRecord | null> {
    return this.transitionStep(assignmentId, stepId, 'pending', {});
  }

  private async transitionStep(
    assignmentId: string,
    stepId: string,
    status: StepStatus,
    extra: { completedBy?: string; notes?: string },
  ): Promise<StepStateRecord | null> {
    const completedAt = status === 'completed' ? new Date() : null;
    if (this.prisma.isAvailable) {
      const data: any = { status, completedAt, notes: extra.notes ?? null };
      if (extra.completedBy) data.completedBy = extra.completedBy;
      const r = await this.prisma.onboardingStepState.update({
        where: { assignmentId_stepId: { assignmentId, stepId } },
        data,
      }).catch(() => null);
      if (r && status === 'completed') {
        await this.maybeFinalizeAssignment(assignmentId);
      }
      return r ? toStepStateRecord(r) : null;
    }
    const a = this.memAssignments.get(assignmentId);
    if (!a) return null;
    const s = a.stepStates.find((s) => s.stepId === stepId);
    if (!s) return null;
    s.status = status;
    s.completedAt = completedAt ? completedAt.toISOString() : null;
    if (extra.completedBy) s.completedBy = extra.completedBy;
    if (extra.notes !== undefined) s.notes = extra.notes ?? null;
    if (status === 'completed' && a.stepStates.every((x) => x.status === 'completed')) {
      a.completedAt = new Date().toISOString();
    }
    return s;
  }

  private async maybeFinalizeAssignment(assignmentId: string): Promise<void> {
    if (!this.prisma.isAvailable) return;
    const a = await this.prisma.onboardingAssignment.findUnique({
      where: { id: assignmentId }, include: { stepStates: true },
    });
    if (!a) return;
    const allDone = a.stepStates.length > 0 && a.stepStates.every((s) => s.status === 'completed');
    if (allDone && !a.completedAt) {
      await this.prisma.onboardingAssignment.update({
        where: { id: assignmentId }, data: { completedAt: new Date() },
      });
    }
  }

  // Person upload — replaces any previously-uploaded file for this
  // step state. Bumps status to 'in_progress' so the admin sees it in
  // the Approvals queue. For 'person_uploads' steps it stays
  // in_progress (waiting on admin review). The admin marks completed
  // separately via markStepComplete.
  async personUpload(
    assignmentId: string,
    stepId: string,
    file: { fileName: string; mimeType: string; bytes: Buffer },
  ): Promise<StepStateRecord | null> {
    const up = await this.storage.upload(file);
    if (this.prisma.isAvailable) {
      const r = await this.prisma.onboardingStepState.update({
        where: { assignmentId_stepId: { assignmentId, stepId } },
        data: {
          personStorage: this.storage.driver,
          personFileKey: up.key, personFileUrl: up.url,
          personFileName: file.fileName,
          personMimeType: up.mimeType ?? file.mimeType,
          personSizeBytes: up.sizeBytes ?? file.bytes.length,
          status: 'in_progress',
        },
      }).catch(() => null);
      return r ? toStepStateRecord(r) : null;
    }
    const a = this.memAssignments.get(assignmentId);
    const s = a?.stepStates.find((s) => s.stepId === stepId);
    if (!s) return null;
    s.personFileKey = up.key;
    s.personFileUrl = up.url;
    s.personFileName = file.fileName;
    s.personMimeType = up.mimeType ?? file.mimeType;
    s.personSizeBytes = up.sizeBytes ?? file.bytes.length;
    s.status = 'in_progress';
    return s;
  }
}

// ---- mappers --------------------------------------------------------------

function toFlowRecord(row: any): FlowRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    companyId: row.companyId,
    active: row.active,
    steps: (row.steps ?? []).map(toStepRecord),
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    createdBy: row.createdBy,
    updatedAt: (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)).toISOString(),
  };
}
function toStepRecord(row: any): StepRecord {
  return {
    id: row.id,
    flowId: row.flowId,
    order: row.order,
    title: row.title,
    instructions: row.instructions,
    completion: row.completion,
    documents: (row.documentLinks ?? []).map((d: any) => ({ id: d.id, documentId: d.documentId, personUploadAllowed: d.personUploadAllowed })),
    links: (row.links ?? []).map((l: any) => ({ id: l.id, label: l.label, url: l.url })),
  };
}
function toPersonRecord(row: any): PersonRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    companyId: row.companyId,
    bandMemberId: row.bandMemberId ?? null,
    bandMemberName: row.bandMember?.name ?? null,
    bandMemberUpn: row.bandMember?.upn ?? null,
    timesheetsEnabled: !!row.timesheetsEnabled,
    expensesEnabled: !!row.expensesEnabled,
    // Boolean only — never expose the hash itself. A Person with a
    // linked BandMember can't have a password (link transaction nulls
    // it), so this is implicitly false there.
    hasAppSignIn: !!row.passwordHash && !row.bandMemberId,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
  };
}
function toAssignmentRecord(row: any): AssignmentRecord {
  return {
    id: row.id,
    flowId: row.flowId,
    personId: row.personId,
    publicToken: row.publicToken,
    startedAt: (row.startedAt instanceof Date ? row.startedAt : new Date(row.startedAt)).toISOString(),
    completedAt: row.completedAt ? (row.completedAt instanceof Date ? row.completedAt : new Date(row.completedAt)).toISOString() : null,
    stepStates: (row.stepStates ?? []).map(toStepStateRecord),
  };
}
function toStepStateRecord(row: any): StepStateRecord {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    stepId: row.stepId,
    status: row.status,
    personFileKey: row.personFileKey,
    personFileUrl: row.personFileUrl,
    personFileName: row.personFileName,
    personMimeType: row.personMimeType,
    personSizeBytes: row.personSizeBytes,
    notes: row.notes,
    completedAt: row.completedAt ? (row.completedAt instanceof Date ? row.completedAt : new Date(row.completedAt)).toISOString() : null,
    completedBy: row.completedBy,
  };
}
