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

// Global notification settings — drives System → "Configure Notifications".
// Returned by GET/PUT /v1/admin/notification-settings (admin-only). Each
// boolean is a kill-switch for one class of system email; the sender fields
// set the From + Reply-To on every outgoing message.
export interface NotificationSettings {
  staffOtp: boolean;               // staff sign-in OTP (on add / password set)
  communityNotifications: boolean; // band-member notification blasts
  timesheetEvents: boolean;        // timesheet submitted / edited / approved / rejected
  accountDeleted: boolean;         // staff offboarding email
  fromName: string;                // sender display name
  fromEmail: string;               // sender address (e.g. it@skintyee.ca)
  replyTo: string;                 // Reply-To address ('' = none)
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
    /** Provision a new Entra user via Graph + upsert BandMember +
     *  optionally seed a Person. Returns the persisted member, the
     *  one-time password (admin shows it once), and any group slugs
     *  that failed to apply. See docs/features/member-provisioning.md. */
    createUser(input: {
      displayName: string;
      userPrincipalName: string;
      mailNickname?: string;
      jobTitle?: string;
      department?: string;
      phone?: string;
      password: string;
      forceChangePasswordNextSignIn?: boolean;
      bandGroups?: string[];
      createPerson?: boolean;
      timesheetsEnabled?: boolean;
    }): Promise<{
      bandMember: BandMember;
      personId?: string;
      oneTimePassword: string;
      failedGroups: string[];
    }>;
    /** Rotate a user's Entra password. Returns the new password once;
     *  it isn't persisted server-side. Sets forceChangePasswordNextSignIn
     *  so the user has to change it on next sign-in. */
    rotatePassword(id: string, password?: string): Promise<{ password: string }>;

    // ---- Person (staff-auth) password admin --------------------------
    // For Person rows with bandMemberId=null only. Server rejects with
    // 400 when the target Person is Entra-backed.
    //
    /** Issue or rotate a Person's app-sign-in password. Server-generates
     *  if `password` is absent. Returns the new password ONCE (the only
     *  place it appears — not stored client-side). */
    setPersonPassword(id: string, password?: string): Promise<{ password: string }>;
    /** Revoke app access for a Person without deleting the row. */
    revokePersonPassword(id: string): Promise<void>;

    // ---- Notification settings (System → Configure Notifications) -----
    /** Global per-category email toggles + sender/reply-to. Admin-only. */
    getNotificationSettings(): Promise<NotificationSettings>;
    /** Patch any subset of the notification settings; returns the full set. */
    updateNotificationSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings>;
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
    /** Admin-only: unlock an approved timesheet for correction. Returns it to
     *  'submitted' and clears the approval so it can be edited again. */
    reopen(id: string): Promise<Timesheet>;
    /** Admin-only nuclear option — removes the timesheet + its entries.
     *  UI MUST confirm before calling. Used for duplicates, departures
     *  mid-period, or correcting a mis-attributed sheet. */
    deleteTimesheet(id: string): Promise<void>;
    /** Admin-only edit on behalf of a worker. 403 once status='approved'
     *  (delete + have the worker re-submit instead). */
    adminGetTimesheet(id: string): Promise<Timesheet>;
    adminEditTimesheet(id: string, body: { entries: Array<{ date: string; hours: number; task: string; timeIn?: string; timeOut?: string }>; notes?: string }): Promise<Timesheet>;
    /** Admin: list every person enabled for timesheets — drives the
     *  Approvals tab's full roster including the NOT STARTED bucket. */
    eligiblePeople(): Promise<Array<{ personId: string; workerUpn: string; workerName: string; isBandMember: boolean }>>;
    /** Worker self-check: am I allowed to enter timesheets? */
    meEligible(): Promise<{ eligible: boolean; upn: string }>;
    /** Admin: seed an empty draft for a person; idempotent. Returns
     *  the (existing or newly created) Timesheet so the UI can
     *  navigate to admin-edit on its id. */
    adminStartTimesheet(input: { personId: string; periodId: string }): Promise<Timesheet>;
    // Reports — admin-only. PDF + CSV per pay period.
    reports: {
      list(count?: number): Promise<TimesheetReportSummary[]>;
      generate(periodId: string): Promise<TimesheetReportSummary>;
      /** Streams the PDF through the authenticated api/ endpoint and
       *  returns a Blob. `opts.download` flips the server's
       *  Content-Disposition to attachment (irrelevant when the caller
       *  is going to save it themselves but useful for headers). */
      fetchPdf(periodId: string, opts?: { download?: boolean }): Promise<{ blob: Blob; filename: string }>;
      fetchCsv(periodId: string): Promise<{ blob: Blob; filename: string }>;
    };
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
  // Documents library + tag catalog. Admin uploads / edits; anyone signed
  // in lists/reads subject to per-doc audience gating.
  // See docs/features/documents-and-onboarding.md.
  documents: {
    list(opts?: { tag?: string; search?: string }): Promise<DocumentDto[]>;
    get(id: string): Promise<DocumentDto>;
    create(input: {
      title: string;
      description?: string;
      linkUrl?: string;
      audience: DocumentAudience;
      companyId?: string;
      tagIds: string[];
      file?: { uri: string; name: string; mimeType: string };
    }): Promise<DocumentDto>;
    update(id: string, patch: Partial<{
      title: string;
      description: string | null;
      linkUrl: string | null;
      audience: DocumentAudience;
      companyId: string | null;
      tagIds: string[];
    }>): Promise<DocumentDto>;
    delete(id: string): Promise<void>;
    /** Stream the PDF/file bytes through the api/. Same Blob pattern as
     *  TimesheetReports — lets the client open / save without needing
     *  the storage adapter's URL to be browser-reachable. */
    fetchPdf(id: string, opts?: { download?: boolean }): Promise<{ blob: Blob; filename: string }>;
  };
  documentTags: {
    list(): Promise<{
      categories: Array<{ slug: 'gov' | 'gov_sector' | 'department'; displayName: string; description: string }>;
      tags: DocumentTagDto[];
    }>;
    create(input: { category: 'gov' | 'gov_sector' | 'department'; slug: string; displayName: string }): Promise<DocumentTagDto>;
    update(id: string, patch: { slug?: string; displayName?: string }): Promise<DocumentTagDto>;
    delete(id: string): Promise<void>; // 409 if inUseCount > 0 on the server.
  };
  // Assets — Entra-registered devices (Microsoft Graph /devices). Read-only
  // admin inventory: list + per-device detail showing the registered owners
  // and users (i.e. who can sign in to / access each device). When wired to
  // the real api/ this maps to GET /v1/devices and
  // GET /v1/devices/:id (which calls /devices, /registeredOwners,
  // /registeredUsers via Graph — needs Device.Read.All). See STUBS.md.
  devices: {
    list(): Promise<DeviceDto[]>;
    get(id: string): Promise<DeviceDetailDto>;
  };
  // Phase 2 — Onboarding flows. Admin-only endpoints + a public tokenised
  // path for people. See docs/features/documents-and-onboarding.md.
  onboarding: {
    listFlows(): Promise<OnboardingFlowDto[]>;
    getFlow(id: string): Promise<OnboardingFlowDto>;
    createFlow(input: { title: string; description?: string; companyId?: string }): Promise<OnboardingFlowDto>;
    updateFlow(id: string, patch: Partial<{ title: string; description: string | null; active: boolean; companyId: string | null }>): Promise<OnboardingFlowDto>;
    deleteFlow(id: string): Promise<void>;
    addStep(flowId: string, input: { title: string; instructions?: string; completion?: StepCompletion }): Promise<OnboardingStepDto>;
    updateStep(id: string, patch: Partial<{ title: string; instructions: string | null; completion: StepCompletion; order: number }>): Promise<OnboardingStepDto>;
    deleteStep(id: string): Promise<void>;
    attachDocument(stepId: string, input: { documentId: string; personUploadAllowed?: boolean }): Promise<void>;
    detachDocument(rowId: string): Promise<void>;
    addLink(stepId: string, input: { label: string; url: string }): Promise<void>;
    removeLink(rowId: string): Promise<void>;
    listPeople(): Promise<PersonDto[]>;
    createPerson(input: { displayName?: string; email?: string; phone?: string; companyId?: string; bandMemberId?: string; timesheetsEnabled?: boolean }): Promise<PersonDto>;
    updatePerson(id: string, patch: Partial<{ displayName: string; email: string | null; phone: string | null; companyId: string | null; bandMemberId: string | null; timesheetsEnabled: boolean }>): Promise<PersonDto>;
    deletePerson(id: string): Promise<void>;
    listAssignments(opts?: { flowId?: string; personId?: string }): Promise<OnboardingAssignmentDto[]>;
    /** Worker view — assignments belonging to the signed-in caller. */
    myAssignments(): Promise<OnboardingAssignmentDto[]>;
    getAssignment(id: string): Promise<OnboardingAssignmentDto>;
    createAssignment(input: { flowId: string; personId: string }): Promise<OnboardingAssignmentDto>;
    rotateToken(id: string): Promise<{ publicToken: string }>;
    approveStep(assignmentId: string, stepId: string, notes?: string): Promise<OnboardingStepStateDto>;
    rejectStep(assignmentId: string, stepId: string, notes?: string): Promise<OnboardingStepStateDto>;
    resetStep(assignmentId: string, stepId: string): Promise<OnboardingStepStateDto>;
    adminUpload(assignmentId: string, stepId: string, file: { uri: string; name: string; mimeType: string }): Promise<OnboardingStepStateDto>;
    /** Worker uploading their own file for a step in their own assignment. */
    meUpload(assignmentId: string, stepId: string, file: { uri: string; name: string; mimeType: string }): Promise<OnboardingStepStateDto>;
    // Public — no role needed; pass the assignment token.
    publicView(token: string): Promise<OnboardingAssignmentDto>;
    publicUpload(token: string, stepId: string, file: { uri: string; name: string; mimeType: string }): Promise<OnboardingStepStateDto>;
  };
}

// ---- Onboarding DTOs -------------------------------------------------------

export type StepCompletion = 'admin_marks' | 'person_uploads' | 'both';
export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface OnboardingFlowDto {
  id: string;
  title: string;
  description: string | null;
  companyId: string | null;
  active: boolean;
  steps: OnboardingStepDto[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface OnboardingStepDto {
  id: string;
  flowId: string;
  order: number;
  title: string;
  instructions: string | null;
  completion: StepCompletion;
  documents: Array<{ id: string; documentId: string; personUploadAllowed: boolean }>;
  links: Array<{ id: string; label: string; url: string }>;
}

export interface PersonDto {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  /** Optional 1:1 link to a BandMember row. When set, the linked
   *  member's name/email/phone are the source of truth. */
  bandMemberId: string | null;
  bandMemberName: string | null;
  bandMemberUpn: string | null;
  /** Toggle gating Time Keeping. When true, the person shows up on
   *  the Approvals roster + is allowed to enter timesheets. */
  timesheetsEnabled: boolean;
  /** Whether this Person currently has a password set for the
   *  email/password sign-in path. False for Entra-linked Persons
   *  (they use SSO) and for externals who haven't had one issued yet. */
  hasAppSignIn: boolean;
  createdAt: string;
}

export interface OnboardingAssignmentDto {
  id: string;
  flowId: string;
  personId: string;
  publicToken: string;
  startedAt: string;
  completedAt: string | null;
  stepStates: OnboardingStepStateDto[];
}

export interface OnboardingStepStateDto {
  id: string;
  assignmentId: string;
  stepId: string;
  status: OnboardingStepStatus;
  personFileKey: string | null;
  personFileUrl: string | null;
  personFileName: string | null;
  personMimeType: string | null;
  personSizeBytes: number | null;
  notes: string | null;
  completedAt: string | null;
  completedBy: string | null;
}

// ---- Documents DTOs --------------------------------------------------------

export type DocumentAudience = 'admin' | 'staff' | 'band_member' | 'public';

export interface DocumentDto {
  id: string;
  title: string;
  description: string | null;
  storage: 'blob' | 'sharepoint' | null;
  fileKey: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  linkUrl: string | null;
  audience: DocumentAudience;
  companyId: string | null;
  tagIds: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

// ---- TimesheetReport DTO --------------------------------------------------

export interface TimesheetReportSummary {
  payPeriodId: string;
  periodLabel: string;
  startISO: string;
  endISO: string;
  payDateISO: string;
  hasData: boolean;
  workerCount: number;
  totalHours: number;
  // When a PDF report has been generated.
  reportId?: string;
  reportUrl?: string;
  reportGeneratedAt?: string;
  reportSizeBytes?: number;
}

export interface DocumentTagDto {
  id: string;
  category: 'gov' | 'gov_sector' | 'department';
  slug: string;
  displayName: string;
  /** Server-side count of documents using this tag. UI uses it to show
   *  an "in use (N)" badge and disable Delete when > 0. */
  inUseCount: number;
}

// ---- Devices (Entra) -------------------------------------------------------

/** Entra join type — maps to Graph's device.trustType. */
export type DeviceTrustType = 'AzureAd' | 'Hybrid' | 'Workplace';

/** How a user is attached to a device: a registered *owner* vs a registered
 *  *user* (Graph's registeredOwners vs registeredUsers). Both can sign in. */
export type DeviceAccessType = 'owner' | 'user';

export interface DeviceUserDto {
  id: string;
  displayName: string;
  email: string;
  accessType: DeviceAccessType;
}

export interface DeviceDto {
  id: string;
  displayName: string;
  /** 'Windows' | 'Windows Server' | 'iOS' | 'iPadOS' | 'Android' | 'macOS'. */
  operatingSystem: string;
  osVersion: string;
  trustType: DeviceTrustType;
  isCompliant: boolean;
  isManaged: boolean;
  /** accountEnabled — a disabled device can't authenticate. */
  enabled: boolean;
  approximateLastSignInDateTime: string; // ISO 8601
  registrationDateTime: string;          // ISO 8601
  /** Count of registered owners + users — shown on the list row. */
  userCount: number;
}

export interface DeviceDetailDto extends DeviceDto {
  /** Registered owners + users — who can access this device. */
  users: DeviceUserDto[];
}
