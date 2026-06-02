import { Body, Controller, Delete, Get, HttpCode, Logger, NotFoundException, OnApplicationBootstrap, Param, Post, Patch, Query, Req } from '@nestjs/common';
import { DataService } from './data.service';
import { Roles, callerRole } from './roles';
import { GraphFeedService, FeedItem, AppRole } from './graph-feed.service';
import { PrismaService } from './prisma.service';

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
@Controller('directory')
export class DirectoryController {
  constructor(private data: DataService, private prisma: PrismaService) {}

  @Get() async list() {
    if (this.prisma.isAvailable) {
      const rows = await this.prisma.bandMember.findMany({
        where: { enabled: true },
        orderBy: { name: 'asc' },
      });
      // Map Prisma fields → the legacy BandMember shape the app expects.
      return rows.map((r) => ({
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
      }));
    }
    return this.data.directory;
  }

  @Get(':id') async get(@Param('id') id: string) {
    if (this.prisma.isAvailable) {
      const row = await this.prisma.bandMember.findUnique({ where: { id } });
      return found(row);
    }
    return found(this.data.directory.find((m) => m._id === id));
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

  constructor(private graph: GraphFeedService, private prisma: PrismaService) {}

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

    const entraUsers = await this.graph.getDirectory();
    let inserted = 0;
    let updated = 0;

    for (const u of entraUsers) {
      const existing = await this.prisma.bandMember.findUnique({ where: { id: u.id } });
      await this.prisma.bandMember.upsert({
        where: { id: u.id },
        create: {
          id: u.id,
          upn: u.upn,
          email: u.email,
          name: u.name,
          role: u.role,
          title: u.title,
          department: u.department,
          phone: u.phone,
          avatarLetter: u.avatarLetter,
          appRole: u.appRole,
          enabled: u.enabled,
        },
        update: {
          upn: u.upn,
          email: u.email,
          name: u.name,
          role: u.role,
          title: u.title,
          department: u.department,
          phone: u.phone,
          avatarLetter: u.avatarLetter,
          appRole: u.appRole,
          enabled: u.enabled,
          syncedAt: new Date(),
        },
      });
      if (existing) updated++; else inserted++;
    }

    // Mark anyone NOT in this Entra response as disabled (departed)
    const allIds = entraUsers.map((u) => u.id);
    const { count: disabledCount } = await this.prisma.bandMember.updateMany({
      where: { id: { notIn: allIds }, enabled: true },
      data: { enabled: false },
    });

    return {
      ok: true,
      total: entraUsers.length,
      inserted,
      updated,
      disabled: disabledCount,
      syncedAt: new Date().toISOString(),
    };
  }

  // GET /v1/admin/role-for/:upn — look up an app-role by UPN. Used during
  // sign-in to derive the signed-in user's app role from their Entra UPN.
  // Returns 'public' if not found (anonymous users get the public role).
  @Get('role-for/:upn')
  async roleFor(@Param('upn') upn: string) {
    if (!this.prisma.isAvailable) {
      return { upn, appRole: 'public', source: 'no-db-fallback' };
    }
    const row = await this.prisma.bandMember.findUnique({
      where: { upn: upn.toLowerCase() },
      select: { upn: true, appRole: true, name: true, enabled: true },
    });
    if (!row || !row.enabled) {
      return { upn, appRole: 'public', source: 'not-found' };
    }
    return { upn: row.upn, appRole: row.appRole, name: row.name, source: 'db' };
  }
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
@Controller('meetings')
export class MeetingsController {
  constructor(private data: DataService) {}
  @Get() @Roles('member', 'staff', 'admin') list() { return this.data.meetings; }
  @Post() @Roles('admin') create(@Body() b: any) { const m = { _id: this.data.id('bm'), ...b }; this.data.meetings.unshift(m); return m; }
  @Patch(':id') @Roles('admin') update(@Param('id') id: string, @Body() b: any) { return upsert(this.data.meetings, id, b); }
  @Delete(':id') @Roles('admin') @HttpCode(204) remove(@Param('id') id: string) { remove(this.data.meetings, id); }
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
@Controller('timekeeping')
export class TimeKeepingController {
  constructor(private data: DataService) {}
  // Staff/admin. Production filters to the authenticated worker for non-admins.
  @Get('entries') @Roles('staff', 'admin') list() { return this.data.timeEntries; }
  @Post('entries') @Roles('staff', 'admin') create(@Req() req: any, @Body() b: any) {
    const t = { _id: this.data.id('t'), workerName: (req.headers['x-worker'] as string) || 'Me', approved: false, ...b };
    this.data.timeEntries.unshift(t);
    return t;
  }
  @Post('entries/:id/approve') @Roles('admin') approve(@Param('id') id: string) {
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
];
