import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Logger, NotFoundException, OnApplicationBootstrap, Param, Post, Patch, Query, Req, Res } from '@nestjs/common';
import { TimekeepingReportsService } from './timekeeping-reports.service';
import { OnboardingService } from './onboarding.service';
import { deriveAppRole } from './role-derivation';
import { DataService } from './data.service';
import { Roles, callerRole } from './roles';
import { GraphFeedService, FeedItem, AppRole } from './graph-feed.service';
import { PrismaService } from './prisma.service';
import { ExoService } from './exo.service';
import { MailboxReconcileService } from './mailbox-reconcile.service';
import { SKINTYEE_SECURITY_GROUPS, groupBySlug, isInvitableGroupBlacklisted } from './skintyee-groups';

// Map a Prisma BandMember row → the BandMember shape the app expects.
// Shared between Directory list / get / PATCH so the mapping stays
// consistent (the "Member not found" bug from earlier was a divergent
// mapping between list and get).
function mapBandMember(r: any) {
  return {
    _id: r.id,
    name: r.name,
    role: r.role,
    title: r.title ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    avatarLetter: r.avatarLetter ?? undefined,
    upn: r.upn,
    department: r.department ?? undefined,
    appRole: r.appRole,
    accountType: r.accountType,
    mailboxMemberships: r.mailboxMemberships
      ? r.mailboxMemberships.split(',').filter(Boolean)
      : [],
    bandGroups: r.bandGroups
      ? r.bandGroups.split(',').filter(Boolean)
      : [],
    managerId:   r.managerId   ?? undefined,
    managerName: r.managerName ?? undefined,
    managerUpn:  r.managerUpn  ?? undefined,
    hasPhoto:    r.hasPhoto,
  };
}

// ---- Health ---------------------------------------------------------------
// Public liveness endpoint hit by:
//   - the Container App's HEALTHCHECK directive in api/Dockerfile
//   - the deploy-api pipeline's smoke test (post-revision-swap)
// Kept deliberately bare: no DB call, no business logic — anything that
// could fail independently of "the process is up" makes a bad liveness probe.
// Returns 200 + a tiny JSON body. Mounted at /v1/health (globalPrefix is 'v1').
@Controller('health')
export class HealthController {
  @Get() check() {
    return { status: 'ok', uptime: process.uptime() };
  }
}

// ---- Auth -----------------------------------------------------------------
@Controller('auth')
export class AuthController {
  @Get('me')
  me(@Req() req: any) {
    const role = callerRole(req);
    const names: Record<string, string> = { admin: 'Sandra Williams', staff: 'Joseph Alec', member: 'Rita Thomas', public: 'Guest' };
    return { id: `u-${role}`, name: names[role] ?? 'Guest', email: '', role };
  }
}

// ---- Directory ------------------------------------------------------------
// Reads from Postgres (Prisma) when available; falls back to DataService's
// in-memory mock if Prisma can't connect. The Postgres data is seeded from
// Microsoft Entra by /v1/admin/seed-directory.
//
// Safety net: if the table is unexpectedly empty when a request lands
// (e.g. a dev truncated it mid-session), we kick off a background seed.
// The current request returns [] but the next refresh shows the data —
// the truncate-then-no-restart gap no longer leaves the dev stuck.
@Controller('directory')
export class DirectoryController {
  private readonly log = new Logger(DirectoryController.name);
  private backgroundSeedRunning = false;

  constructor(
    private data: DataService,
    private prisma: PrismaService,
    private graph: GraphFeedService,
    private exo: ExoService,
  ) {}

  private async backgroundSeed(): Promise<void> {
    if (this.backgroundSeedRunning) return;
    this.backgroundSeedRunning = true;
    try {
      this.log.warn('BandMember table empty — kicking off background seed from Entra');
      const entraUsers = await this.graph.getDirectory();
      for (const u of entraUsers) {
        try {
          await this.prisma.bandMember.upsert({
            where: { id: u.id },
            create: {
              id: u.id, upn: u.upn, email: u.email, name: u.name, role: u.role,
              title: u.title, department: u.department, phone: u.phone,
              avatarLetter: u.avatarLetter, appRole: u.appRole,
              accountType: u.accountType,
              mailboxMemberships: u.mailboxMemberships.join(','),
              bandGroups: u.bandGroups.join(','),
              managerId: u.managerId, managerName: u.managerName, managerUpn: u.managerUpn,
              hasPhoto: u.hasPhoto,
              enabled: u.enabled,
            },
            update: {
              upn: u.upn, email: u.email, name: u.name, role: u.role,
              title: u.title, department: u.department, phone: u.phone,
              avatarLetter: u.avatarLetter, appRole: u.appRole,
              accountType: u.accountType,
              mailboxMemberships: u.mailboxMemberships.join(','),
              bandGroups: u.bandGroups.join(','),
              managerId: u.managerId, managerName: u.managerName, managerUpn: u.managerUpn,
              hasPhoto: u.hasPhoto,
              enabled: u.enabled, syncedAt: new Date(),
            },
          });
        } catch (e) {
          this.log.warn(`background seed: upsert failed for ${u.upn}: ${e}`);
        }
      }
      this.log.log(`background seed done: ${entraUsers.length} users`);
    } catch (e) {
      this.log.warn(`background seed failed: ${e}`);
    } finally {
      this.backgroundSeedRunning = false;
    }
  }

  @Get() async list() {
    if (this.prisma.isAvailable) {
      const rows = await this.prisma.bandMember.findMany({
        where: { enabled: true },
        orderBy: { name: 'asc' },
      });
      // Empty table → kick off async seed; current request still returns [].
      if (rows.length === 0 && process.env.GRAPH_CLIENT_ID) {
        setImmediate(() => this.backgroundSeed());
      }
      return rows.map(mapBandMember);
    }
    return this.data.directory;
  }

  @Get(':id') async get(@Param('id') id: string) {
    if (this.prisma.isAvailable) {
      const r = await this.prisma.bandMember.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('Not found');
      return mapBandMember(r);
    }
    return found(this.data.directory.find((m) => m._id === id));
  }

  // PATCH /v1/directory/:id/mailbox-access — set the shared mailboxes this
  // user has FullAccess + SendAs on. Body: { mailboxes: string[] } — UPNs
  // of the desired mailbox set. Diff vs DB-recorded current, call ExoService
  // grant/revoke per change, then update DB.
  //
  // Persisted to mailboxMemberships column as "upn|fullaccess" entries
  // alongside any pre-existing manual entries. Source of truth: EXO.
  //
  // admin-only. Requires EXO_FUNCTION_URL configured.
  @Patch(':id/mailbox-access') @Roles('admin') async setMailboxAccess(
    @Param('id') id: string,
    @Body() b: { mailboxes?: string[] }
  ) {
    if (!this.prisma.isAvailable) {
      throw new NotFoundException('Prisma not connected');
    }
    if (!this.exo.isAvailable) {
      throw new Error('EXO function not configured — run scripts/setup-exo-function.sh');
    }
    const r = await this.prisma.bandMember.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Not found');

    const desired = new Set((b?.mailboxes ?? []).map((m) => m.toLowerCase()));

    // DB-tracked current "fullaccess" entries (we treat those as the EXO
    // truth for diffing). Anything tagged with "owner"/"member" etc. is
    // a M365-group relationship and stays untouched.
    const existingMemberships = r.mailboxMemberships
      ? r.mailboxMemberships.split(',').filter(Boolean)
      : [];
    const currentFA = new Set<string>();
    const otherEntries: string[] = [];
    for (const raw of existingMemberships) {
      const [mail, rel] = raw.split('|');
      if (rel === 'fullaccess') currentFA.add(mail.toLowerCase());
      else otherEntries.push(raw);
    }

    const toAdd    = [...desired].filter((m) => !currentFA.has(m));
    const toRemove = [...currentFA].filter((m) => !desired.has(m));

    this.log.log(`PATCH /directory/${id}/mailbox-access: +${toAdd.join(',') || '∅'} -${toRemove.join(',') || '∅'}`);

    for (const mbx of toAdd) {
      await this.exo.grantAccess(mbx, r.upn);
    }
    for (const mbx of toRemove) {
      await this.exo.revokeAccess(mbx, r.upn);
    }

    // Persist new state. Preserve non-fullaccess entries (M365 group
    // memberships derived during seed).
    const merged = [
      ...[...desired].map((m) => `${m}|fullaccess`),
      ...otherEntries,
    ];
    const updated = await this.prisma.bandMember.update({
      where: { id },
      data: { mailboxMemberships: merged.join(','), syncedAt: new Date() },
    });

    return mapBandMember(updated);
  }

  // PATCH /v1/directory/:id/groups — write-back endpoint for the EditMember
  // screen. Body: { groups: string[] } — array of slugs from the catalog
  // (src/skintyee-groups.ts). Diff against current Entra membership, POST
  // adds + DELETE removes via Graph, then re-save the row.
  //
  // admin-only. Requires the Group.ReadWrite.All application permission.
  @Patch(':id/groups') @Roles('admin') async setGroups(
    @Param('id') id: string,
    @Body() b: { groups?: string[] }
  ) {
    if (!this.prisma.isAvailable) {
      throw new NotFoundException('Prisma not connected — set DATABASE_URL and re-deploy');
    }
    const r = await this.prisma.bandMember.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Not found');

    // Validate slugs against the catalog; reject unknown ones.
    const requested = Array.isArray(b?.groups) ? b.groups : [];
    const unknown   = requested.filter((s) => !groupBySlug.has(s));
    if (unknown.length) {
      throw new Error(`Unknown group slugs: ${unknown.join(', ')}. Known: ${SKINTYEE_SECURITY_GROUPS.map((g) => g.slug).join(', ')}`);
    }

    // DB's current bandGroups acts as the "before" — using Graph's read
    // for this would race with eventual consistency immediately after a
    // previous PATCH. If DB and Entra drift, the next add/remove tolerates
    // 400 "already exists" / 404 "not found", so it self-heals.
    const currentSlugs = r.bandGroups ? r.bandGroups.split(',').filter(Boolean) : [];

    // Push the diff to Entra
    const finalSlugs = await this.graph.setUserBandGroups(id, requested, currentSlugs);

    // Persist locally
    const updated = await this.prisma.bandMember.update({
      where: { id },
      data: { bandGroups: finalSlugs.join(','), syncedAt: new Date() },
    });

    this.log.log(`PATCH /directory/${id}/groups: now ${finalSlugs.join(',') || '(none)'}`);
    return mapBandMember(updated);
  }

  // GET /v1/directory/:id/photo — proxy the user's Entra profile photo
  // binary from Microsoft Graph. The api/ has the app-only credential;
  // the app/ just hits this URL as <Avatar.Image source={…} />.
  //
  // Returns 404 if hasPhoto is false (avoid a Graph call we know will
  // fail). Sets a 1-hour Cache-Control so subsequent requests skip the
  // Graph round-trip entirely.
  @Get(':id/photo')
  async photo(@Param('id') id: string, @Req() req: any) {
    if (this.prisma.isAvailable) {
      const r = await this.prisma.bandMember.findUnique({ where: { id }, select: { hasPhoto: true } });
      if (!r?.hasPhoto) throw new NotFoundException('No photo');
    }
    const { buffer, contentType } = await this.graph.fetchPhoto(id);
    const res = req.res;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Length', buffer.byteLength.toString());
    res.end(buffer);
  }

  @Post() @Roles('admin') create(@Body() b: any) { const m = { _id: this.data.id('m'), ...b }; this.data.directory.unshift(m); return m; }
  @Patch(':id') @Roles('admin') update(@Param('id') id: string, @Body() b: any) { return upsert(this.data.directory, id, b); }
  @Delete(':id') @Roles('admin') @HttpCode(204) remove(@Param('id') id: string) { remove(this.data.directory, id); }
}

// ---- Admin: seed directory from Entra -------------------------------------
// Pulls all enabled users from the skintyeenation Entra tenant + upserts
// them into the BandMember Postgres table. Idempotent — upsert by Entra
// object id; can be re-run any time.
//
// Two trigger paths:
//
//   1. **Auto on app bootstrap** — if the BandMember table is EMPTY when
//      the api/ starts, seed it. Anyone deploying for the first time, or
//      anyone starting against a fresh local Postgres, gets users
//      without manual intervention. We DON'T re-seed on every restart
//      because that would burn Graph quota + clobber any hand-edits.
//
//   2. **Manual POST /v1/admin/seed-directory** — admin-only endpoint
//      to force a fresh sync (e.g. after someone joins or leaves M365).
//
@Controller('admin')
export class AdminController implements OnApplicationBootstrap {
  private readonly log = new Logger(AdminController.name);

  constructor(
    private graph: GraphFeedService,
    private prisma: PrismaService,
    private reconcile: MailboxReconcileService,
  ) {}

  // NestJS lifecycle hook — fires once after the app starts listening.
  async onApplicationBootstrap() {
    // Don't block startup on seed failures
    setImmediate(() => this.maybeSeedOnStartup());
  }

  private async maybeSeedOnStartup(): Promise<void> {
    if (!this.prisma.isAvailable) {
      this.log.warn('Prisma not connected — skipping startup seed');
      return;
    }
    try {
      const count = await this.prisma.bandMember.count();
      if (count > 0) {
        this.log.log(`startup seed skipped: BandMember table already has ${count} rows`);
        return;
      }
      if (!process.env.GRAPH_CLIENT_ID || !process.env.GRAPH_CLIENT_SECRET || !process.env.GRAPH_TENANT_ID) {
        this.log.warn('GRAPH_* env vars not set — skipping startup seed (set them in .env then restart)');
        return;
      }
      this.log.log('startup seed starting: BandMember table is empty, pulling from Entra…');
      const result = await this.seedDirectory();
      this.log.log(`startup seed done: ${result.total} users (${result.inserted} new, ${result.updated} existing, ${result.disabled} disabled)`);
    } catch (e) {
      this.log.warn(`startup seed failed (api/ stays up): ${e}`);
    }
  }

  @Post('seed-directory') @Roles('admin')
  async seedDirectory() {
    if (!this.prisma.isAvailable) {
      throw new NotFoundException('Prisma not connected — set DATABASE_URL and re-deploy');
    }

    let entraUsers: Awaited<ReturnType<typeof this.graph.getDirectory>>;
    try {
      this.log.log('seed-directory: fetching users from Microsoft Graph…');
      entraUsers = await this.graph.getDirectory();
      this.log.log(`seed-directory: Graph returned ${entraUsers.length} band-member candidates`);
    } catch (e: any) {
      this.log.error(`seed-directory: Graph fetch failed: ${e?.message ?? e}`, e?.stack);
      // Surface the actual error to the client instead of generic 500.
      throw new Error(`Graph fetch failed: ${e?.message ?? e}`);
    }

    let inserted = 0;
    let updated = 0;

    for (const u of entraUsers) {
      try {
        const existing = await this.prisma.bandMember.findUnique({ where: { id: u.id } });
      // Merge graph-derived memberships with any manual additions an admin
      // has made (preserve hand-edits that would otherwise be lost on
      // re-seed). Graph memberships come from M365 Group memberOf; manual
      // ones live in extras like classic shared-mailbox grants.
      const graphMemberships = new Set(u.mailboxMemberships.map((m) => m.toLowerCase()));
      const existingExtras = existing?.mailboxMemberships
        ? existing.mailboxMemberships.split(',').filter(Boolean).filter((m) => !graphMemberships.has(m))
        : [];
      const merged = [...graphMemberships, ...existingExtras];

      await this.prisma.bandMember.upsert({
        where: { id: u.id },
        create: {
          id: u.id, upn: u.upn, email: u.email, name: u.name, role: u.role,
          title: u.title, department: u.department, phone: u.phone,
          avatarLetter: u.avatarLetter, appRole: u.appRole,
          accountType: u.accountType,
          mailboxMemberships: merged.join(','),
          bandGroups: u.bandGroups.join(','),
          managerId: u.managerId, managerName: u.managerName, managerUpn: u.managerUpn,
          hasPhoto: u.hasPhoto,
          enabled: u.enabled,
        },
        update: {
          upn: u.upn, email: u.email, name: u.name, role: u.role,
          title: u.title, department: u.department, phone: u.phone,
          avatarLetter: u.avatarLetter, appRole: u.appRole,
          accountType: u.accountType,
          mailboxMemberships: merged.join(','),
          bandGroups: u.bandGroups.join(','),
          managerId: u.managerId, managerName: u.managerName, managerUpn: u.managerUpn,
          hasPhoto: u.hasPhoto,
          enabled: u.enabled, syncedAt: new Date(),
        },
      });
        if (existing) updated++; else inserted++;
      } catch (e: any) {
        // Log + skip the bad row, don't tank the whole seed.
        this.log.warn(`seed-directory: upsert failed for ${u.upn} (${u.id}): ${e?.message ?? e}`);
      }
    }

    // Mark anyone NOT in this Entra response as disabled (departed)
    const allIds = entraUsers.map((u) => u.id);
    const { count: disabledCount } = await this.prisma.bandMember.updateMany({
      where: { id: { notIn: allIds }, enabled: true },
      data: { enabled: false },
    });

    // Pull Exchange Online truth into mailboxMemberships (|fullaccess
    // entries). Non-fatal — if EXO function isn't configured, skipped.
    let reconcile: { users: number; mailboxes: number; grants: number } = { users: 0, mailboxes: 0, grants: 0 };
    try {
      reconcile = await this.reconcile.reconcileAll();
    } catch (e: any) {
      this.log.warn(`seed-directory: EXO reconcile failed: ${e?.message ?? e}`);
    }

    return {
      ok: true,
      total: entraUsers.length,
      inserted,
      updated,
      disabled: disabledCount,
      reconcile,
      syncedAt: new Date().toISOString(),
    };
  }

  // POST /v1/admin/sync — full re-sync trigger from the Directory's
  // sync button. Pulls fresh user data from Entra, then reconciles EXO
  // mailbox permissions. Same as seedDirectory + extra logging.
  @Post('sync') @Roles('admin')
  async sync() {
    return this.seedDirectory();
  }

  // POST /v1/admin/reconcile-mailboxes — admin-trigger for ONLY the EXO
  // reconcile step (skip the Entra fetch). Faster when you've just done
  // some EXO admin work and want the DB caught up immediately.
  @Post('reconcile-mailboxes') @Roles('admin')
  async reconcileMailboxes() {
    return this.reconcile.reconcileAll();
  }

  // PATCH /v1/admin/users/:upn/mailbox-memberships — overwrite the user's
  // mailbox-memberships list. For classic shared mailboxes (chief@,
  // councillor1@, etc.) where permissions live in Exchange Online and
  // aren't readable from Graph v1.0, an admin curates the list manually
  // here. The auto-seed merges (doesn't overwrite) these on re-run, so
  // hand-edits survive subsequent syncs.
  //
  // Body: { mailboxes: ["chief@skintyee.ca", "council@skintyee.ca", …] }
  @Patch('users/:upn/mailbox-memberships') @Roles('admin')
  async setMailboxMemberships(@Param('upn') upn: string, @Body() body: { mailboxes?: string[] }) {
    if (!this.prisma.isAvailable) {
      throw new NotFoundException('Prisma not connected');
    }
    const mailboxes = (body.mailboxes ?? []).map((m) => m.toLowerCase()).filter(Boolean);
    const row = await this.prisma.bandMember.update({
      where: { upn: upn.toLowerCase() },
      data: { mailboxMemberships: mailboxes.join(',') },
      select: { upn: true, name: true, mailboxMemberships: true },
    });
    return {
      upn: row.upn,
      name: row.name,
      mailboxMemberships: row.mailboxMemberships ? row.mailboxMemberships.split(',').filter(Boolean) : [],
    };
  }

  // GET /v1/admin/role-for/:upn — look up the effective app-role for a
  // UPN. Used during sign-in (and the Unspoof flow) to derive the
  // signed-in user's app role.
  //
  // The role is layered:
  //   1. BandMember.appRole (Entra-derived: security groups + job
  //      title heuristic — see api/src/graph-feed.service.ts).
  //   2. If a Person row exists for this UPN (matched on either the
  //      linked BandMember.upn or Person.email) AND
  //      timesheetsEnabled=true, bump the role to 'staff' when the
  //      base is below that. Admins stay admin; staff stay staff;
  //      member/public who are timesheet workers get the staff
  //      surface they need to act on Time Keeping screens.
  //
  // Returns 'public' when the UPN isn't found in either table
  // (anonymous baseline).
  @Get('role-for/:upn')
  async roleFor(@Param('upn') upn: string) {
    if (!this.prisma.isAvailable) {
      return { upn, appRole: 'public', source: 'no-db-fallback' };
    }
    const u = upn.toLowerCase();
    const bm = await this.prisma.bandMember.findUnique({
      where: { upn: u },
      select: { upn: true, appRole: true, name: true, enabled: true },
    });
    const baseRole: string = (bm && bm.enabled) ? bm.appRole : 'public';
    // People-based bump — a Person row with timesheetsEnabled=true is
    // a worker. Workers need at least the staff surface so they see
    // operational tools (timesheets, etc.). Staff don't have to be
    // 365 / Entra users — external contractors with no BandMember row
    // still qualify, matched purely by Person.email = upn.
    const personRow = await this.prisma.person.findFirst({
      where: {
        timesheetsEnabled: true,
        OR: [
          { email: { equals: u, mode: 'insensitive' } },
          { bandMember: { upn: { equals: u, mode: 'insensitive' } } },
        ],
      },
      select: { id: true, displayName: true },
    });
    const rank: Record<string, number> = { public: 0, member: 1, staff: 2, admin: 3 };
    const effective = personRow && (rank[baseRole] ?? 0) < rank.staff
      ? 'staff'
      : baseRole;
    return {
      upn: bm?.upn ?? u,
      appRole: effective,
      // Fall back to the Person.displayName when there's no BandMember
      // row (typical for external contractors) so the app has a name
      // to render.
      name: bm?.name ?? personRow?.displayName ?? undefined,
      source: bm
        ? (effective === baseRole ? 'db' : 'db+people-bump')
        : (personRow ? 'people-bump' : 'not-found'),
    };
  }

  // GET /v1/admin/security-groups — return the catalog of the 13 Entra
  // security groups used as the app's role model. The EditMember screen
  // calls this to render its multi-select chip list.
  @Get('security-groups') @Roles('admin')
  securityGroups() {
    return SKINTYEE_SECURITY_GROUPS.map((g) => ({
      id: g.id,
      slug: g.slug,
      displayName: g.displayName,
      description: g.description,
      kind: g.kind,
    }));
  }

  // POST /v1/admin/users — Slice 1 + 4 of the member-provisioning
  // feature (docs/features/member-provisioning.md, ADR-15). Creates a
  // real Entra user via Graph, seats them into the picked security
  // groups, optionally chains a Person record with timesheets, and
  // upserts BandMember in Postgres so the directory shows the row
  // immediately. Returns the new user's id + UPN + the one-time
  // password (the only place the admin will see it).
  //
  // Slice 3 (license auto-provision) is a follow-up; this endpoint
  // doesn't call assignLicense yet — that needs the two extra Graph
  // perms granted via setup-app-graph.sh.
  @Post('users') @Roles('admin')
  async createUser(@Body() b: any) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected — set DATABASE_URL.');
    if (!b?.displayName || !b?.userPrincipalName || !b?.password) {
      throw new BadRequestException('displayName, userPrincipalName, password required.');
    }
    const mailNickname: string =
      b.mailNickname ?? String(b.userPrincipalName).split('@')[0];

    // Validate band-group slugs up-front so a partial Graph write isn't
    // rolled back. Unknown slugs fail fast.
    const groupSlugs: string[] = Array.isArray(b.bandGroups) ? b.bandGroups : [];
    const unknown = groupSlugs.filter((s) => !groupBySlug.has(s));
    if (unknown.length) {
      throw new BadRequestException(`Unknown group slugs: ${unknown.join(', ')}`);
    }

    // 1. Entra user via Graph
    const created = await this.graph.createBandMemberUser({
      displayName: b.displayName,
      mailNickname,
      userPrincipalName: b.userPrincipalName,
      jobTitle: b.jobTitle,
      department: b.department,
      mobilePhone: b.phone,
      password: b.password,
      usageLocation: b.usageLocation ?? 'CA',
      forceChangePasswordNextSignIn: b.forceChangePasswordNextSignIn ?? true,
    });

    // 2. Security-group adds (best-effort — collect per-slug failures
    //    so the admin can retry from EditMember).
    const failedGroups: string[] = [];
    if (groupSlugs.length) {
      try {
        await this.graph.setUserBandGroups(created.id, groupSlugs, []);
      } catch (e: any) {
        // setUserBandGroups throws on first failure today; surface
        // that as a list of all slugs so the admin retries the lot.
        this.log.warn(`createUser: group writes failed for ${created.id}: ${e?.message ?? e}`);
        failedGroups.push(...groupSlugs);
      }
    }
    const persistedSlugs = failedGroups.length ? [] : groupSlugs;

    // 3. Persistent BandMember row + appRole via shared derivation.
    const appRole = deriveAppRole({
      bandGroupSlugs: persistedSlugs,
      jobTitle: b.jobTitle,
    });
    const upn = created.userPrincipalName.toLowerCase();
    const bm = await this.prisma.bandMember.upsert({
      where: { id: created.id },
      create: {
        id: created.id,
        upn,
        email: upn,
        name: b.displayName,
        role: appRole === 'admin' ? 'Staff' : appRole === 'staff' ? 'Staff' : 'Member',
        title: b.jobTitle ?? null,
        department: b.department ?? null,
        phone: b.phone ?? null,
        avatarLetter: (b.displayName?.[0] ?? '?').toUpperCase(),
        appRole,
        accountType: 'licensed-user',
        bandGroups: persistedSlugs.join(','),
        enabled: true,
      },
      update: {
        upn, name: b.displayName, appRole,
        bandGroups: persistedSlugs.join(','),
      },
    });

    // 4. Optional Person record with timesheets enabled.
    let person: any = null;
    if (b.createPerson) {
      person = await this.prisma.person.upsert({
        where: { bandMemberId: bm.id },
        create: {
          displayName: b.displayName,
          email: upn,
          phone: b.phone ?? null,
          bandMemberId: bm.id,
          timesheetsEnabled: b.timesheetsEnabled !== false,
        },
        update: {
          displayName: b.displayName,
          email: upn,
          phone: b.phone ?? null,
          timesheetsEnabled: b.timesheetsEnabled !== false,
        },
      });
    }

    return {
      bandMember: mapBandMember(bm),
      personId: person?.id,
      oneTimePassword: b.password,
      failedGroups,
    };
  }

  // POST /v1/admin/users/:id/rotate-password — admin rotates a user's
  // password via Graph. Generates server-side OR accepts one from the
  // caller, returns it once. Sets forceChangePasswordNextSignIn=true so
  // the user has to change it on next sign-in. Separate from the main
  // EditMember save — admin explicitly opts in.
  @Post('users/:id/rotate-password') @Roles('admin')
  async rotatePassword(@Param('id') id: string, @Body() b: { password?: string }) {
    const newPassword = b?.password ?? generateAdminPassword();
    await this.graph.rotateUserPassword(id, newPassword);
    if (this.prisma.isAvailable) {
      await this.prisma.bandMember.update({
        where: { id },
        data: { syncedAt: new Date() },
      }).catch(() => null);
    }
    return { password: newPassword };
  }
}

// Server-side password generator for the rotate-password endpoint.
// Matches the AddMember client-side generator's shape so the password
// satisfies Entra's default complexity rules without retries.
function generateAdminPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out + 'a1!';
}

// ---- Events ---------------------------------------------------------------
@Controller('events')
export class EventsController {
  constructor(private data: DataService) {}
  @Get() list(@Req() req: any) {
    const role = callerRole(req);
    return role === 'public' ? this.data.events.filter((e) => e.public) : this.data.events;
  }
  @Get(':id') get(@Param('id') id: string) { return found(this.data.events.find((e) => e._id === id)); }
  @Post() @Roles('admin') create(@Body() b: any) { const e = { _id: this.data.id('e'), public: true, ...b }; this.data.events.unshift(e); return e; }
  @Patch(':id') @Roles('admin') update(@Param('id') id: string, @Body() b: any) { return upsert(this.data.events, id, b); }
  @Delete(':id') @Roles('admin') @HttpCode(204) remove(@Param('id') id: string) { remove(this.data.events, id); }
}

// ---- Meetings -------------------------------------------------------------
//
// Band Meetings come from real Microsoft 365 calendars when the GRAPH_*
// env vars are set: events are pulled from MEETING_SOURCE_CALENDARS
// (bandmanager@, Skin Tyee Council M365, Skin Tyee Management M365)
// and filtered by Outlook category (Band Meeting / Council Meeting /
// Staff Meeting / Public Event / Closed Session). See
// docs/features/meeting-types.md.
//
// Falls back to in-memory mock if Graph isn't configured.
import { SKINTYEE_MEETING_TYPES, MEETING_SOURCE_CALENDARS } from './skintyee-meeting-types';

@Controller('meetings')
export class MeetingsController {
  private readonly log = new Logger(MeetingsController.name);

  constructor(private data: DataService, private graph: GraphFeedService) {}

  // GET /v1/meetings — list upcoming band-tagged meetings from M365.
  // Optional ?type=<slug> filters to a single type. When the caller
  // sends a Bearer token (signed in), reads go DELEGATED so M365 group
  // calendars (band@, council@, management@) surface — those return
  // 403 to our app-only SP. App-only fallback only sees user calendars.
  @Get() @Roles('member', 'staff', 'admin') async list(@Query('type') type?: string, @Req() req?: any) {
    const authHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
    const accessToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (process.env.GRAPH_CLIENT_ID) {
      try {
        const items = await this.graph.getBandMeetings({ typeSlug: type, accessToken });
        // Map to the BandMeeting shape the app expects, preserving typeSlug.
        // conference + links are extracted from the Graph body by the
        // feed service so the agenda field on the client only carries
        // the user's prose.
        return items.map((m) => ({
          _id: m.id,
          title: m.title,
          agenda: m.agenda,
          location: m.location,
          startsAt: m.startsAt,
          endsAt: m.endsAt,
          cancelled: m.cancelled,
          type: m.typeSlug,
          source: m.source,
          sourceIndex: m.sourceIndex,
          organizerName: m.organizerName,
          organizerUpn: m.organizerUpn,
          attendees: m.attendees,
          isOnlineMeeting: m.isOnlineMeeting,
          joinUrl: m.joinUrl,
          webLink: m.webLink,
          conference: m.conference,
          links: m.links,
        }));
      } catch (e: any) {
        this.log.warn(`Graph fetch failed, falling back to mock: ${e?.message ?? e}`);
      }
    }
    return this.data.meetings;
  }

  // GET /v1/meetings/types — catalog of meeting types + source calendars
  // + invitable mail-enabled groups. Drives the schedule-meeting screen's
  // chip selector AND the invitees modal's Groups section.
  @Get('types') @Roles('member', 'staff', 'admin') types() {
    return {
      types: SKINTYEE_MEETING_TYPES,
      sources: MEETING_SOURCE_CALENDARS.map((s, i) => ({
        index: i,
        kind: s.kind,
        name: s.name,
        ...(s.kind === 'user'  ? { upn: s.upn } :
            s.kind === 'group' ? { groupId: s.groupId } :
                                   {}),
      })),
      // M365 groups that have a mail address can be invited to a meeting
      // as a single attendee — Outlook expands the group to its members
      // when delivering. Only m365 'kind' groups qualify; Entra security
      // groups don't have a routable mailbox. Blacklisted mails (see
      // INVITABLE_GROUP_MAIL_BLACKLIST in skintyee-groups.ts) are
      // suppressed — ops groups that exist in Entra but shouldn't be
      // invitable to community meetings.
      invitableGroups: SKINTYEE_SECURITY_GROUPS
        .filter((g) => g.kind === 'm365' && g.mail && !isInvitableGroupBlacklisted(g.mail))
        .map((g) => ({
          slug: g.slug,
          displayName: g.displayName,
          mail: g.mail!,
        })),
    };
  }

  // POST /v1/meetings — schedule a new meeting AS the signed-in admin
  // (delegated flow). The user's Bearer access token from Entra sign-in
  // is forwarded to Graph so the meeting's organizer is the human
  // scheduling it (not bandmanager@ or our app's SP).
  //
  // Body: { typeSlug, sourceIndex?, title, agenda?, location?,
  //         startsAt, endsAt?, isOnlineMeeting?, attendees? }
  //
  // Required delegated scopes on the user's token (added in
  // setup-app-signin.sh):
  //   - Calendars.ReadWrite — write to user/shared calendars
  //   - Group.ReadWrite.All — write to M365 group calendars
  //
  // sourceIndex maps to MEETING_SOURCE_CALENDARS:
  //   0: My calendar              (always allowed)
  //   1: bandmanager@             (allowed if user has FullAccess via EXO)
  //   2: Skin Tyee Council (M365) (allowed if user is a group member/owner)
  //   3: Skin Tyee Management (M365)
  @Post() @Roles('admin') async create(@Body() b: any, @Req() req: any) {
    // Extract delegated Bearer token from the inbound request
    const authHeader = req.headers?.authorization ?? req.headers?.Authorization;
    const accessToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (accessToken && process.env.GRAPH_CLIENT_ID) {
      try {
        const created = await this.graph.createBandMeetingAs({ accessToken, input: b });
        return created;
      } catch (e: any) {
        this.log.error(`createBandMeetingAs failed: ${e?.message ?? e}`);
        throw new Error(`Graph create failed: ${e?.message ?? e}`);
      }
    }
    if (!accessToken) {
      this.log.warn('POST /meetings without Bearer token; falling back to in-memory create');
    }
    // No token (or no Graph configured) — fall back to in-memory create
    const m = { _id: this.data.id('bm'), ...b };
    this.data.meetings.unshift(m);
    return m;
  }

  // PATCH /v1/meetings/:id — update an event in-place via Graph (delegated).
  // Body: { sourceIndex, typeSlug?, title?, agenda?, location?, startsAt?,
  //         endsAt?, isOnlineMeeting?, attendees? }
  // sourceIndex is required so we know which calendar path to PATCH.
  @Patch(':id') @Roles('admin') async update(@Param('id') id: string, @Body() b: any, @Req() req: any) {
    const authHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
    const accessToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (accessToken && process.env.GRAPH_CLIENT_ID && typeof b?.sourceIndex === 'number') {
      try {
        return await this.graph.updateBandMeetingAs({
          accessToken,
          eventId: id,
          sourceIndex: b.sourceIndex,
          input: b,
        });
      } catch (e: any) {
        this.log.error(`updateBandMeetingAs failed: ${e?.message ?? e}`);
        throw new Error(`Graph update failed: ${e?.message ?? e}`);
      }
    }
    // No token or no sourceIndex — fall back to in-memory mutation
    return upsert(this.data.meetings, id, b);
  }

  // DELETE /v1/meetings/:id — body or query string carries sourceIndex.
  // Real deletes go through Graph; falls back to in-memory if not signed
  // in or sourceIndex absent.
  @Delete(':id') @Roles('admin') @HttpCode(204) async remove(
    @Param('id') id: string,
    @Query('sourceIndex') q?: string,
    @Req() req?: any
  ) {
    const sourceIndex = q != null ? Number(q) : NaN;
    const authHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
    const accessToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (accessToken && process.env.GRAPH_CLIENT_ID && Number.isFinite(sourceIndex)) {
      try {
        await this.graph.deleteBandMeetingAs({ accessToken, eventId: id, sourceIndex });
        return;
      } catch (e: any) {
        this.log.error(`deleteBandMeetingAs failed: ${e?.message ?? e}`);
        throw new Error(`Graph delete failed: ${e?.message ?? e}`);
      }
    }
    remove(this.data.meetings, id);
  }
}

// ---- Transparency ---------------------------------------------------------
@Controller('transparency')
export class TransparencyController {
  constructor(private data: DataService) {}
  @Get('expenditures') expenditures() { return this.data.expenditures; }
  @Get('major-projects') majorProjects() { return this.data.majorProjects; }
}

// ---- Financials -----------------------------------------------------------
@Controller('financials')
export class FinancialsController {
  constructor(private data: DataService) {}
  @Get() @Roles('admin') list() { return this.data.financials; }
}

// ---- Time Keeping ---------------------------------------------------------
//
// Bi-weekly pay-period timesheets backed by Postgres (Timesheet +
// TimesheetEntry models). See docs/features/timesheets.md for the
// design — pay periods themselves are computed from
// api/src/skintyee-pay-periods.ts (no DB rows for periods).
//
// Lifecycle: draft → submitted → approved | rejected
// OT rule: hours > 40 in either week of the 14-day period bumps
//   requiresAdminApproval=true; band-manager approvals are blocked
//   and only admin appRole can sign off.
//
// Legacy /v1/timekeeping/entries endpoints kept (DataService-backed)
// until the old TimeKeeping page is rewritten against the new model.

import {
  PAY_PERIOD_CONFIG,
  PayPeriod,
  payPeriodFor,
  recentPayPeriods,
} from './skintyee-pay-periods';
import dayjs from 'dayjs';

type SubmitBody = {
  entries: Array<{
    date: string;
    hours: number;
    task: string;
    timeIn?: string;     // "HH:mm" optional clock-in (audit field)
    timeOut?: string;    // "HH:mm" optional clock-out
  }>;
  notes?: string;
};

function callerUpn(req: any): string {
  const upn = (req?.headers?.['x-upn'] as string) || '';
  if (!upn) throw new Error('x-upn header required (or Bearer when delegated auth lands)');
  return upn.toLowerCase();
}

// Decimal hours between two HH:mm strings. Returns 0 for invalid /
// missing input, rounds to 2dp. Treats out < in as 0 (no midnight-
// wrap handling — workers should split into two entries instead).
function hoursBetween(timeIn?: string | null, timeOut?: string | null): number {
  if (!timeIn || !timeOut) return 0;
  const m = (s: string) => {
    const parts = s.split(':');
    if (parts.length !== 2) return NaN;
    const h = parseInt(parts[0], 10);
    const mi = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(mi)) return NaN;
    return h * 60 + mi;
  };
  const a = m(timeIn), b = m(timeOut);
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.round(((b - a) / 60) * 100) / 100;
}

// Apply auto-compute: if an entry has both timeIn + timeOut, that
// determines hours (overriding any client-sent value — server is the
// authority). Frontend mirrors this for live tallies.
function applyAutoHours(entries: SubmitBody['entries']): SubmitBody['entries'] {
  return entries.map((e) => {
    if (e.timeIn && e.timeOut) {
      return { ...e, hours: hoursBetween(e.timeIn, e.timeOut) };
    }
    return e;
  });
}

// Compute week1/week2/total/OT given a set of entries + the period.
// week1 = first 7 days of the period (starting Saturday per
// PAY_PERIOD_CONFIG.workweekStartsOnIsoDay), week2 = the next 7.
function summarize(entries: SubmitBody['entries'], period: PayPeriod) {
  const split = dayjs(period.startISO).add(7, 'day').format('YYYY-MM-DD');
  let w1 = 0, w2 = 0;
  for (const e of entries) {
    if (e.date < split) w1 += Number(e.hours) || 0;
    else                w2 += Number(e.hours) || 0;
  }
  const total = w1 + w2;
  const ot = Math.max(0, w1 - PAY_PERIOD_CONFIG.overtimeWeeklyHoursThreshold) +
             Math.max(0, w2 - PAY_PERIOD_CONFIG.overtimeWeeklyHoursThreshold);
  return { w1, w2, total, ot };
}

@Controller('timekeeping')
export class TimeKeepingController {
  private readonly log = new Logger(TimeKeepingController.name);

  constructor(
    private data: DataService,
    private prisma: PrismaService,
    private reports: TimekeepingReportsService,
    private people: OnboardingService,
  ) {}

  // ---- Eligibility -----------------------------------------------------
  //
  // Timesheets are gated by the Person.timesheetsEnabled flag (set in
  // the People screen). A signed-in user can only save/submit their
  // own timesheet if their UPN matches an eligible Person row; admins
  // can also seed timesheets on behalf of eligible people.

  // GET /v1/timekeeping/eligible-people — admin only. Returns
  // [{ personId, workerUpn, workerName, isBandMember }] for the
  // Approvals screen so the admin sees the full roster regardless
  // of whether each person has a sheet yet.
  @Get('eligible-people') @Roles('admin')
  async eligiblePeople() {
    return this.people.listTimesheetWorkers();
  }

  // GET /v1/timekeeping/me/eligible — any signed-in caller. Drives
  // the worker-side AddTimesheet gate (no toggle → friendly message
  // instead of a broken form).
  @Get('me/eligible') @Roles('member', 'staff', 'admin')
  async meEligible(@Req() req: any): Promise<{ eligible: boolean; upn: string }> {
    const upn = callerUpn(req);
    return { upn, eligible: await this.people.isWorkerEligible(upn) };
  }

  // POST /v1/timekeeping/timesheets/admin/start — admin creates a
  // fresh blank draft for a person. The UI navigates to admin-edit
  // mode on the returned id. Idempotent: if a sheet already exists
  // for (workerUpn, periodId), returns that one.
  @Post('timesheets/admin/start') @Roles('admin')
  async adminStartTimesheet(@Body() b: { personId: string; periodId: string }) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    if (!b?.personId || !b?.periodId) throw new Error('personId + periodId required');
    const workers = await this.people.listTimesheetWorkers();
    const worker = workers.find((w) => w.personId === b.personId);
    if (!worker) throw new ForbiddenException('Person not enabled for timesheets.');
    const period = payPeriodFor(b.periodId);
    if (period.id !== b.periodId) throw new Error(`Unknown period: ${b.periodId}`);
    const id = `${worker.workerUpn}:${period.id}`;
    const existing = await this.prisma.timesheet.findUnique({ where: { id }, include: { entries: true } });
    if (existing) return existing;
    return this.prisma.timesheet.create({
      data: {
        id,
        workerUpn: worker.workerUpn,
        workerName: worker.workerName,
        payPeriodId: period.id,
        status: 'draft',
      },
      include: { entries: true },
    });
  }

  // ---- Reports ---------------------------------------------------------
  //
  // Catalog of recent pay periods + each one's PDF report status.
  // Drives the Time Keeping > Approvals > Open Reports screen.
  @Get('reports') @Roles('admin')
  async listReports(@Query('count') count?: string) {
    const n = Math.max(1, Math.min(24, Number(count) || 12));
    return this.reports.list(n);
  }

  // Generate (or regenerate) a PDF for a period. Returns the persisted
  // report metadata + a freshly-issued URL.
  @Post('reports/:periodId/generate') @Roles('admin')
  async generateReport(@Param('periodId') periodId: string, @Req() req: any) {
    const upn = (req.headers['x-upn'] as string | undefined) || 'unknown';
    return this.reports.generate(periodId, upn);
  }

  // Stream the report PDF for a period through the api/ rather than
  // returning the storage-adapter URL. Reasons:
  //   - The in-memory storage fallback (no AZURE_STORAGE_DOCUMENTS_*
  //     env set) returns a `mem://` URL that browsers can't open.
  //   - Keeps the role guard usable; the client fetches via the same
  //     HTTP layer that already sends x-role.
  // `?download=1` flips Content-Disposition to attachment so the
  // browser saves the file instead of inlining it.
  @Get('reports/:periodId/pdf') @Roles('admin')
  async reportPdf(@Param('periodId') periodId: string, @Query('download') download: string | undefined, @Req() req: any, @Res() res: any) {
    const upn = (req.headers['x-upn'] as string | undefined) || 'unknown';
    const { bytes, fileName } = await this.reports.getPdfBytes(periodId, upn);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.send(bytes);
  }

  // Download a CSV export — same shape as the PDF data but flat.
  // Streams text/csv with a Content-Disposition attachment so the
  // browser auto-downloads.
  @Get('reports/:periodId/csv') @Roles('admin')
  async reportCsv(@Param('periodId') periodId: string, @Res() res: any) {
    const { filename, csv } = await this.reports.csv(periodId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // ---- Pay periods (computed) -------------------------------------------

  // GET /v1/timekeeping/pay-periods — current + recent. Drives the
  // history dropdown AND the Dashboard's cut-off countdown so the UI
  // and the engine don't disagree.
  @Get('pay-periods') @Roles('member', 'staff', 'admin')
  payPeriods(@Query('count') count?: string) {
    const n = Math.max(1, Math.min(24, Number(count) || 12));
    return {
      current: payPeriodFor(),
      recent: recentPayPeriods(n),
      config: {
        lengthDays: PAY_PERIOD_CONFIG.lengthDays,
        overtimeWeeklyHoursThreshold: PAY_PERIOD_CONFIG.overtimeWeeklyHoursThreshold,
        payDaysAfterCutoff: PAY_PERIOD_CONFIG.payDaysAfterCutoff,
      },
    };
  }

  @Get('pay-periods/:id') @Roles('member', 'staff', 'admin')
  payPeriod(@Param('id') id: string): PayPeriod {
    return payPeriodFor(id);
  }

  // ---- Worker view -------------------------------------------------------

  // GET /v1/timekeeping/timesheets?period=<YYYY-MM-DD>
  // My timesheets. Period optional — when present, returns just that one
  // (or null); when absent, returns the current period's draft + the
  // last 6 historical sheets.
  @Get('timesheets') @Roles('staff', 'admin')
  async myTimesheets(@Req() req: any, @Query('period') period?: string) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    const upn = callerUpn(req);
    const periodId = period ?? payPeriodFor().id;

    const current = await this.prisma.timesheet.findUnique({
      where:   { workerUpn_payPeriodId: { workerUpn: upn, payPeriodId: periodId } },
      include: { entries: true },
    });

    const history = await this.prisma.timesheet.findMany({
      where:   { workerUpn: upn, payPeriodId: { not: periodId } },
      orderBy: { payPeriodId: 'desc' },
      take:    6,
      include: { entries: true },
    });

    return {
      period: payPeriodFor(periodId),
      current,
      history,
    };
  }

  // PATCH /v1/timekeeping/timesheets/:periodId/draft
  // Save WITHOUT submitting. Idempotent — replaces entries. Status
  // stays 'draft' (or 'rejected' if the approver bounced it).
  @Patch('timesheets/:periodId/draft') @Roles('staff', 'admin')
  async saveDraft(@Param('periodId') periodId: string, @Body() b: SubmitBody, @Req() req: any) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    const upn = callerUpn(req);
    const period = payPeriodFor(periodId);
    if (period.id !== periodId) throw new Error(`Unknown period: ${periodId}`);

    // Worker-side eligibility gate — only callers whose UPN lines up
    // with an enabled Person row are allowed to write through this
    // path. Admin should use POST /timesheets/admin/start +
    // /timesheets/admin/:id to act on a worker's behalf.
    if (!(await this.people.isWorkerEligible(upn))) {
      throw new ForbiddenException('Your account is not enabled for timesheets. Ask an admin to add you under People with Timesheets enabled.');
    }

    const me = await this.prisma.bandMember.findUnique({ where: { upn } });
    const workerName = me?.name ?? upn;

    // Hours are recomputed from time-in/time-out whenever both are
    // present — the server is the authority. This runs before
    // summarize() so OT math reflects the canonical values.
    const entries = applyAutoHours(b.entries ?? []);
    const stats = summarize(entries, period);

    const sheet = await this.prisma.timesheet.upsert({
      where:  { workerUpn_payPeriodId: { workerUpn: upn, payPeriodId: period.id } },
      create: {
        id:         `${upn}:${period.id}`,
        workerUpn:  upn,
        workerName,
        payPeriodId: period.id,
        status:     'draft',
        notes:      b.notes ?? null,
        week1Hours: stats.w1, week2Hours: stats.w2,
        totalHours: stats.total, overtimeHours: stats.ot,
        requiresAdminApproval: stats.ot > 0,
        entries: {
          create: entries.map((e) => ({
            date: e.date, hours: e.hours, task: e.task,
            timeIn: e.timeIn ?? null, timeOut: e.timeOut ?? null,
          })),
        },
      },
      update: {
        notes:      b.notes ?? null,
        status:     { set: 'draft' },
        week1Hours: stats.w1, week2Hours: stats.w2,
        totalHours: stats.total, overtimeHours: stats.ot,
        requiresAdminApproval: stats.ot > 0,
        entries: {
          deleteMany: {},
          create: entries.map((e) => ({
            date: e.date, hours: e.hours, task: e.task,
            timeIn: e.timeIn ?? null, timeOut: e.timeOut ?? null,
          })),
        },
      },
      include: { entries: true },
    });

    return sheet;
  }

  // POST /v1/timekeeping/timesheets/:periodId
  // Submit. Computes OT + persists the snapshot. status → submitted.
  @Post('timesheets/:periodId') @Roles('staff', 'admin')
  async submit(@Param('periodId') periodId: string, @Body() b: SubmitBody, @Req() req: any) {
    // Reuse the draft path to materialize/refresh, then flip status.
    const sheet = await this.saveDraft(periodId, b, req);
    return this.prisma.timesheet.update({
      where: { id: sheet.id },
      data:  { status: 'submitted', submittedAt: new Date() },
      include: { entries: true },
    });
  }

  // ---- Approver view -----------------------------------------------------

  // GET /v1/timekeeping/timesheets/all?period=<id>&status=submitted
  // Pulls every worker's timesheet for a period — the approval queue.
  // Approver gate enforced in code below (admin OR band-manager
  // bandGroup; OT requires admin).
  @Get('timesheets/all') @Roles('staff', 'admin')
  async allTimesheets(
    @Req() req: any,
    @Query('period') period?: string,
    @Query('status') status?: string,
  ) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    await this.assertCanApprove(req);
    const periodId = period ?? payPeriodFor().id;
    return this.prisma.timesheet.findMany({
      where:  {
        payPeriodId: periodId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { workerName: 'asc' }],
      include: { entries: true },
    });
  }

  // POST /v1/timekeeping/timesheets/:id/approve
  @Post('timesheets/:id/approve') @Roles('staff', 'admin')
  async approve(@Param('id') id: string, @Req() req: any) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    const approverUpn = callerUpn(req);
    const sheet = await this.prisma.timesheet.findUnique({ where: { id } });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    if (sheet.status !== 'submitted') {
      throw new Error(`Can only approve submitted timesheets (current: ${sheet.status})`);
    }
    await this.assertCanApprove(req, { requiresAdmin: sheet.requiresAdminApproval });

    return this.prisma.timesheet.update({
      where: { id },
      data:  { status: 'approved', approvedBy: approverUpn, approvedAt: new Date() },
      include: { entries: true },
    });
  }

  // POST /v1/timekeeping/timesheets/:id/reject  body: { reason?: string }
  @Post('timesheets/:id/reject') @Roles('staff', 'admin')
  async reject(@Param('id') id: string, @Body() b: { reason?: string }, @Req() req: any) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    const approverUpn = callerUpn(req);
    const sheet = await this.prisma.timesheet.findUnique({ where: { id } });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    await this.assertCanApprove(req, { requiresAdmin: sheet.requiresAdminApproval });

    return this.prisma.timesheet.update({
      where: { id },
      data:  {
        status: 'rejected',
        rejectedReason: b?.reason ?? null,
        approvedBy:     approverUpn,
        approvedAt:     new Date(),
      },
      include: { entries: true },
    });
  }

  // GET /v1/timekeeping/timesheets/admin/:id — admin only.
  // Full row + entries for editing in AddTimesheet's admin mode.
  @Get('timesheets/admin/:id') @Roles('admin')
  async adminGetTimesheet(@Param('id') id: string) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    const row = await this.prisma.timesheet.findUnique({
      where: { id }, include: { entries: { orderBy: [{ date: 'asc' }] } },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  // PATCH /v1/timekeeping/timesheets/admin/:id — admin only.
  // Edit on behalf of a worker. Refuses if status === 'approved' so
  // the audit chain stays clean (admin has to delete + the worker has
  // to re-submit). Recomputes totals + OT the same way the worker's
  // own saveDraft path does.
  @Patch('timesheets/admin/:id') @Roles('admin')
  async adminEditTimesheet(@Param('id') id: string, @Body() body: any) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    const cur = await this.prisma.timesheet.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException();
    if (cur.status === 'approved') {
      throw new ForbiddenException('Approved timesheets cannot be edited. Delete and have the worker re-submit.');
    }
    const rawEntries = Array.isArray(body?.entries) ? body.entries : [];
    // Mirror saveDraft's normalisation + totals.
    const entries = rawEntries.map((e: any) => ({
      date: String(e.date), hours: Number(e.hours) || 0, task: String(e.task ?? 'Regular'),
      timeIn: e.timeIn || null, timeOut: e.timeOut || null,
    }));
    const split = dayjs(payPeriodFor(cur.payPeriodId).startISO).add(7, 'day').format('YYYY-MM-DD');
    let w1 = 0, w2 = 0;
    for (const e of entries) {
      if (e.date < split) w1 += e.hours; else w2 += e.hours;
    }
    const ot = Math.max(0, w1 - PAY_PERIOD_CONFIG.overtimeWeeklyHoursThreshold) +
               Math.max(0, w2 - PAY_PERIOD_CONFIG.overtimeWeeklyHoursThreshold);
    const total = Math.round((w1 + w2) * 100) / 100;
    return this.prisma.$transaction(async (tx) => {
      await tx.timesheetEntry.deleteMany({ where: { timesheetId: id } });
      await tx.timesheetEntry.createMany({
        data: entries.map((e: any) => ({ ...e, timesheetId: id })),
      });
      return tx.timesheet.update({
        where: { id },
        data: {
          notes: body?.notes ?? null,
          week1Hours: Math.round(w1 * 100) / 100,
          week2Hours: Math.round(w2 * 100) / 100,
          totalHours: total,
          overtimeHours: Math.round(ot * 100) / 100,
          requiresAdminApproval: ot > 0,
        },
        include: { entries: { orderBy: [{ date: 'asc' }] } },
      });
    });
  }

  // DELETE /v1/timekeeping/timesheets/:id — admin only.
  // Removes the timesheet + cascades its TimesheetEntry rows. The
  // client requires a Confirm dialog before calling (UI is the gate
  // for accidental clicks). Use case: a duplicated submission, a
  // worker who left mid-period, or correcting a mis-attributed sheet.
  @Delete('timesheets/:id') @Roles('admin') @HttpCode(204)
  async deleteTimesheet(@Param('id') id: string) {
    if (!this.prisma.isAvailable) throw new NotFoundException('Prisma not connected');
    const sheet = await this.prisma.timesheet.findUnique({ where: { id } });
    if (!sheet) throw new NotFoundException('Timesheet not found');
    await this.prisma.timesheet.delete({ where: { id } });
  }

  // ---- Approver check ---------------------------------------------------
  // Admin appRole → always.
  // Otherwise: staff appRole + bandGroups.includes('band-manager') →
  //   yes, UNLESS requiresAdmin (then admin only).
  private async assertCanApprove(req: any, opts?: { requiresAdmin?: boolean }) {
    const role = callerRole(req) as AppRole;
    if (role === 'admin') return;
    if (opts?.requiresAdmin) {
      throw new ForbiddenException('This timesheet has overtime hours and requires admin approval.');
    }
    if (role !== 'staff') {
      throw new ForbiddenException('Approval requires the staff appRole + Band Manager group, or admin.');
    }
    const upn = callerUpn(req);
    const me = await this.prisma.bandMember.findUnique({
      where: { upn }, select: { bandGroups: true },
    });
    const groups = me?.bandGroups ? me.bandGroups.split(',').filter(Boolean) : [];
    if (!groups.includes('band-manager')) {
      throw new ForbiddenException('Approval requires Band Manager group membership (or admin).');
    }
  }

  // ---- Legacy entries (kept until the old UI is rewritten) ---------------

  @Get('entries') @Roles('staff', 'admin') list() { return this.data.timeEntries; }
  @Post('entries') @Roles('staff', 'admin') create(@Req() req: any, @Body() b: any) {
    const t = { _id: this.data.id('t'), workerName: (req.headers['x-worker'] as string) || 'Me', approved: false, ...b };
    this.data.timeEntries.unshift(t);
    return t;
  }
  @Post('entries/:id/approve') @Roles('admin') approveLegacy(@Param('id') id: string) {
    const t = found(this.data.timeEntries.find((x) => x._id === id));
    t.approved = true;
    return t;
  }
}

// ---- Polls ----------------------------------------------------------------
@Controller('polls')
export class PollsController {
  constructor(private data: DataService) {}
  @Get() list(@Query('kind') kind?: string) { return kind ? this.data.polls.filter((p) => p.kind === kind) : this.data.polls; }
  @Get(':id') get(@Param('id') id: string) { return found(this.data.polls.find((p) => p._id === id)); }
  @Post() @Roles('admin') create(@Body() b: any) {
    const options = (b.options ?? []).map((label: string, i: number) => ({ id: `o${i}`, label, votes: 0 }));
    const p = { _id: this.data.id('p'), closed: false, ...b, options };
    this.data.polls.unshift(p);
    return p;
  }
  @Post(':id/vote') @Roles('member', 'staff', 'admin') vote(@Param('id') id: string, @Body() b: any) {
    const p = found(this.data.polls.find((x) => x._id === id));
    p.options = p.options.map((o: any) => (o.id === b.optionId ? { ...o, votes: o.votes + 1 } : o));
    return p;
  }
}

// ---- Notifications --------------------------------------------------------
@Controller('notifications')
export class NotificationsController {
  constructor(private data: DataService) {}
  @Get() list() { return this.data.notifications; }
  @Post() @Roles('admin') create(@Body() b: any) {
    const n = { _id: this.data.id('n'), createdAt: new Date().toISOString(), read: false, ...b };
    this.data.notifications.unshift(n);
    return n;
  }
  @Patch(':id') @Roles('admin') update(@Param('id') id: string, @Body() b: any) { return upsert(this.data.notifications, id, b); }
  @Delete(':id') @Roles('admin') @HttpCode(204) remove(@Param('id') id: string) { remove(this.data.notifications, id); }
}

// ---- Planner (Microsoft Graph) --------------------------------------------
// Per ADR-14 / docs/features/planner-dashboard.md. Backs the homescreen
// feed + my-tasks/team-tasks views + the Records-page admin rollup.
// All endpoints are role-gated; data is internal operations info.
@Controller('planner')
export class PlannerController {
  constructor(private graph: GraphFeedService) {}

  // Admin Records-page primary widget — cross-Nation rollup.
  @Get('rollup') @Roles('staff', 'admin')
  async rollup() { return this.graph.getRollup(); }

  // Records-page — plan picker dropdown.
  @Get('plans') @Roles('staff', 'admin')
  async plans() { return this.graph.getPlans(); }

  // Records-page — drill into a single plan.
  @Get('plans/:id/tasks') @Roles('staff', 'admin')
  async tasks(@Param('id') id: string) { return this.graph.getTasksForPlan(id); }

  // Homescreen — "My tasks" view (delegated path is Phase 2; today we
  // accept the UPN via header for testing). When app-side Entra sign-in
  // is wired, switch to reading the caller's identity from the JWT.
  @Get('my-tasks') @Roles('member', 'staff', 'admin')
  async myTasks(@Req() req: any) {
    const upn = req.headers['x-upn'];
    if (!upn) throw new NotFoundException('x-upn header required (will be replaced by JWT identity in Phase 2)');
    const plans = await this.graph.getPlans();
    const tasksByPlan = await Promise.all(plans.map((p) => this.graph.getTasksForPlan(p.id)));
    return tasksByPlan.flat().filter((t) => t.assigneeIds.includes(upn));
  }

  // Operational refresh — bust the cache.
  @Post('refresh') @Roles('admin') @HttpCode(204)
  refresh() { this.graph.refresh(); }
}

// ---- Unified feed (homescreen) --------------------------------------------
// One endpoint surfacing the merged app-events + Teams meetings + Planner
// due-dates + notifications stream. Role-filters server-side based on the
// caller's x-role.
@Controller('feed')
export class FeedController {
  constructor(private data: DataService, private graph: GraphFeedService) {}

  @Get()
  async getFeed(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<FeedItem[]> {
    const role = callerRole(req) as AppRole;
    const upn = req.headers['x-upn'];

    // Pull app-events + band-meetings + notifications from in-memory
    // data (matches the existing EventsController / MeetingsController /
    // NotificationsController pattern); these become Postgres reads in
    // Phase 2. Each maps to a normalized FeedItem.
    const extras: FeedItem[] = [
      // App events (community salmon BBQ, powwow, etc.) — public by default
      ...this.data.events.map((e: any): FeedItem => ({
        id: `ae-${e._id}`,
        source: 'app-event',
        title: e.title ?? e.name ?? '(event)',
        startAt: e.startAt ?? e.startsAt ?? e.date,
        category: e.category,
        audience: ['public', 'member', 'staff', 'admin'],
      })),
      // Band meetings (council meetings, membership meetings) — member+
      ...this.data.meetings.map((m: any): FeedItem => ({
        id: `bm-${m._id}`,
        source: 'app-event',
        title: m.title ?? m.name ?? '(meeting)',
        startAt: m.startAt ?? m.startsAt ?? m.date,
        category: 'Council',
        audience: ['member', 'staff', 'admin'],
      })),
      // Notifications (water boil advisory, council announcements, etc.)
      ...this.data.notifications.map((n: any): FeedItem => ({
        id: `nt-${n._id}`,
        source: 'notification',
        title: n.title ?? n.body?.slice(0, 80) ?? '(notification)',
        startAt: n.publishedAt ?? n.createdAt,
        category: n.category,
        audience: n.audience ?? ['public', 'member', 'staff', 'admin'],
      })),
    ];

    return this.graph.getFeed({
      role,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      extras,
      forUserUpn: upn,
    });
  }
}

// ---- helpers --------------------------------------------------------------
function found<T>(v: T | undefined): T {
  if (!v) throw new NotFoundException('Not found');
  return v;
}
function upsert(coll: any[], id: string, patch: any) {
  const i = coll.findIndex((x) => x._id === id);
  if (i < 0) throw new NotFoundException('Not found');
  coll[i] = { ...coll[i], ...patch, _id: id };
  return coll[i];
}
function remove(coll: any[], id: string) {
  const i = coll.findIndex((x) => x._id === id);
  if (i >= 0) coll.splice(i, 1);
}

// ---- Shared Mailboxes (Exchange Online) ----------------------------------
// Backed by the skintyee-exo-fn Azure Function (PowerShell EXO).
// All endpoints admin-only. The Directory's Shared tab navigates here
// when a shared-inbox row is tapped.
@Controller('admin/shared-mailboxes')
export class SharedMailboxesController {
  private readonly log = new Logger(SharedMailboxesController.name);
  private cache: { ts: number; data: any[] } = { ts: 0, data: [] };
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private exo: ExoService,
    private reconcile: MailboxReconcileService,
  ) {}

  // GET /v1/admin/shared-mailboxes — list all shared mailboxes (5 min cache).
  @Get() @Roles('admin') async list() {
    if (!this.exo.isAvailable) {
      throw new NotFoundException('EXO function not configured');
    }
    const now = Date.now();
    if (now - this.cache.ts < this.CACHE_TTL_MS && this.cache.data.length) {
      return this.cache.data;
    }
    const list = await this.exo.listSharedMailboxes();
    this.cache = { ts: now, data: list };
    return list;
  }

  // GET /v1/admin/shared-mailboxes/:upn/access — who has FullAccess+SendAs
  // on this mailbox. Real-time (uncached) — the source of truth is EXO.
  @Get(':upn/access') @Roles('admin') async access(@Param('upn') upn: string) {
    if (!this.exo.isAvailable) {
      throw new NotFoundException('EXO function not configured');
    }
    return this.exo.getMailboxAccess(upn);
  }

  // PATCH /v1/admin/shared-mailboxes/:upn/access — set the list of users
  // who have FullAccess + SendAs. Body: { users: string[] } — UPNs.
  // Diffs vs current EXO truth, grants/revokes per change.
  @Patch(':upn/access') @Roles('admin') async setAccess(
    @Param('upn') upn: string,
    @Body() b: { users?: string[] }
  ) {
    if (!this.exo.isAvailable) {
      throw new NotFoundException('EXO function not configured');
    }
    const desired = new Set((b?.users ?? []).map((u) => u.toLowerCase()));

    // Real-time read of current — we always trust EXO over any local cache.
    const current = await this.exo.getMailboxAccess(upn);
    const currentSet = new Set(current.full.map((u) => u.user.toLowerCase()));

    const toAdd    = [...desired].filter((u) => !currentSet.has(u));
    const toRemove = [...currentSet].filter((u) => !desired.has(u));

    this.log.log(`PATCH /shared-mailboxes/${upn}/access: +${toAdd.join(',') || '∅'} -${toRemove.join(',') || '∅'}`);

    for (const user of toAdd)    await this.exo.grantAccess(upn, user);
    for (const user of toRemove) await this.exo.revokeAccess(upn, user);

    // Write-through to DB: each affected user's mailboxMemberships needs
    // its |fullaccess set to match EXO. The reconcile step queries EXO
    // again, so we get the fresh truth.
    try {
      await this.reconcile.reconcileAll();
    } catch (e: any) {
      this.log.warn(`write-through reconcile failed (EXO succeeded, DB stale): ${e?.message ?? e}`);
    }

    // Return the fresh state
    return this.exo.getMailboxAccess(upn);
  }

  // POST /v1/admin/shared-mailboxes/reconcile — admin-trigger to refresh
  // every user's mailboxMemberships from the real EXO truth. Same as
  // /v1/admin/reconcile-mailboxes; here for proximity to the Shared tab.
  @Post('reconcile') @Roles('admin') async reconcileAll() {
    return this.reconcile.reconcileAll();
  }
}

export const CONTROLLERS = [
  HealthController,
  AuthController,
  DirectoryController,
  EventsController,
  MeetingsController,
  TransparencyController,
  FinancialsController,
  TimeKeepingController,
  PollsController,
  NotificationsController,
  PlannerController,
  FeedController,
  AdminController,
  SharedMailboxesController,
];
