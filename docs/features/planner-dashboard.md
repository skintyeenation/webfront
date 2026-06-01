# Planner + Teams meetings + Notifications — the unified homescreen feed

How the Skin Tyee app surfaces **Microsoft Planner** board data
(tasks, buckets, assignees, due dates, progress) **merged with
Microsoft Teams meetings (calendar events)** and the app's
**Notifications** stream into a single homepage and a deeper admin
Records view.

This doc started as the Planner-only integration but expanded once the
homescreen design solidified — same Graph-API + app-only-auth + cache
pattern serves all three data sources.

> **Status:** ADR-14 decision recorded; api-side reader scaffolded;
> dashboard widget to be implemented when the rest of the dashboard
> layout is wired (post-app-plan Phase 2).
>
> **Cost:** $0 — Planner is included in Microsoft 365 Business Standard,
> Microsoft Graph access is free at the volumes we'll hit.

---

## Contents

| Section | What |
|---|---|
| [Why Planner](#why-planner) | The use case + why not build our own task tracker |
| [Auth model — app-only via skintyee-planner-reader](#auth-model) | Which Entra app, which scopes, why app-only |
| [Graph endpoints used](#graph-endpoints-used) | The specific REST calls + what each returns |
| [Caching strategy](#caching-strategy) | 5-10 min in-memory cache; why polling beats webhooks at this stage |
| [API endpoints exposed to the app](#api-endpoints) | What the NestJS api/ surfaces to the dashboard |
| [Dashboard widgets](#dashboard-widgets) | The UI pieces to build |
| [What we ARE backing up | what we are NOT](#what-this-is-and-isnt) | Scope boundaries |
| [Open follow-ups](#open-follow-ups) | The work still to do |

---

## Where each data source surfaces

Three audiences, three screens, role-gated. The Planner + Teams +
Notifications data flows into the homescreen for everyday consumption
+ flows into Records for management-depth views:

| Screen | Audience | Role gate | What it shows | Pulls from |
|---|---|---|---|---|
| **Homescreen (NEW)** | Public + Band members + Staff + Admins | `public` ↑ everyone | **Notifications** stream + **calendar OR list view** showing the next N days of Planner due-dates + Teams meetings. The "what's happening this week" view. | Notifications API + Planner (filtered to public-suitable tasks if shown to public/member) + Teams calendar |
| **Records (admin view)** | Staff + Admins | `staff` / `admin` | Operational management depth: full Planner board rollups across program areas, drill-into-plan, completion %, time keeping rollups, the deeper financial records the public Dashboard summarizes | Same Planner + Teams data, no role filtering |
| **(Legacy) Dashboard — being deprecated** | Public + Band members | `public` / `member` | Month/year budget transparency, expenditures by program area, public records charts. **The new homescreen will show this content too, or it migrates entirely into Records / Public Records pages.** | Existing `/v1/transparency/*` |

### Homescreen design (notifications + calendar/list)

The new homescreen is essentially **"what's happening now"** — one
unified feed combining three different streams:

```
┌────────────────────────────────────────────────┐
│  Skin Tyee                            🔔 (3)  │
├────────────────────────────────────────────────┤
│  📅  This week           [ Calendar | List ]  │
├────────────────────────────────────────────────┤
│                                                │
│  Mon Jun 2                                     │
│  ⏰  10:00  Council meeting (Teams)            │
│  ✅  EOD    Housing applications review        │
│             (Planner — Housing)                │
│                                                │
│  Tue Jun 3                                     │
│  ⏰  14:00  Forestry permit call (Teams)       │
│                                                │
│  Wed Jun 4                                     │
│  ⚠   OVERDUE: Re-shingle community hall        │
│             (Planner — Public Works)           │
│                                                │
│  ─── NOTIFICATIONS ───                         │
│  🆕  Water advisory — Zone 2     (just now)    │
│  🆕  Council meeting minutes posted (2h ago)   │
│  …                                             │
└────────────────────────────────────────────────┘
```

The toggle at the top (`Calendar | List`) lets users switch views; the
**default** is whichever the user last selected.

### The events stream is itself a merger of three sources

The "what's happening" feed isn't pure Planner; it's the **Events tab**
(which already exists in the app's design) re-promoted to the
homescreen, with the events stream now sourced from **three** systems:

| Source | What it contributes | Where to get it |
|---|---|---|
| **App-created events** (Community Events feature) | "Powwow on Saturday", "Open band meeting Tuesday" — the events staff create directly in the app | Existing `api/src/controllers.ts` → `@Controller('events')` (currently in-memory mock) |
| **Microsoft Teams meetings** | Council calls, forestry permit calls, internal sync meetings — anything on the Skin Tyee calendar | Microsoft Graph `/users/{id}/calendar/events` with `isOnlineMeeting=true` filter |
| **Planner tasks with due dates** | Treated as time-bound items in the feed when they have a `dueDateTime` set; the due date is the "event" | Microsoft Graph `/planner/plans/{id}/tasks` (this feature) |

The merger happens **server-side** in the api/'s
`HomescreenFeedService` — it queries all three sources, normalizes them
into a single `FeedItem` shape, sorts by time, applies the per-role
visibility filter, and returns the unified list. The app just renders
what it gets back.

```typescript
type FeedItem = {
  id:        string;
  source:    'app-event' | 'teams-meeting' | 'planner-task' | 'notification';
  title:     string;
  startAt?:  string;   // ISO 8601; events + meetings have this
  dueAt?:    string;   // Planner tasks have this
  detailUrl?:string;   // deep link back to source (Teams join, Planner web)
  category?: string;   // matches WordPress taxonomy / Planner category
  audience:  Array<'public'|'member'|'staff'|'admin'>;
  ...
};
```

This means the existing **Events tab** in the app
([`app-plan.md`](../app-plan.md)) stays — it's the same data, just
displayed as a dedicated tab vs. as a section of the homescreen. Both
views read the same `/v1/feed/*` endpoints.

### Tasks views on the homescreen — "My tasks" + "Team tasks"

In addition to the Notifications + Events feed, the homescreen has
**two task-focused views** users can pivot to:

| View | Audience | Role gate | Source |
|---|---|---|---|
| **My tasks** | The signed-in user | `member` + `staff` + `admin` (anyone with a Planner-known identity) | `GET /v1/planner/my-tasks` — Planner tasks where the signed-in user is in `assignments` |
| **Team tasks** | The signed-in user's team / department | `member` + `staff` + `admin` | `GET /v1/planner/team-tasks` — tasks in the plans the user's department owns (e.g. Housing staff see Housing plan) |
| **All tasks across program areas** (admin) | Staff + Admins | `staff` + `admin` only | `GET /v1/planner/rollup` — the cross-Nation rollup; this stays on Records page only |

So the homescreen has **four sections** users can swipe / tab between:

1. **Today / This week** — the calendar OR list events feed (default landing)
2. **Notifications** — the notifications stream (read / unread)
3. **My tasks** — what's assigned to me
4. **Team tasks** — what's on my department's plate

The deeper "rollup across all program areas" stays on Records (admin-only).

For an **unauthenticated public** visitor, only sections 1 (events,
filtered to public-suitable items) and 2 (public notifications) are
visible — sections 3/4 require auth + a known Planner identity.

Per-role visibility on items in the feed:

| Item type | Public | Member | Staff | Admin |
|---|---|---|---|---|
| Notifications (Public categories — Health/Safety/Council/Events/News) | ✅ | ✅ | ✅ | ✅ |
| Notifications (Member-only — Band Meetings minutes, Member-only announcements) | ❌ | ✅ | ✅ | ✅ |
| Teams meetings the user is invited to (delegated path) | n/a — needs auth | own only | own only | own only |
| Public-facing Planner tasks (categorized "Public" or similar) | ✅ | ✅ | ✅ | ✅ |
| All Planner tasks (any category) | ❌ | ❌ | ✅ | ✅ |
| All staff Teams meetings (admin-level visibility) | ❌ | ❌ | ❌ | ✅ |

So the homescreen has tiers:
- A **public** visitor sees: public notifications + public-categorized
  Planner items + (no Teams meetings unless they're explicitly invited
  via published links)
- A **band member** sees the above + member-only notifications + their
  own personal Teams meeting invites
- A **staff member** sees all the above + all Planner items + their
  Teams meeting calendar
- An **admin** sees everything

### What stays on the public Dashboard (or migrates)

The legacy **Dashboard (charts/budget month/year view)** stays
functional for now but is **being de-emphasized in favor of the
new homescreen**. The migration plan:

| Current Dashboard widget | Where it goes |
|---|---|
| Month / year budget rollups | Stays accessible via **Public Records → Transparency** drill-down (already linked from the existing menu); the homescreen doesn't replace it, just promotes notifications + calendar to the foreground |
| Expenditures by program area | Same — lives in Transparency |
| Any staff-only operational chart currently on the public Dashboard | Move to **Records** (admin view) |

So the **new homescreen replaces the *role* of the old Dashboard as the
landing page**, but the existing transparency content still has a
home — just one tap deeper, under Public Records.

The Records page picks up **operational management depth**: full
Planner board rollups, drill-into-plan, completion % by program area,
time keeping summaries, the deeper financials the homescreen + public
records show in summary form.

The Nation already uses **Microsoft Planner** (bundled with M365
Business Standard) for that kind of operational task tracking,
organized into plans-per-department (typically one plan per program
area, with buckets like "Backlog / In progress / Blocked / Done").

Three options for the dashboard widget:

| Option | Where the data lives | Effort | Trade-off |
|---|---|---|---|
| **A. Read Planner via Graph** ← **chosen** | Microsoft 365 (Planner) | Low — Graph is a stable API | Staff continue managing tasks where they already do (Planner UI in Teams / web); the app is read-only. **Single source of truth.** |
| B. Build our own task model in the api/ | Postgres | Medium — full CRUD + sync | Double-entry: staff would either abandon Planner or maintain both. Bad pattern. |
| C. Embed the Planner web UI in a WebView | n/a (just an iframe) | Very low | Doesn't give us aggregation / rollups / custom filtering by Skin-Tyee-specific program area; not really a "dashboard" — just a smaller Planner. |

A wins on every axis except "needing M365 sign-in for write" — and we
explicitly want read-only at this stage anyway.

### Why we trust Planner with this

- It's already where staff work — adoption + training already happened
  via M365 onboarding
- It's covered by our backup architecture (Planner data lives in the
  M365 Group's Exchange + SharePoint storage, both captured by
  [`docs/365/email-backup.md`](../365/email-backup.md) +
  `docs/365/sharepoint-backup.md` (future))
- The Nation owns the tenant — no third-party SaaS dependency for
  task data

---

## Auth model

**App-only authentication** via a new Entra app. (Originally scoped as
`skintyee-planner-reader` for Planner-only; **renamed to
`skintyee-app-graph`** once the homescreen feed expanded to also cover
Teams meetings — the name reflects "the Entra app the community app
uses to read Microsoft Graph data," and the scope can grow without
forcing another rename.)

| Field | Value |
|---|---|
| App display name | `skintyee-app-graph` |
| Audience | Single tenant (AzureADMyOrg) |
| Permissions (application, not delegated) | `Tasks.Read.All` (Planner tasks) · `Group.Read.All` (enumerate M365 Groups that own each Planner plan) · `Calendars.Read` (Teams meetings = calendar events with `isOnlineMeeting=true`) · `User.Read.All` (resolve assignee IDs → names for the My-tasks / Team-tasks views) |
| Credential | Client secret, 24-month expiry, stored in 1Password → IT/Admin → `skintyee-app-graph` (NOT in the variable group; consumed only by the api/ at runtime via Container App secret env vars) |
| Created by | [`scripts/setup-app-graph.sh`](../../scripts/setup-app-graph.sh) |

### Why app-only, not delegated

The dashboard widget aggregates across the *whole tenant* (e.g. "total
open tasks across all program areas") for any staff member viewing the
Dashboard. Delegated (per-user OAuth) would mean:

1. Every dashboard viewer would have to sign into M365 (the app's auth
   is still stubbed in Phase 1 — Entra ID integration is Phase 2 work)
2. Each viewer would only see plans *they* have access to — fine for
   "my tasks", broken for "Nation-wide rollup"
3. We'd hit the per-user OAuth + token-refresh dance for every viewer

App-only sidesteps all three:
- The api/ holds the credential, fetches everything once per cache
  cycle, serves cached results to all viewers
- Tenant-wide visibility (matching what an admin would see in the
  Planner UI)
- One token-refresh path for the api to manage

When we wire delegated auth later (Phase 2 — app-side Entra ID), we
can add per-user endpoints (`GET /v1/planner/my-tasks`) that use the
signed-in user's token instead. The app-only path stays for the
aggregate views.

### Least privilege

We grant the **minimum** Graph permissions for a read-only dashboard:

- ✅ `Tasks.Read.All` — read Planner tasks
- ✅ `Group.Read.All` — enumerate the groups that own each plan
- ❌ NOT `Tasks.ReadWrite.All` (we don't write back)
- ❌ NOT `Group.ReadWrite.All` (we don't modify groups)
- ❌ NOT `User.Read.All` (task assignee user IDs are enough; we don't
  need full user profiles for dashboard rollups)
- ❌ NOT `Sites.Read.All` (separate from Planner; covered by the
  SharePoint backup app)

If we add a "click into a task to see attachments" feature later, we
might need `Files.Read.All` — but that's a deliberate scope expansion,
not a blanket grant.

---

## Graph endpoints used

The api/'s `GraphFeedService` makes these calls on each cache miss
(parallelized; one full refresh = ~50-200 calls):

### Planner data

| Step | Endpoint | What it returns | When |
|---|---|---|---|
| 1 | `GET /groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')` | All M365 Groups in the tenant that have Teams enabled (Planner plans live inside M365 Groups; this enumerates the groups we have plans in) | Once per cache cycle |
| 2 | `GET /groups/{group-id}/planner/plans` | All plans owned by a group | Per group, in parallel |
| 3 | `GET /planner/plans/{plan-id}/tasks` | All tasks in a plan (50-100 typical) — title, assignees, due, % complete, priority, bucket, category labels | Per plan, in parallel |
| 4 | `GET /planner/plans/{plan-id}/details` | Category label names (1-25 → "Health & Safety", "Council", etc.) | Per plan, cached longer |
| 5 | `GET /planner/plans/{plan-id}/buckets` | Bucket names ("Backlog", "In Progress", "Done", etc.) | Per plan, cached longer |

### Teams meetings (calendar events)

| Step | Endpoint | What it returns | When |
|---|---|---|---|
| 6 | `GET /users/{user-id}/calendar/events?$filter=isOnlineMeeting eq true and start/dateTime ge '{nowISO}'` | Upcoming Teams meetings on a user's calendar; `start`, `end`, `subject`, `organizer`, `attendees`, `onlineMeeting.joinUrl` | Per user, in parallel (only for staff/admin users; band members' personal calendars are fetched on demand via delegated auth) |

Note: **Teams meetings ARE calendar events** in Exchange — the
`isOnlineMeeting=true` flag distinguishes them from regular calendar
events. The same `Calendars.Read` scope covers both. No separate
`OnlineMeetings.Read.All` needed unless we want meeting recordings or
transcripts (not in scope).

### User lookups (assignee names)

| Step | Endpoint | What it returns | When |
|---|---|---|---|
| 7 | `GET /users/{id}` | Display name + email for an assignee ID | Cached aggressively (24h+); names rarely change |

### App-side data (NOT Graph)

| Step | Endpoint | What it returns |
|---|---|---|
| 8 | The api/'s own `/v1/events` (existing) — community events created in the app | App's existing in-memory mock today; Postgres-backed in Phase 2 |
| 9 | The api/'s own `/v1/notifications` (existing) — notifications stream | Same; sourced from WordPress feed in Phase 2 |

The `GraphFeedService` reads all 9 sources, normalizes into the unified
`FeedItem` shape (see § Events stream merger above), sorts by time, and
caches the materialized feed.

**Stick with `v1.0`** for all Graph calls — `beta` has Planner Premium
features (Gantt, dependencies) + bleeding-edge calendar features we
don't need.

### Notable Graph quirks

| Quirk | Mitigation |
|---|---|
| Categories on tasks are integers 1-25; label NAMES live on the plan, not the task | Cache plan details (step 4) and join client-side |
| Plans only exist inside M365 Groups; you can't "list all plans in the tenant" directly | Two-step enumeration: groups → their plans |
| `progress` is 0 / 50 / 100 (NotStarted / InProgress / Completed) — three values, not a continuous % | Map to friendly labels in the dashboard widget |
| Task `assignments` is a dictionary keyed by user ID, not an array | Coerce to array client-side; show names by looking up user IDs via cached `User.Read.All` (or just show "N people assigned" if we don't have name lookups) |
| Throttling: ~10k requests per app per 10 min | Aggressively cache; one full refresh = ~50-200 calls depending on plan count |

---

## Caching strategy

**5-10 minute in-memory TTL** on the api/ side. Per cache cycle:

1. PlannerService refresh fires (interval timer OR first request after TTL expiry — whichever comes first)
2. Fetch groups → plans → tasks in parallel
3. Compute rollups (per program area, per status, per assignee)
4. Cache the materialized result + timestamp
5. Serve cached result to every dashboard request until next refresh

### Why polling, not webhooks (yet)

Graph supports **change notifications** on `/planner/tasks` —
near-real-time push when a task changes. We don't use them in
Phase 1 because:

- Webhooks require a **publicly-reachable HTTPS endpoint** with a
  validation handshake — adds infra surface area
- Dashboard data freshness of 5-10 min is plenty for "what's on
  the team's plate this week"
- Subscription renewals every 3 days adds operational overhead
- A simple polling loop is auditable + debuggable

Phase 2 trigger: if we add a "real-time task notifications" feature
(push a notification to the assignee's app the moment a task is
created/assigned/due-soon), webhooks become valuable. Keep the
PlannerService refactorable for that switch.

### Cache invalidation

Two paths:

1. **TTL** — automatic, on cache age > N minutes
2. **Manual refresh** — `POST /v1/planner/refresh` admin endpoint
   (role-gated to staff/admin) for "I just made a change in Planner
   and want to see it now"

---

## API endpoints

The NestJS api/ surfaces these to the app:

### Homescreen endpoints (used by the new unified homescreen)

| Endpoint | Returns | Role gate | Used by |
|---|---|---|---|
| `GET /v1/feed` | The unified feed: app-events + Teams meetings + Planner due-dates + notifications, normalized + sorted + role-filtered for the caller | `public` ↑ everyone | Homescreen — "This week" calendar/list view |
| `GET /v1/feed?from=<iso>&to=<iso>` | Same, time-windowed | `public` ↑ | Homescreen calendar view (month navigation) |
| `GET /v1/planner/my-tasks` | Tasks assigned to the signed-in user (across all plans) | `member` + `staff` + `admin` | Homescreen — "My tasks" view |
| `GET /v1/planner/team-tasks` | Tasks in the plans my department owns | `member` + `staff` + `admin` | Homescreen — "Team tasks" view |

### Records-page endpoints (admin/management depth)

| Endpoint | Returns | Role gate | Used by |
|---|---|---|---|
| `GET /v1/planner/rollup` | Cross-Nation aggregated rollup: total tasks by status, top 5 overdue tasks, completion % per program area | `staff` + `admin` | Records page — primary admin widget |
| `GET /v1/planner/plans` | All plans, with title + group + count | `staff` + `admin` | Records page — plan picker dropdown |
| `GET /v1/planner/plans/:id/tasks` | All tasks in a plan, with bucket + category labels resolved | `staff` + `admin` | Records page — drill-into-plan view |
| `POST /v1/planner/refresh` | Force a cache refresh | `admin` | Operational button on Records page |

### Cross-cutting

- The `/v1/feed` endpoint **role-filters internally** — a `public`
  caller gets a subset, an `admin` caller gets the full feed. Same
  endpoint, server-side filtering based on the caller's `x-role`
  header (existing pattern from
  [`api/src/controllers.ts`](../../api/src/controllers.ts)).
- The Records-page endpoints (Planner rollup, plans, tasks) **reject**
  `public` / `member` calls outright via `@Roles('staff', 'admin')` —
  task tracking is internal operations, not public records.

---

## Records page widgets (NOT the public Dashboard)

The app's **`RecordsScreen` (admin view)** gets one new widget initially:

```
┌──────────────────────────────────────────┐
│  Tasks across program areas              │
│                                          │
│  Open: 47       Overdue: 3   Done: 124   │
│                                          │
│  ▓▓▓▓▓░░  Housing       12 open │ 8 done │
│  ▓▓▓░░░░  Forestry       6 open │ 4 done │
│  ▓▓▓▓░░░  Health         9 open │ 7 done │
│  ▓▓░░░░░  Council        4 open │ 3 done │
│  …                                       │
│                                          │
│  Top overdue:                            │
│  • Re-shingle community hall (3d late)   │
│  • Forestry permit renewal  (1d late)    │
│  • …                                     │
│                                          │
│  [ Open Planner in Teams → ]             │
└──────────────────────────────────────────┘
```

Maps program areas to existing Planner plans 1:1 — or to a single
plan with categories acting as program areas. Either works.

### What stays on the public Dashboard

The public Dashboard (homescreen) **continues to show the same
public-transparency content it does today**: month/year budget
rollups, expenditures by program area, public records charts.
Adding the Planner widget there would expose operational task data
to the general public — wrong audience.

### What moves OR is shared with the public Dashboard

If today's Dashboard has any **operational / staff-only data** mixed in
with the public transparency stuff, those pieces should **migrate to
the Records page** alongside the new Planner widget. The audit list:

| Current Dashboard widget | Audience it serves | Keep on Dashboard? | Move to Records? |
|---|---|---|---|
| Month / year budget rollups | Public + members (transparency) | ✅ Yes | — |
| Expenditures by program area (public-facing totals) | Public + members | ✅ Yes | — |
| Public records charts | Public + members | ✅ Yes | — |
| ANY operational charts currently on Dashboard that aren't strictly public | Staff / admin | ❌ Remove | ✅ Yes (move to Records) |

The rule going forward: **if the data answers a band-member's question
about how the Nation is doing, it belongs on the Dashboard. If the
data answers a staff member's question about what they need to do
next, it belongs on Records.**

### Future Records-page widgets (Phase 2)

- **My tasks** — overdue, due today, due this week (uses delegated auth
  when the app's Entra ID sign-in is wired)
- **Council's plate** — admin-only view: what the Chief + Council seats
  have assigned to them across all plans
- **Recently completed** — could feed back INTO the public Dashboard as
  a "this week the Nation completed X, Y, Z" celebratory rollup, if and
  when we want to publish that — but only a *curated* subset (admin opt-in
  per item), since not every completed task is public-suitable
- **Push notification on task assignment** — uses webhook subscriptions
  (Phase 2)

---

## What this is and isn't

| Source | Backed up? | Where to look |
|---|---|---|
| Planner tasks, buckets, plans | Part of M365; goes through the M365 Group's storage → covered by [`docs/365/email-backup.md`](../365/email-backup.md) (the parent group's mailbox) + future SharePoint backup (Group files) | n/a |
| Planner Premium (Project for the Web) — Gantt, dependencies, baselines | ⚠ We do NOT have Planner Premium licenses; if we ever add it, those features are reachable via the Graph beta endpoint with different scopes | n/a |
| Microsoft To Do (personal task list, distinct from Planner) | Separate API surface; not in scope here. Future "my personal tasks" feature might use it. | n/a |
| Tasks created via the Skin Tyee app itself | ⚠ Out of scope — the app is READ-ONLY against Planner. If staff want to create tasks, they use Planner (Teams / web). |  |

---

## Open follow-ups

| Task | Notes |
|---|---|
| **Create the Entra app** via [`scripts/setup-planner-reader.sh`](../../scripts/setup-planner-reader.sh) | One-time, takes ~30 seconds; outputs client-secret for 1Password |
| **Wire the api/ to use it** | `PLANNER_CLIENT_ID` + `PLANNER_CLIENT_SECRET` + `PLANNER_TENANT_ID` env vars (read from ADO variable group's secret store) into the `api-prod` Container App secrets |
| **Build the dashboard widget** in the app | When the dashboard layout is finalized (post-app-plan); fetches `/v1/planner/dashboard` |
| **Map program areas → plan IDs** | Either: (a) one plan per program area + plan-id ↔ program mapping in config; (b) one master plan + categories per program area. Pick during implementation. |
| **Map task assignee IDs → friendly names** | Skin Tyee staff names + photos. Cache via `User.Read.All` OR a manual mapping table for ~30 staff. |
| **Wire delegated auth for `my-tasks`** | Phase 2, after app-side Entra ID is integrated |
| **Webhook subscription for real-time** | Phase 2, when a real-time notification feature is added |

---

## See also

- [`docs/architecture-decisions.md`](../architecture-decisions.md) — ADR-14 records the decision
- [`docs/365/entra-usage.md`](../365/entra-usage.md) — list of all Entra apps (this one joins it)
- [`docs/app-plan.md`](../app-plan.md) — the app's overall build plan
- [`scripts/setup-planner-reader.sh`](../../scripts/setup-planner-reader.sh) — Entra-app provisioning
- [`api/src/planner.service.ts`](../../api/src/planner.service.ts) — Graph wrapper + cache
- [Microsoft Graph Planner API reference](https://learn.microsoft.com/en-us/graph/api/resources/planner-overview)
- [Application permissions for Tasks.Read.All](https://learn.microsoft.com/en-us/graph/permissions-reference#tasksreadall)
