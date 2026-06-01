import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Patch, Query, Req } from '@nestjs/common';
import { DataService } from './data.service';
import { Roles, callerRole } from './roles';
import { GraphFeedService, FeedItem, AppRole } from './graph-feed.service';

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
@Controller('directory')
export class DirectoryController {
  constructor(private data: DataService) {}
  @Get() list() { return this.data.directory; }
  @Get(':id') get(@Param('id') id: string) { return found(this.data.directory.find((m) => m._id === id)); }
  @Post() @Roles('admin') create(@Body() b: any) { const m = { _id: this.data.id('m'), ...b }; this.data.directory.unshift(m); return m; }
  @Patch(':id') @Roles('admin') update(@Param('id') id: string, @Body() b: any) { return upsert(this.data.directory, id, b); }
  @Delete(':id') @Roles('admin') @HttpCode(204) remove(@Param('id') id: string) { remove(this.data.directory, id); }
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

    // Pull app-events + notifications from in-memory data (matches the
    // current EventsController + NotificationsController pattern); these
    // become Postgres reads in Phase 2.
    const extras: FeedItem[] = [
      ...this.data.events.map((e: any): FeedItem => ({
        id: `ae-${e._id}`,
        source: 'app-event',
        title: e.title ?? e.name ?? '(event)',
        startAt: e.startAt ?? e.startsAt ?? e.date,
        category: e.category,
        audience: ['public', 'member', 'staff', 'admin'],  // app-events are public by default
      })),
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
];
