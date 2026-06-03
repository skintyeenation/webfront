import { AppNotification, BandMember, BandMeeting, CommunityEvent, Expenditure, FeedItem, MajorProject, PayPeriod, PayPeriodConfig, PlannerPlanSummary, PlannerRollup, PlannerTask, Poll, PublicRecord, Role, TimeEntry, Timesheet } from 'skintyee/models';

/**
 * ApiService is the single seam between the app and its backend.
 *
 * STUB: there is no real backend yet. The diagram shows a future
 * API Server → Azure Cloud DB reachable at App.SkinTyee.ca. Until that exists,
 * the only implementation is the in-memory mock in ./mock. When the real API is
 * built, add a second implementation of this interface (e.g. HttpApiService) and
 * select it in src/store/apis.ts based on Config.apiServer. See STUBS.md.
 */
// One entry of the Skin Tyee groups catalog — Entra security groups +
// Microsoft 365 Groups, all manageable from the EditMember screen.
// Returned by GET /v1/admin/security-groups. See api/src/skintyee-groups.ts.
//
//   - 'entra' : Entra security group (native role / department)
//   - 'm365'  : Microsoft 365 Group (mail-enabled, shared mailbox + SP site)
export interface SecurityGroup {
  id: string;          // Entra objectId
  slug: string;        // stable kebab-case id (used in PATCH payloads)
  displayName: string;
  description: string;
  kind: 'entra' | 'm365';
}

// Shared mailbox (Exchange Online) — distinct from a Microsoft 365 Group.
// Returned by GET /v1/admin/shared-mailboxes. Access permissions live in
// Exchange Online's RBAC layer, only manageable via PowerShell.
export interface SharedMailbox {
  displayName: string;
  upn: string;
  primarySmtpAddress: string;
  alias: string;
}

// Who has FullAccess / SendAs on a shared mailbox.
export interface MailboxAccess {
  mailbox: string;
  full:   Array<{ user: string; rights: string }>;
  sendAs: Array<{ user: string; rights: string }>;
}

export interface ApiService {
  directory: {
    list(): Promise<BandMember[]>;
    get(id: string): Promise<BandMember | undefined>;
    // Write-back a member's Entra security-group memberships. The api/
    // diffs vs current and POSTs/DELETEs the deltas through Graph
    // (requires Group.ReadWrite.All). Returns the updated member.
    setGroups(id: string, groups: string[]): Promise<BandMember>;
    // Write-back a member's shared-mailbox FullAccess+SendAs. The api/
    // diffs vs DB-tracked current and calls EXO PowerShell via the
    // Azure Function for each grant/revoke.
    setMailboxes(id: string, mailboxes: string[]): Promise<BandMember>;
  };
  admin: {
    // Catalog of the 13 Entra security groups (Skin Tyee Admins, IT, etc.).
    // Drives the EditMember screen's role chip list.
    securityGroups(): Promise<SecurityGroup[]>;
    // All shared mailboxes in the tenant (5 min cache on api/).
    sharedMailboxes(): Promise<SharedMailbox[]>;
    // Who currently has FullAccess + SendAs on a mailbox (real-time from EXO).
    mailboxAccess(mailboxUpn: string): Promise<MailboxAccess>;
    // Set the list of users who have access; diff + grant/revoke via EXO.
    setMailboxAccess(mailboxUpn: string, users: string[]): Promise<MailboxAccess>;
    // Full sync from the Directory's "Sync" button — pulls from Entra
    // (Graph) AND reconciles Exchange Online mailbox permissions into
    // the DB. Returns a summary of what changed.
    sync(): Promise<{ total: number; inserted: number; updated: number; disabled: number; reconcile: { users: number; mailboxes: number; grants: number } }>;
  };
  events: {
    list(): Promise<CommunityEvent[]>;
    get(id: string): Promise<CommunityEvent | undefined>;
  };
  meetings: {
    list(): Promise<BandMeeting[]>;
    // Catalog of meeting types + source calendars. Drives the schedule
    // screen's type chip + calendar chip selectors.
    types(): Promise<{
      types:   Array<{ slug: string; displayName: string; category: string; description: string }>;
      sources: Array<{ index: number; kind: 'user'|'group'; name: string; upn?: string; groupId?: string }>;
    }>;
    // Create a real Microsoft 365 calendar event (Graph) tagged with
    // the chosen Outlook category. Returns the created event's id +
    // webLink + the slug + source name.
    create(input: {
      typeSlug: string;
      sourceIndex?: number;
      title: string;
      agenda?: string;
      location?: string;
      startsAt: string;
      endsAt?: string;
      isOnlineMeeting?: boolean;
      attendees?: string[];
    }): Promise<{ id: string; webLink?: string; typeSlug: string; source: string }>;
    // PATCH an existing event. sourceIndex required so we know which
    // calendar path to update (Graph events are calendar-scoped).
    update(id: string, input: {
      sourceIndex: number;
      typeSlug?: string;
      title?: string;
      agenda?: string;
      location?: string;
      startsAt?: string;
      endsAt?: string;
      isOnlineMeeting?: boolean;
      attendees?: string[];
    }): Promise<{ id: string; webLink?: string }>;
    delete(id: string, sourceIndex: number): Promise<void>;
  };
  publicRecords: {
    list(): Promise<PublicRecord[]>;
  };
  transparency: {
    // Public band expenditures by program area. STUB: real figures come from the
    // Ferrus ASAP Suite + Adagio / Sage 300 financial integration. See STUBS.md.
    expenditures(): Promise<Expenditure[]>;
    // Major capital projects with allocated budget vs actual spend.
    majorProjects(): Promise<MajorProject[]>;
  };
  timekeeping: {
    list(): Promise<TimeEntry[]>;
    // Pay periods — current + recent N (default 12) for the history
    // dropdown + Dashboard countdown. Returns the engine config too
    // (cycle length + OT threshold + pay-days-after-cutoff).
    payPeriods(count?: number): Promise<{
      current: PayPeriod;
      recent: PayPeriod[];
      config: PayPeriodConfig;
    }>;
    // My timesheet for one period (default current) + the last 6 history.
    myTimesheets(period?: string): Promise<{
      period: PayPeriod;
      current: Timesheet | null;
      history: Timesheet[];
    }>;
    // Save draft (no submit) — replaces all entries on the timesheet.
    saveDraft(periodId: string, body: {
      entries: Array<{ date: string; hours: number; task: string; timeIn?: string; timeOut?: string }>;
      notes?: string;
    }): Promise<Timesheet>;
    // Submit timesheet — same body, but flips status to 'submitted'
    // and records submittedAt.
    submit(periodId: string, body: {
      entries: Array<{ date: string; hours: number; task: string; timeIn?: string; timeOut?: string }>;
      notes?: string;
    }): Promise<Timesheet>;
    // Approver view — all workers' timesheets for a period.
    allTimesheets(period?: string, status?: string): Promise<Timesheet[]>;
    approve(id: string): Promise<Timesheet>;
    reject(id: string, reason?: string): Promise<Timesheet>;
  };
  polls: {
    list(): Promise<Poll[]>;
    get(id: string): Promise<Poll | undefined>;
    vote(args: { pollId: string; optionId: string }): Promise<Poll>;
  };
  notifications: {
    // In-app notifications inbox. STUB: real push delivery (Expo Notifications +
    // backend) is not wired; this just lists stored notifications. See STUBS.md.
    list(): Promise<AppNotification[]>;
  };
  // Microsoft Planner — read-only mirror via api/'s GraphFeedService.
  // Per ADR-14 + docs/features/planner-dashboard.md.
  planner: {
    // Admin Records-page rollup: open/completed/overdue totals, byProgramArea,
    // topOverdue. Role-gated `staff` + `admin` in the api/.
    rollup(): Promise<PlannerRollup>;
    plans(): Promise<PlannerPlanSummary[]>;
    tasks(planId: string): Promise<PlannerTask[]>;
  };
  // The unified homescreen feed — app-events + Teams meetings + Planner
  // due-dates + notifications, sorted by time, role-filtered for the caller.
  // Same data backs the Events tab.
  feed: {
    get(opts: { role: Role; from?: string; to?: string }): Promise<FeedItem[]>;
  };
}
