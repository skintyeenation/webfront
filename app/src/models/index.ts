// Domain models for the Skintyee app. These mirror the entities implied by the
// SkinTyee.drawio.pdf diagram (Directory, Events, Meetings, Records, Time
// Keeping, Polls). When the real API arrives these should be replaced by /
// kept in sync with the backend contract (see src/services/api/ApiService.ts).

export type Role = 'public' | 'member' | 'staff' | 'admin';

export interface BandMember {
  _id: string;
  name: string;
  role: 'Member' | 'Staff' | 'Chief' | 'Council';
  title?: string;
  email?: string; // sensitive: hidden from the public view
  phone?: string; // sensitive: hidden from the public view
  avatarLetter?: string;
  upn?: string;
  department?: string;
  appRole?: 'public' | 'member' | 'staff' | 'admin';
  // What kind of Entra account this is — drives the Directory tab's toggle
  // between "Members" (licensed users) and "Shared inboxes" (chief@, etc.).
  accountType?: 'licensed-user' | 'shared-inbox';
  // For licensed users: which shared mailboxes / mail-enabled groups they
  // have access to. Auto-populated from Graph memberOf (M365 Groups);
  // admins fill the rest manually for classic shared mailboxes that aren't
  // groups (e.g. chief@). Rendered as chips on the directory card.
  mailboxMemberships?: string[];
  // Skin Tyee Entra security-group memberships (the app's role model).
  // Array of slugs from the catalog at api/src/skintyee-groups.ts:
  //   ['admins', 'management', 'it']
  // Source of truth: Entra. EditMember screen edits these and writes back
  // via PATCH /v1/directory/:id/groups → Graph add/remove members.
  bandGroups?: string[];
  // Managed Microsoft licences the user holds — skuPartNumbers from the
  // api's LICENSE_CATALOG, e.g. ['O365_BUSINESS_PREMIUM','AAD_PREMIUM'].
  // EditMember toggles these; the directory shows an "Entra P1 / paid" badge.
  licenses?: string[];
  // Manager — the user's manager from Entra's /users/{id}/manager.
  // Nullable: not everyone has a manager set.
  managerId?: string;
  managerName?: string;
  managerUpn?: string;
  // True if the user has an Entra profile photo. When true, the UI can
  // render Avatar.Image source pointed at /v1/directory/:id/photo
  // (the api/'s proxy that streams from Graph). When false, fall back to
  // the avatarLetter rendering.
  hasPhoto?: boolean;
}

export interface CommunityEvent {
  _id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string; // ISO date
  public: boolean;
  cancelled?: boolean;
  lat?: number; // map pin
  lng?: number;
}

// Meeting type slug from api/src/skintyee-meeting-types.ts catalog.
// Drives the type chip render + filter on the Meetings page. The api/
// derives this from the underlying M365 event's Outlook category.
export type MeetingTypeSlug =
  | 'band-meeting'
  | 'council-meeting'
  | 'staff-meeting'
  | 'public-event'
  | 'closed-session';

// Structured Teams conference details, extracted server-side from the
// event body so the agenda field carries only the user's prose. See
// api/src/teams-block.ts for the parser.
export interface TeamsConference {
  joinUrl?: string;
  meetingId?: string;
  passcode?: string;
  helpUrl?: string;
}

// Arbitrary {label, url} pairs from a "Links:" section the app author
// inside the event body. Round-trips through Graph as plain text.
export interface MeetingLink {
  label: string;
  url: string;
}

export interface BandMeeting {
  _id: string;
  title: string;
  agenda: string;         // user prose only (Teams + Links sections extracted)
  location: string;
  startsAt: string;       // ISO date
  endsAt?: string;
  minutesUrl?: string;
  cancelled?: boolean;
  lat?: number;           // map pin (set via the location picker)
  lng?: number;
  // M365 calendar fields (present when meetings came from Graph rather
  // than the in-memory fixture)
  type?: MeetingTypeSlug;
  source?: string;        // human-readable source calendar name
  sourceIndex?: number;   // index into MEETING_SOURCE_CALENDARS — needed for PATCH/DELETE
  organizerName?: string;
  organizerUpn?: string;
  attendees?: Array<{ upn: string; name?: string; type?: string }>;
  isOnlineMeeting?: boolean;
  joinUrl?: string;       // Teams join URL if isOnlineMeeting (mirrors conference.joinUrl)
  webLink?: string;       // Outlook web link
  conference?: TeamsConference;  // structured Teams details parsed from body
  links?: MeetingLink[];         // structured "Links:" section parsed from body
}

// Public, transparent band expenditure by program area. The real figures come
// from the Ferrus / Adagio (Sage 300) financial integration (see app/STUBS.md);
// surfacing them publicly supports transparent band management.
export interface ExpenditureLineItem {
  label: string;
  amount: number;
}

export interface Expenditure {
  _id: string;
  area: string; // Housing, Public Works, Education, Health, Social Assistance, Child & Family Services, IT, Administration
  spent: number;
  budget: number;
  fiscalYear: string;
  // Drill-down breakdown of the area's spend into line items.
  breakdown: ExpenditureLineItem[];
}

// A capital / "Major Projects" initiative (a WordPress category on skintyee.ca),
// tracked with its allocated budget vs actual spend for transparency.
export type ProjectStatus = 'planned' | 'in_progress' | 'complete';

export interface MajorProject {
  _id: string;
  name: string;
  allocated: number; // budget allocated
  spent: number; // actual spend to date
  status: ProjectStatus;
  fiscalYear: string;
}

export interface PublicRecord {
  _id: string;
  title: string;
  category: 'Bylaw' | 'Notice' | 'Report' | 'Form';
  summary: string;
  publishedAt: string; // ISO date
}

// ---- Pay period (bi-weekly) ----------------------------------------------
// Mirrors api/src/skintyee-pay-periods.ts. The api/ is the source of truth
// for cycles; the app fetches /v1/timekeeping/pay-periods to populate the
// history dropdown + Dashboard countdown.
export interface PayPeriod {
  id: string;          // YYYY-MM-DD of the cutoff Friday
  startISO: string;
  endISO: string;
  payDateISO: string;
  label: string;       // e.g. "May 30 – Jun 12"
}

export interface PayPeriodConfig {
  lengthDays: number;
  overtimeWeeklyHoursThreshold: number;
  payDaysAfterCutoff: number;
}

// ---- New pay-period-aware timesheet model --------------------------------
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TimesheetEntry {
  id: string;
  date: string;        // YYYY-MM-DD
  hours: number;       // auto-computed from timeIn/Out when both present
  timeIn?: string;     // "HH:mm" 24h
  timeOut?: string;    // "HH:mm" 24h
  task: string;
}

export interface Timesheet {
  id: string;          // <workerUpn>:<payPeriodId>
  workerUpn: string;
  workerName: string;
  payPeriodId: string;
  status: TimesheetStatus;
  notes?: string | null;
  week1Hours: number;
  week2Hours: number;
  totalHours: number;
  overtimeHours: number;
  requiresAdminApproval: boolean;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  entries: TimesheetEntry[];
  createdAt: string;
  updatedAt: string;
}

// ---- Legacy single-row TimeEntry (the old TimeKeeping page) --------------
export interface TimeEntry {
  _id: string;
  workerName: string;
  date: string; // ISO date
  hours: number;
  task: string;
  approved: boolean;
}

// Notification categories mirror the skintyee.ca WordPress category taxonomy
// (website/importer/setup-categories.php): the Announcements sub-categories
// Health / Safety / Council, plus the top-level Events / Programs / News /
// Announcements. When the WordPress integration lands, notifications are driven
// by posts in these categories (e.g. a Water Boil Advisory => Health, a wildfire
// notice => Safety). See app/STUBS.md.
export type NotificationCategory = 'Health' | 'Safety' | 'Council' | 'Events' | 'Programs' | 'News' | 'Announcements';

export interface AppNotification {
  _id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  createdAt: string; // ISO date
  read: boolean;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

// 'survey' = informal polling/feedback; 'vote' = a formal vote on an issue
// (e.g. ratifying a bylaw or community-plan amendment). From the diagram's
// "Polling + Surveys" vs "Vote on Issues".
export type PollKind = 'survey' | 'vote';

export interface Poll {
  _id: string;
  kind: PollKind;
  question: string;
  description: string;
  closesAt: string; // ISO date
  options: PollOption[];
  closed: boolean;
}

// ---- Planner + unified homescreen feed (ADR-14) --------------------------
// Read-only mirror of Microsoft Planner data fetched through the api/'s
// GraphFeedService. Real source is Microsoft Graph; mocked locally for
// the POC. See docs/features/planner-dashboard.md.

export interface PlannerPlanSummary {
  id: string;
  title: string;
  groupId: string;
  groupName?: string;
  taskCount: number;
  openCount: number;
  completedCount: number;
}

export type PlannerStatus = 'NotStarted' | 'InProgress' | 'Completed';

export interface PlannerTask {
  id: string;
  planId: string;
  bucketName?: string;
  title: string;
  status: PlannerStatus;
  priority: number;       // 1=urgent .. 10=low
  dueDateTime?: string;   // ISO 8601
  assigneeNames?: string[];
  categoryLabels?: string[]; // first label is treated as the program area
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
  topOverdue: PlannerTask[]; // top 5 most-overdue
  generatedAt: string;
  cacheAgeMs: number;
}

// The unified feed item type — same shape the api/'s /v1/feed returns.
// Combines app-events + Teams meetings + Planner tasks + notifications
// into a single time-sorted stream for the homescreen.
export type FeedSource = 'app-event' | 'teams-meeting' | 'planner-task' | 'notification';

export interface FeedItem {
  id: string;
  source: FeedSource;
  title: string;
  startAt?: string;        // ISO — events + meetings have this
  dueAt?: string;          // ISO — Planner tasks have this
  detailUrl?: string;      // Teams join URL, Planner web link, etc.
  category?: string;       // matches WordPress taxonomy or Planner category
  audience: Role[];        // who's allowed to see this item
}
