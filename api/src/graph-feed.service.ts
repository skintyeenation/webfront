/**
 * GraphFeedService
 * ----------------
 * Reads Microsoft Graph data (Planner + Calendar/Teams meetings + user
 * lookups) on behalf of the community app, normalizes it into the
 * unified `FeedItem` shape, and serves cached results.
 *
 * Per ADR-14 + docs/features/planner-dashboard.md. Authenticated as
 * the `skintyee-app-graph` Entra application (app-only flow); creds
 * come from env vars wired by scripts/setup-app-graph.sh as
 * Container App secrets:
 *
 *   GRAPH_CLIENT_ID
 *   GRAPH_CLIENT_SECRET
 *   GRAPH_TENANT_ID
 *
 * Cache: 5-10 min in-memory TTL. Polling-based (no Graph webhooks yet
 * — see ADR-14 Phase 2 trigger).
 *
 * Deliberately uses plain `fetch` instead of @azure/identity +
 * @microsoft/microsoft-graph-client to keep the dependency surface
 * small and the code auditable (same philosophy as the M365 backup
 * script's plain-PowerShell approach).
 */

import { Injectable, Logger } from '@nestjs/common';
import { SKINTYEE_SECURITY_GROUPS } from './skintyee-groups';
import {
  SKINTYEE_MEETING_TYPES,
  MEETING_SOURCE_CALENDARS,
  meetingTypeByCategory,
  meetingTypeBySlug,
  MeetingSource,
} from './skintyee-meeting-types';

export interface BandMeetingFromGraph {
  id: string;          // Graph event id
  title: string;
  agenda: string;      // body.content (plain text preview)
  location: string;
  startsAt: string;    // ISO
  endsAt?: string;
  cancelled?: boolean;
  typeSlug: string;     // matched from categories[]; 'band-meeting' / 'council-meeting' / …
  source: string;       // human-readable source calendar (e.g. "Skin Tyee Council (M365)")
  sourceIndex: number;  // index into MEETING_SOURCE_CALENDARS for PATCH routing
  organizerName?: string;
  organizerUpn?: string;
  attendees?: Array<{ upn: string; name?: string; type?: string }>;
  isOnlineMeeting?: boolean;
  joinUrl?: string;     // Teams join URL if isOnlineMeeting
  webLink?: string;     // Outlook web link
}

// ---- Types ---------------------------------------------------------------

export type FeedSource = 'app-event' | 'teams-meeting' | 'planner-task' | 'notification';
export type AppRole = 'public' | 'member' | 'staff' | 'admin';

export interface FeedItem {
  id: string;
  source: FeedSource;
  title: string;
  startAt?: string;            // ISO 8601 — events + meetings have this
  dueAt?: string;              // ISO 8601 — Planner tasks have this
  detailUrl?: string;          // Deep link back to source (Teams join, Planner web)
  category?: string;           // Matches WordPress taxonomy / Planner category
  audience: AppRole[];         // Roles allowed to see this item
  meta?: Record<string, any>;  // Source-specific extras (assignees, organizer, etc.)
}

export interface PlannerPlanSummary {
  id: string;
  title: string;
  groupId: string;
  groupName?: string;
  taskCount: number;
  openCount: number;
  completedCount: number;
}

export interface PlannerTask {
  id: string;
  planId: string;
  bucketId?: string;
  bucketName?: string;
  title: string;
  percentComplete: number;     // 0 / 50 / 100
  status: 'NotStarted' | 'InProgress' | 'Completed';
  priority: number;            // 1=urgent .. 10=low
  dueDateTime?: string;
  createdDateTime?: string;
  assigneeIds: string[];
  assigneeNames?: string[];
  categoryLabels?: string[];   // resolved from plan details
}

export interface PlannerRollup {
  totalOpen: number;
  totalCompleted: number;
  totalOverdue: number;
  byProgramArea: Array<{
    programArea: string;
    open: number;
    completed: number;
  }>;
  topOverdue: PlannerTask[];   // top 5 most-overdue
  generatedAt: string;
  cacheAgeMs: number;
}

// ---- Service -------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

@Injectable()
export class GraphFeedService {
  private readonly log = new Logger(GraphFeedService.name);
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes

  // Token cache
  private token?: string;
  private tokenExpiresAt = 0;

  // Per-resource caches
  private plansCache?: CacheEntry<PlannerPlanSummary[]>;
  private tasksCache?: CacheEntry<Map<string, PlannerTask[]>>;     // planId → tasks
  private bucketsCache?: CacheEntry<Map<string, Map<string, string>>>; // planId → (bucketId → name)
  private categoriesCache?: CacheEntry<Map<string, Map<number, string>>>; // planId → (1-25 → label)
  private userCache = new Map<string, string>();                  // userId → display name (long-lived)
  private feedCache?: CacheEntry<FeedItem[]>;

  // ---- Auth --------------------------------------------------------------

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 60_000) {
      return this.token;
    }

    const tenantId = process.env.GRAPH_TENANT_ID;
    const clientId = process.env.GRAPH_CLIENT_ID;
    const clientSecret = process.env.GRAPH_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error(
        'GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET not set. ' +
        'Run scripts/setup-app-graph.sh and re-deploy api-prod.'
      );
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const resp = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (!resp.ok) {
      throw new Error(`Graph token acquisition failed: ${resp.status} ${await resp.text()}`);
    }
    const data: any = await resp.json();
    this.token = data.access_token;
    this.tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000;
    return this.token!;
  }

  private async graph<T>(path: string): Promise<T> {
    const tok = await this.getToken();
    const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (resp.status === 429) {
      // Throttled — respect Retry-After
      const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '60', 10);
      this.log.warn(`Graph throttled; waiting ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.graph<T>(path);
    }
    if (!resp.ok) {
      throw new Error(`Graph ${path} → ${resp.status}: ${await resp.text()}`);
    }
    return resp.json() as Promise<T>;
  }

  private async graphPaged<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = path;
    while (next) {
      const page: any = await this.graph(next);
      out.push(...(page.value ?? []));
      next = page['@odata.nextLink'];
    }
    return out;
  }

  // Delegated variant: same paging behavior but uses the caller's Bearer
  // token rather than our app-only token. Required for M365 group
  // calendar reads where Exchange enforces user-scoped access checks.
  private async graphPagedDelegated<T>(path: string, accessToken: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
    while (next) {
      const res = await fetch(next, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (!res.ok) {
        throw new Error(`Graph (delegated) ${next} → ${res.status}: ${await res.text()}`);
      }
      const page: any = await res.json();
      out.push(...(page.value ?? []));
      next = page['@odata.nextLink'];
    }
    return out;
  }

  private fresh<T>(entry: CacheEntry<T> | undefined): T | null {
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > this.ttlMs) return null;
    return entry.data;
  }

  // ---- Planner -----------------------------------------------------------

  async getPlans(): Promise<PlannerPlanSummary[]> {
    const fresh = this.fresh(this.plansCache);
    if (fresh) return fresh;

    // 1. Enumerate M365 Groups (Planner plans live inside Groups)
    const groups = await this.graphPaged<any>(
      `/groups?$filter=groupTypes/Any(g:g eq 'Unified')&$select=id,displayName`
    );

    // 2. Get plans per group, in parallel
    const planPerGroup = await Promise.all(
      groups.map(async (g) => {
        try {
          const plans = await this.graphPaged<any>(`/groups/${g.id}/planner/plans`);
          return plans.map((p) => ({ ...p, _groupName: g.displayName }));
        } catch (e) {
          this.log.warn(`Couldn't fetch plans for group ${g.id}: ${e}`);
          return [];
        }
      })
    );
    const allPlans = planPerGroup.flat();

    // 3. Get task counts per plan
    const summaries: PlannerPlanSummary[] = await Promise.all(
      allPlans.map(async (p) => {
        const tasks = await this.getTasksForPlan(p.id);
        return {
          id: p.id,
          title: p.title,
          groupId: p.owner,
          groupName: p._groupName,
          taskCount: tasks.length,
          openCount: tasks.filter((t) => t.status !== 'Completed').length,
          completedCount: tasks.filter((t) => t.status === 'Completed').length,
        };
      })
    );

    this.plansCache = { data: summaries, fetchedAt: Date.now() };
    return summaries;
  }

  async getTasksForPlan(planId: string): Promise<PlannerTask[]> {
    const cached = this.fresh(this.tasksCache);
    if (cached?.has(planId)) return cached.get(planId)!;

    const raw = await this.graphPaged<any>(`/planner/plans/${planId}/tasks`);
    const buckets = await this.getBucketsForPlan(planId);
    const cats = await this.getCategoriesForPlan(planId);

    const tasks: PlannerTask[] = raw.map((t) => ({
      id: t.id,
      planId: t.planId,
      bucketId: t.bucketId,
      bucketName: buckets.get(t.bucketId),
      title: t.title,
      percentComplete: t.percentComplete,
      status:
        t.percentComplete === 100
          ? 'Completed'
          : t.percentComplete > 0
          ? 'InProgress'
          : 'NotStarted',
      priority: t.priority,
      dueDateTime: t.dueDateTime,
      createdDateTime: t.createdDateTime,
      assigneeIds: Object.keys(t.assignments ?? {}),
      categoryLabels: Object.entries(t.appliedCategories ?? {})
        .filter(([, applied]) => applied === true)
        .map(([key]) => cats.get(parseInt(key.replace('category', ''), 10)))
        .filter((v): v is string => !!v),
    }));

    // Update cache map
    const cacheMap = cached ?? new Map<string, PlannerTask[]>();
    cacheMap.set(planId, tasks);
    this.tasksCache = { data: cacheMap, fetchedAt: Date.now() };
    return tasks;
  }

  private async getBucketsForPlan(planId: string): Promise<Map<string, string>> {
    const cached = this.fresh(this.bucketsCache);
    if (cached?.has(planId)) return cached.get(planId)!;
    const raw = await this.graphPaged<any>(`/planner/plans/${planId}/buckets`);
    const map = new Map<string, string>(raw.map((b) => [b.id, b.name]));
    const cacheMap = cached ?? new Map();
    cacheMap.set(planId, map);
    this.bucketsCache = { data: cacheMap, fetchedAt: Date.now() };
    return map;
  }

  private async getCategoriesForPlan(planId: string): Promise<Map<number, string>> {
    const cached = this.fresh(this.categoriesCache);
    if (cached?.has(planId)) return cached.get(planId)!;
    const details: any = await this.graph(`/planner/plans/${planId}/details`);
    const map = new Map<number, string>();
    for (let i = 1; i <= 25; i++) {
      const label = details.categoryDescriptions?.[`category${i}`];
      if (label) map.set(i, label);
    }
    const cacheMap = cached ?? new Map();
    cacheMap.set(planId, map);
    this.categoriesCache = { data: cacheMap, fetchedAt: Date.now() };
    return map;
  }

  // ---- Rollup (admin view) ----------------------------------------------

  async getRollup(): Promise<PlannerRollup> {
    const start = Date.now();
    const plans = await this.getPlans();
    const allTasks: PlannerTask[] = [];
    for (const p of plans) {
      allTasks.push(...(await this.getTasksForPlan(p.id)));
    }

    const now = Date.now();
    const overdue = allTasks.filter(
      (t) =>
        t.status !== 'Completed' &&
        t.dueDateTime &&
        new Date(t.dueDateTime).getTime() < now
    );

    // Group by program area — the first category label on each task,
    // falling back to the parent plan's title if no category set
    const byArea = new Map<string, { open: number; completed: number }>();
    for (const t of allTasks) {
      const area = t.categoryLabels?.[0] ?? plans.find((p) => p.id === t.planId)?.title ?? 'Unknown';
      const cur = byArea.get(area) ?? { open: 0, completed: 0 };
      if (t.status === 'Completed') cur.completed++;
      else cur.open++;
      byArea.set(area, cur);
    }

    return {
      totalOpen: allTasks.filter((t) => t.status !== 'Completed').length,
      totalCompleted: allTasks.filter((t) => t.status === 'Completed').length,
      totalOverdue: overdue.length,
      byProgramArea: Array.from(byArea.entries())
        .map(([programArea, counts]) => ({ programArea, ...counts }))
        .sort((a, b) => b.open - a.open),
      topOverdue: overdue
        .sort((a, b) => (a.dueDateTime ?? '').localeCompare(b.dueDateTime ?? ''))
        .slice(0, 5),
      generatedAt: new Date().toISOString(),
      cacheAgeMs: Date.now() - start,
    };
  }

  // ---- Teams meetings (calendar events) ---------------------------------

  async getUpcomingMeetingsForUser(userIdOrUpn: string, days = 14): Promise<FeedItem[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const path =
      `/users/${encodeURIComponent(userIdOrUpn)}/calendar/calendarView` +
      `?startDateTime=${now.toISOString()}&endDateTime=${horizon.toISOString()}` +
      `&$filter=isOnlineMeeting eq true&$top=50`;

    try {
      const events = await this.graphPaged<any>(path);
      return events.map((e): FeedItem => ({
        id: `tm-${e.id}`,
        source: 'teams-meeting',
        title: e.subject ?? '(no subject)',
        startAt: e.start?.dateTime,
        detailUrl: e.onlineMeeting?.joinUrl,
        audience: ['member', 'staff', 'admin'],
        meta: {
          organizer: e.organizer?.emailAddress?.name,
          end: e.end?.dateTime,
          attendeeCount: Array.isArray(e.attendees) ? e.attendees.length : 0,
        },
      }));
    } catch (e) {
      this.log.warn(`Couldn't fetch meetings for ${userIdOrUpn}: ${e}`);
      return [];
    }
  }

  // ---- Unified feed -----------------------------------------------------

  /**
   * The /v1/feed endpoint: unified app-events + Teams meetings + Planner
   * due-dates + notifications, sorted by time, role-filtered for the caller.
   *
   * Notifications + app-events come from the app's own state (the
   * existing `EventsController` + `NotificationsController` in
   * controllers.ts); this service merges in the Graph data.
   *
   * NOTE: currently fetches Graph data only — the caller is expected to
   * merge in app-events + notifications from DataService and pass them
   * via `extras`. Phase 2: pull all in one place.
   */
  async getFeed(opts: {
    role: AppRole;
    from?: Date;
    to?: Date;
    extras?: FeedItem[];        // app-events + notifications from the controllers layer
    forUserUpn?: string;        // for "my tasks" / "my meetings" personalization
  }): Promise<FeedItem[]> {
    // For aggregate (non-personalized) feeds, use cache; for per-user, skip
    if (!opts.forUserUpn) {
      const fresh = this.fresh(this.feedCache);
      if (fresh) {
        return this.filterFeed(fresh.concat(opts.extras ?? []), opts);
      }
    }

    // Build the Planner half of the feed
    const plans = await this.getPlans();
    const tasksByPlan = await Promise.all(plans.map((p) => this.getTasksForPlan(p.id)));
    const plannerItems: FeedItem[] = tasksByPlan.flat()
      .filter((t) => t.dueDateTime && t.status !== 'Completed')
      .map((t): FeedItem => ({
        id: `pt-${t.id}`,
        source: 'planner-task',
        title: t.title,
        dueAt: t.dueDateTime,
        category: t.categoryLabels?.[0],
        audience: this.audienceForTask(t),
        meta: {
          status: t.status,
          priority: t.priority,
          assigneeIds: t.assigneeIds,
          bucket: t.bucketName,
        },
      }));

    // Build the Teams half — only if forUserUpn was given (per-user calendar)
    let meetingItems: FeedItem[] = [];
    if (opts.forUserUpn) {
      meetingItems = await this.getUpcomingMeetingsForUser(opts.forUserUpn);
    }

    const combined = [...plannerItems, ...meetingItems, ...(opts.extras ?? [])];

    // Cache the aggregate (no forUserUpn)
    if (!opts.forUserUpn) {
      this.feedCache = { data: combined, fetchedAt: Date.now() };
    }

    return this.filterFeed(combined, opts);
  }

  private filterFeed(items: FeedItem[], opts: { role: AppRole; from?: Date; to?: Date }): FeedItem[] {
    return items
      .filter((it) => it.audience.includes(opts.role))
      .filter((it) => {
        if (!opts.from && !opts.to) return true;
        const t = it.startAt ?? it.dueAt;
        if (!t) return false;
        const ts = new Date(t).getTime();
        if (opts.from && ts < opts.from.getTime()) return false;
        if (opts.to && ts > opts.to.getTime()) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = new Date(a.startAt ?? a.dueAt ?? 0).getTime();
        const tb = new Date(b.startAt ?? b.dueAt ?? 0).getTime();
        return ta - tb;
      });
  }

  private audienceForTask(task: PlannerTask): AppRole[] {
    // A task is "public-suitable" only if explicitly categorized "Public"
    // (or similar). Default is staff + admin only.
    const cats = task.categoryLabels?.map((c) => c.toLowerCase()) ?? [];
    if (cats.includes('public')) return ['public', 'member', 'staff', 'admin'];
    if (cats.includes('member')) return ['member', 'staff', 'admin'];
    return ['staff', 'admin'];
  }

  // ---- Manual cache management ------------------------------------------

  refresh() {
    this.plansCache = undefined;
    this.tasksCache = undefined;
    this.bucketsCache = undefined;
    this.categoriesCache = undefined;
    this.feedCache = undefined;
    this.log.log('caches cleared');
  }

  // ---- Directory --------------------------------------------------------
  //
  // Pull all enabled users from the skintyeenation Entra tenant. Used by
  // the seed endpoint to populate the BandMember table; can also be called
  // directly when a fresh sync is needed (e.g. someone was added in M365
  // and we want them visible in the app immediately).
  //
  // The break-glass admin (admin@skintyeenation.onmicrosoft.com) is the
  // tenant's System Admin role account, not a person. We trust whatever
  // Entra has for its displayName + jobTitle.
  async getDirectory(): Promise<Array<{
    id: string; upn: string; email?: string; name: string; role: string;
    title?: string; department?: string; phone?: string; avatarLetter?: string;
    appRole: string; accountType: 'licensed-user' | 'shared-inbox';
    mailboxMemberships: string[];
    bandGroups: string[];
    managerId?: string; managerName?: string; managerUpn?: string;
    hasPhoto: boolean;
    enabled: boolean;
  }>> {
    // assignedLicenses is what distinguishes a "real" licensed user (gets
    // a Business Standard SKU assigned) from a shared mailbox (no license).
    // We $select it to avoid pulling everything.
    const users = await this.graphPaged<any>(
      '/users?$select=id,userPrincipalName,displayName,givenName,surname,mail,jobTitle,businessPhones,mobilePhone,department,accountEnabled,assignedLicenses&$filter=accountEnabled eq true&$top=999'
    );

    // ---- Per-user enrichment: manager + photo flag --------------------
    // For each licensed user (skip shared inboxes — they don't have managers
    // or photos), fetch:
    //   /users/{id}/manager      → {id, displayName, userPrincipalName} or 404
    //   /users/{id}/photo        → photo metadata (200 = has photo, 404 = none)
    // Both in parallel per user; failures are non-fatal.
    const managerByUser = new Map<string, { id: string; name: string; upn: string }>();
    const hasPhotoByUser = new Map<string, boolean>();
    await Promise.all(
      users
        .filter((u) => Array.isArray(u.assignedLicenses) && u.assignedLicenses.length > 0)
        .map(async (u) => {
          await Promise.all([
            (async () => {
              try {
                const mgr: any = await this.graph(`/users/${u.id}/manager?$select=id,displayName,userPrincipalName`);
                if (mgr?.id) {
                  managerByUser.set(u.id, {
                    id: mgr.id,
                    name: mgr.displayName ?? mgr.userPrincipalName,
                    upn: (mgr.userPrincipalName ?? '').toLowerCase(),
                  });
                }
              } catch (_e) {
                // 404 = no manager set; common. Don't log every miss.
              }
            })(),
            (async () => {
              try {
                await this.graph(`/users/${u.id}/photo`);
                hasPhotoByUser.set(u.id, true);
              } catch (_e) {
                hasPhotoByUser.set(u.id, false);
              }
            })(),
          ]);
        })
    );

    // Build per-user M365 Group relationships (NOT shared mailboxes —
    // those live in Exchange Online and aren't readable from Graph v1.0).
    //
    // For each mail-enabled group: query owners + members in parallel,
    // aggregate per user.
    //
    // The Directory UI distinguishes groups from shared mailboxes at
    // render time by checking each entry against the set of known
    // shared-mailbox UPNs (accountType='shared-inbox'). The data
    // structure here is the same; presentation differs.
    const ownsByUser    = new Map<string, Set<string>>();
    const memberByUser  = new Map<string, Set<string>>();
    try {
      const allGroups = await this.graphPaged<any>(
        '/groups?$select=id,displayName,mail,mailEnabled,groupTypes&$top=999'
      );
      const mailGroups = allGroups.filter((g) => g.mailEnabled && typeof g.mail === 'string');
      await Promise.all(mailGroups.map(async (g) => {
        const mail = (g.mail as string).toLowerCase();
        try {
          const [owners, members] = await Promise.all([
            this.graphPaged<any>(`/groups/${g.id}/owners?$select=id`),
            this.graphPaged<any>(`/groups/${g.id}/members?$select=id`),
          ]);
          for (const o of owners) {
            if (!ownsByUser.has(o.id)) ownsByUser.set(o.id, new Set());
            ownsByUser.get(o.id)!.add(mail);
          }
          for (const m of members) {
            if (!memberByUser.has(m.id)) memberByUser.set(m.id, new Set());
            memberByUser.get(m.id)!.add(mail);
          }
        } catch (e) {
          this.log.warn(`couldn't fetch owners/members of ${g.displayName}: ${e}`);
        }
      }));
    } catch (e) {
      this.log.warn(`couldn't enumerate groups: ${e}`);
    }

    // ---- Skin Tyee security-group memberships ------------------------
    // The 13 catalog security groups (src/skintyee-groups.ts) are the
    // app's role model. Walk each one's /members in parallel and build
    // a per-user slug list.
    const bandGroupsByUser = new Map<string, Set<string>>();
    await Promise.all(SKINTYEE_SECURITY_GROUPS.map(async (g) => {
      try {
        const members = await this.graphPaged<any>(`/groups/${g.id}/members?$select=id`);
        for (const m of members) {
          if (!bandGroupsByUser.has(m.id)) bandGroupsByUser.set(m.id, new Set());
          bandGroupsByUser.get(m.id)!.add(g.slug);
        }
      } catch (e) {
        this.log.warn(`couldn't fetch members of ${g.displayName}: ${e}`);
      }
    }));

    return users
      .filter((u) => {
        const upn = (u.userPrincipalName ?? '').toLowerCase();
        // Band-member candidates: anyone @skintyee.ca + the break-glass admin.
        // Skip B2B guests (#EXT#) and pure service accounts.
        return (
          (upn.endsWith('@skintyee.ca') || upn === 'admin@skintyeenation.onmicrosoft.com') &&
          !upn.includes('#ext#')
        );
      })
      .map((u) => {
        const upn = (u.userPrincipalName ?? '').toLowerCase();
        const isBreakGlass = upn === 'admin@skintyeenation.onmicrosoft.com';
        const jobTitle = (u.jobTitle ?? '') as string;
        const isChief = /chief/i.test(jobTitle);
        const isCouncil = /council/i.test(jobTitle);
        const hasTitle = jobTitle.length > 0;

        const name = (u.displayName ?? `${u.givenName ?? ''} ${u.surname ?? ''}`).trim() || upn;

        const role = isChief ? 'Chief'
          : isCouncil ? 'Council'
          : isBreakGlass ? 'Staff'
          : hasTitle ? 'Staff'
          : 'Member';

        const appRole = isBreakGlass
          ? 'admin'
          : (isChief || isCouncil || /director|manager|admin/i.test(jobTitle)) ? 'admin'
          : hasTitle ? 'staff'
          : 'member';

        // Account type — license check distinguishes shared mailboxes from
        // real users. The 13 shared mailboxes (it@, chief@, councillor1@,
        // councillor2@, finance@, firechief@, forestry@, housing@,
        // landresources@, gis@, media@, referrals@, bandmanager@) have
        // accountEnabled=true but zero licenses; licensed users have at
        // least one Business Standard / E3 SKU.
        const assignedLicenses = Array.isArray(u.assignedLicenses) ? u.assignedLicenses : [];
        const accountType: 'licensed-user' | 'shared-inbox' =
          assignedLicenses.length > 0 || isBreakGlass
            ? 'licensed-user'
            : 'shared-inbox';

        // Compose the per-user mailbox list. Owner relationships are
        // tagged with "(owner)" so the UI can render them distinctly.
        const owns    = Array.from(ownsByUser.get(u.id) ?? new Set<string>());
        const members = Array.from(memberByUser.get(u.id) ?? new Set<string>())
          .filter((m) => !owns.includes(m));   // dedupe — owners are implicitly members
        const mailboxMemberships = [
          ...owns.map((m) => `${m}|owner`),
          ...members.map((m) => `${m}|member`),
        ];

        const mgr = managerByUser.get(u.id);
        const bandGroups = Array.from(bandGroupsByUser.get(u.id) ?? new Set<string>()).sort();

        return {
          id: u.id,
          upn,
          email: u.mail ?? undefined,
          name,
          role,
          title: u.jobTitle ?? undefined,
          department: u.department ?? undefined,
          phone: u.mobilePhone ?? u.businessPhones?.[0] ?? undefined,
          avatarLetter: ((u.displayName ?? u.givenName ?? '?').charAt(0)).toUpperCase(),
          appRole,
          accountType,
          mailboxMemberships,
          bandGroups,
          managerId:   mgr?.id,
          managerName: mgr?.name,
          managerUpn:  mgr?.upn,
          hasPhoto:    hasPhotoByUser.get(u.id) ?? false,
          enabled: !!u.accountEnabled,
        };
      });
  }

  // Set a user's catalog security-group memberships in Entra. `desired` is
  // a list of slugs from SKINTYEE_SECURITY_GROUPS. The caller passes
  // `currentSlugs` (the DB-recorded current state) so we don't hit
  // Graph's eventual-consistency window on /groups/{id}/members reads
  // immediately after a previous write.
  //
  // We diff and POST/DELETE the deltas through /groups/{id}/members/$ref,
  // tolerating 400 "already exists" (add) and 404 "not a member" (remove)
  // so drift between DB and Entra self-heals.
  //
  // Requires the Group.ReadWrite.All application permission (granted by
  // scripts/setup-app-graph.sh). Returns the final slug list (sorted).
  async setUserBandGroups(userId: string, desiredSlugs: string[], currentSlugs: string[]): Promise<string[]> {
    const tok = await this.getToken();
    const desired = new Set(desiredSlugs);
    const current = new Set(currentSlugs);

    const toAdd    = SKINTYEE_SECURITY_GROUPS.filter((g) =>  desired.has(g.slug) && !current.has(g.slug));
    const toRemove = SKINTYEE_SECURITY_GROUPS.filter((g) => !desired.has(g.slug) &&  current.has(g.slug));

    this.log.log(`setUserBandGroups(${userId}): +${toAdd.map((g)=>g.slug).join(',') || '∅'} -${toRemove.map((g)=>g.slug).join(',') || '∅'}`);

    // Add: POST /groups/{id}/members/$ref with @odata.id reference
    for (const g of toAdd) {
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${g.id}/members/$ref`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}` }),
      });
      if (!res.ok && res.status !== 400) {
        // 400 with "already exist" is acceptable (race condition); other
        // failures are surfaced to the caller. 204 is success.
        const text = await res.text();
        if (!/already exist/i.test(text)) {
          throw new Error(`Add to ${g.slug} failed: ${res.status} ${text}`);
        }
      }
    }

    // Remove: DELETE /groups/{id}/members/{userId}/$ref
    for (const g of toRemove) {
      const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${g.id}/members/${userId}/$ref`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tok}` },
      });
      if (!res.ok && res.status !== 404) {
        const text = await res.text();
        throw new Error(`Remove from ${g.slug} failed: ${res.status} ${text}`);
      }
    }

    return Array.from(desired).sort();
  }

  // ---- Band Meetings (M365 calendars + Outlook categories) -------------
  //
  // Reads events from the three source calendars in MEETING_SOURCE_CALENDARS
  // (bandmanager@ shared inbox + Skin Tyee Council M365 + Skin Tyee
  // Management M365), filters by Outlook category (events tagged with
  // 'Band Meeting' / 'Council Meeting' / 'Staff Meeting' / 'Public Event'
  // / 'Closed Session' from SKINTYEE_MEETING_TYPES), and returns
  // normalized BandMeetingFromGraph rows.
  //
  // Why categories not separate calendars: organizers schedule from their
  // existing flow; one click on Categorize tags the event with its type.
  // See docs/features/meeting-types.md.
  async getBandMeetings(opts?: {
    typeSlug?: string;    // filter to a single type
    from?: Date;          // ISO-8601 window start (default: now)
    to?: Date;            // window end (default: now + 90d)
    accessToken?: string; // signed-in user's Bearer — if present, reads
                          // run delegated so they can see M365 group
                          // calendars (app-only can't read those).
  }): Promise<BandMeetingFromGraph[]> {
    const from = (opts?.from ?? new Date()).toISOString();
    const to   = (opts?.to   ?? new Date(Date.now() + 90 * 86400_000)).toISOString();

    // If a specific type was requested, only match that category;
    // otherwise match ANY of our catalog categories.
    const wantedCategories = new Set(
      (opts?.typeSlug
        ? SKINTYEE_MEETING_TYPES.filter((t) => t.slug === opts.typeSlug)
        : SKINTYEE_MEETING_TYPES
      ).map((t) => t.category.toLowerCase())
    );

    // Walk all SHARED source calendars in parallel and merge results.
    // Skip the 'me' source — it's a write-time-only routing target
    // (the signed-in user's personal calendar) that wouldn't be a
    // useful place to fan out reads from on the app-only path.
    //
    // For M365 group calendars (council@, management@, band@) app-only
    // reads return 403 (Exchange's group calendar enforcement requires
    // delegated even though Graph docs say Group.ReadWrite.All covers
    // it). When `accessToken` is provided we run the read delegated so
    // group calendars surface; otherwise we skip group sources to avoid
    // logging 403 noise on every poll.
    const useDelegated = !!opts?.accessToken;
    const results: BandMeetingFromGraph[] = [];
    const sources = MEETING_SOURCE_CALENDARS
      .filter((s) => s.kind !== 'me')
      .filter((s) => useDelegated || s.kind === 'user'); // skip groups when app-only

    await Promise.all(sources.map(async (source) => {
      // For user calendars use /users/{upn}/calendarView (which honors a
      // start/end window and expands recurring events). For groups, the
      // equivalent is /groups/{id}/calendarView.
      const base = source.kind === 'user'
        ? `/users/${source.upn}/calendarView`
        : `/groups/${source.groupId}/calendarView`;
      const url = `${base}?startDateTime=${from}&endDateTime=${to}` +
                  `&$select=id,subject,bodyPreview,location,start,end,isCancelled,categories,organizer,attendees,onlineMeeting,webLink,isOnlineMeeting`;
      const srcIdx = MEETING_SOURCE_CALENDARS.indexOf(source);

      try {
        const events = useDelegated
          ? await this.graphPagedDelegated<any>(url, opts!.accessToken!)
          : await this.graphPaged<any>(url);
        for (const e of events) {
          const cats = (e.categories ?? []).map((c: string) => c.toLowerCase());
          // Match the first catalog category we find; events tagged with
          // more than one of our categories pick the first hit (rare).
          const hitCat = cats.find((c: string) => wantedCategories.has(c));
          if (!hitCat) continue;
          const type = meetingTypeByCategory.get(hitCat)!;

          results.push({
            id: e.id,
            title: e.subject ?? '(no subject)',
            agenda: (e.bodyPreview ?? '').slice(0, 500),
            location: e.location?.displayName ?? '',
            startsAt: e.start?.dateTime,
            endsAt:   e.end?.dateTime,
            cancelled: !!e.isCancelled,
            typeSlug: type.slug,
            source: source.name,
            sourceIndex: srcIdx,
            organizerName: e.organizer?.emailAddress?.name,
            organizerUpn:  e.organizer?.emailAddress?.address?.toLowerCase(),
            attendees: (e.attendees ?? []).map((a: any) => ({
              upn:  (a.emailAddress?.address ?? '').toLowerCase(),
              name: a.emailAddress?.name,
              type: a.type,
            })),
            isOnlineMeeting: !!e.isOnlineMeeting,
            joinUrl: e.onlineMeeting?.joinUrl,
            webLink: e.webLink,
          });
        }
      } catch (err) {
        this.log.warn(`getBandMeetings: couldn't read ${source.name}: ${err}`);
      }
    }));

    // De-dupe by id (an event lives on one calendar but if a member of the
    // group calendar mirrors it elsewhere we'd see duplicates) + sort.
    const byId = new Map<string, BandMeetingFromGraph>();
    for (const r of results) byId.set(r.id, r);
    return Array.from(byId.values()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  // Create a band meeting AS THE SIGNED-IN USER (delegated flow). The
  // caller passes their own Bearer access token (from Entra sign-in)
  // and Graph creates the event with them as organizer.
  //
  // Why delegated, not app-only:
  //   1. Events get the right organizer name (the human scheduling)
  //   2. Sidesteps the M365 group calendar problem — group owners/
  //      members can write to /groups/{id}/events from their own
  //      delegated token, no Exchange RBAC dance needed
  //   3. Audit trail is native
  //
  // Required delegated scope on the user's token: Calendars.ReadWrite
  // (plus Group.ReadWrite.All if posting to a group calendar). Added
  // to scripts/setup-app-signin.sh.
  //
  // Auto-tags with the Outlook category for the chosen meeting type.
  async createBandMeetingAs(opts: {
    accessToken: string;    // user's delegated Bearer token
    input: {
      typeSlug: string;
      sourceIndex?: number;
      title: string;
      agenda?: string;
      location?: string;
      startsAt: string;
      endsAt?: string;
      isOnlineMeeting?: boolean;
      attendees?: string[];
    };
  }): Promise<{ id: string; webLink?: string; typeSlug: string; source: string; organizerUpn?: string }> {
    const { input, accessToken } = opts;
    const type = meetingTypeBySlug.get(input.typeSlug);
    if (!type) throw new Error(`Unknown meeting type: ${input.typeSlug}`);

    const source: MeetingSource = MEETING_SOURCE_CALENDARS[input.sourceIndex ?? 0];
    if (!source) throw new Error(`Unknown source calendar index: ${input.sourceIndex}`);

    const endsAt = input.endsAt ?? new Date(new Date(input.startsAt).getTime() + 3600_000).toISOString();
    const body = {
      subject: input.title,
      body: { contentType: 'text', content: input.agenda ?? '' },
      start: { dateTime: input.startsAt, timeZone: 'UTC' },
      end:   { dateTime: endsAt,         timeZone: 'UTC' },
      location: input.location ? { displayName: input.location } : undefined,
      categories: [type.category],
      isOnlineMeeting: !!input.isOnlineMeeting,
      ...(input.isOnlineMeeting ? { onlineMeetingProvider: 'teamsForBusiness' } : {}),
      attendees: (input.attendees ?? []).map((a) => ({
        emailAddress: { address: a },
        type: 'required',
      })),
    };

    // Delegated path:
    //   - 'me'    → /me/events                       (user's own calendar)
    //   - 'user'  → /users/{upn}/events              (shared mailbox; user must have FullAccess)
    //   - 'group' → /groups/{groupId}/events         (M365 group; user must be member/owner)
    const path =
      source.kind === 'me'    ? '/me/events' :
      source.kind === 'user'  ? `/users/${source.upn}/events` :
                                `/groups/${source.groupId}/events`;

    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`createBandMeetingAs failed ${res.status}: ${text}`);
    }
    const created: any = await res.json();
    return {
      id: created.id,
      webLink: created.webLink,
      typeSlug: type.slug,
      source: source.name,
      organizerUpn: created.organizer?.emailAddress?.address?.toLowerCase(),
    };
  }

  // PATCH an existing band meeting AS the signed-in user. Same delegated
  // flow as createBandMeetingAs. Routes by sourceIndex because Graph
  // events are scoped to a specific calendar path.
  //
  // Source change isn't supported here (Graph doesn't move events between
  // calendars in a single PATCH; would require delete+recreate). The
  // EditMeeting screen renders source as read-only to prevent that.
  async updateBandMeetingAs(opts: {
    accessToken: string;
    eventId: string;
    sourceIndex: number;
    input: {
      typeSlug?: string;
      title?: string;
      agenda?: string;
      location?: string;
      startsAt?: string;
      endsAt?: string;
      isOnlineMeeting?: boolean;
      attendees?: string[];
    };
  }): Promise<{ id: string; webLink?: string }> {
    const { accessToken, eventId, sourceIndex, input } = opts;
    const source: MeetingSource = MEETING_SOURCE_CALENDARS[sourceIndex];
    if (!source) throw new Error(`Unknown source calendar index: ${sourceIndex}`);

    const path =
      source.kind === 'me'    ? `/me/events/${eventId}` :
      source.kind === 'user'  ? `/users/${source.upn}/events/${eventId}` :
                                `/groups/${source.groupId}/events/${eventId}`;

    // Build a sparse patch — only include keys present in input.
    const patch: any = {};
    if (input.title != null)    patch.subject = input.title;
    if (input.agenda != null)   patch.body = { contentType: 'text', content: input.agenda };
    if (input.location != null) patch.location = { displayName: input.location };
    if (input.startsAt != null) patch.start = { dateTime: input.startsAt, timeZone: 'UTC' };
    if (input.endsAt   != null) patch.end   = { dateTime: input.endsAt,   timeZone: 'UTC' };
    if (input.typeSlug) {
      const type = meetingTypeBySlug.get(input.typeSlug);
      if (!type) throw new Error(`Unknown meeting type: ${input.typeSlug}`);
      patch.categories = [type.category];
    }
    if (input.isOnlineMeeting != null) patch.isOnlineMeeting = input.isOnlineMeeting;
    if (input.attendees) {
      patch.attendees = input.attendees.map((a) => ({
        emailAddress: { address: a },
        type: 'required',
      }));
    }

    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`updateBandMeetingAs failed ${res.status}: ${text}`);
    }
    const updated: any = await res.json();
    return { id: updated.id, webLink: updated.webLink };
  }

  // DELETE an event AS the signed-in user. Routes by sourceIndex.
  async deleteBandMeetingAs(opts: {
    accessToken: string;
    eventId: string;
    sourceIndex: number;
  }): Promise<void> {
    const source: MeetingSource = MEETING_SOURCE_CALENDARS[opts.sourceIndex];
    if (!source) throw new Error(`Unknown source calendar index: ${opts.sourceIndex}`);
    const path =
      source.kind === 'me'    ? `/me/events/${opts.eventId}` :
      source.kind === 'user'  ? `/users/${source.upn}/events/${opts.eventId}` :
                                `/groups/${source.groupId}/events/${opts.eventId}`;

    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${opts.accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`deleteBandMeetingAs failed ${res.status}: ${await res.text()}`);
    }
  }

  // Stream a user's profile photo binary from Graph. Used by the api/'s
  // /v1/directory/:id/photo proxy endpoint. Returns a Node Readable stream
  // OR throws if the user has no photo (404).
  async fetchPhoto(userId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const tok = await this.getToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${userId}/photo/$value`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) {
      throw new Error(`Graph photo ${res.status}: ${await res.text()}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    return { buffer, contentType };
  }
}
