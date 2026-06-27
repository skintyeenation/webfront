import { ApiService, NotificationSettings } from './ApiService';
import * as fixtures from './fixtures';
import { Poll } from '@skintyee/models';

// STUB: an in-memory implementation of ApiService. State lives in module scope and
// resets on reload (no persistence). Network latency is simulated with `delay`.
// Replace this with a real HTTP client when the Azure API exists. See STUBS.md.

const delay = <T>(value: T, ms = 250): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

// Mutable copy so `vote` can mutate poll state during a session.
let polls: Poll[] = JSON.parse(JSON.stringify(fixtures.polls));

// In-memory notification settings so the System → Configure Notifications
// screen is fully usable in mock mode (resets on reload, like all mock state).
let notificationSettings: NotificationSettings = {
  staffOtp: true,
  communityNotifications: true,
  timesheetEvents: true,
  expenseEvents: true,
  accountDeleted: true,
  fromName: 'Skin Tyee First Nation',
  fromEmail: 'it@skintyee.ca',
  replyTo: '',
};

export const mockApiService: ApiService = {
  directory: {
    list: () => delay(fixtures.members),
    get: (id) => delay(fixtures.members.find((m) => m._id === id)),
    // Role + mailbox editing writes to Entra / Exchange Online — there
    // is no useful mock for these. Anyone hitting them is misconfigured
    // (mock api selected) and should point EXPO_PUBLIC_API_SERVER at the
    // real api/.
    setGroups:    () => { throw new Error('directory.setGroups requires the real api/ (Entra write-back).'); },
    setMailboxes: () => { throw new Error('directory.setMailboxes requires the real api/ (Exchange Online write-back).'); },
    setLicenses:  () => { throw new Error('directory.setLicenses requires the real api/ (Entra licence assignment).'); },
    setBlocked:   () => { throw new Error('directory.setBlocked requires the real api/ (Entra accountEnabled).'); },
    forcePasswordReset: () => { throw new Error('directory.forcePasswordReset requires the real api/ (Entra revoke + email).'); },
  },
  admin: {
    securityGroups:   () => { throw new Error('admin.securityGroups requires the real api/'); },
    licenseCatalog:   () => { throw new Error('admin.licenseCatalog requires the real api/'); },
    sharedMailboxes:  () => { throw new Error('admin.sharedMailboxes requires the real api/ (EXO function)'); },
    mailboxAccess:    () => { throw new Error('admin.mailboxAccess requires the real api/ (EXO function)'); },
    setMailboxAccess: () => { throw new Error('admin.setMailboxAccess requires the real api/ (EXO function)'); },
    sync:             () => { throw new Error('admin.sync requires the real api/'); },
    createUser:       () => { throw new Error('admin.createUser requires the real api/'); },
    rotatePassword:   () => { throw new Error('admin.rotatePassword requires the real api/'); },
    setPersonPassword:     () => { throw new Error('admin.setPersonPassword requires the real api/ (staff-auth)'); },
    revokePersonPassword:  () => { throw new Error('admin.revokePersonPassword requires the real api/ (staff-auth)'); },
    getNotificationSettings: () => delay({ ...notificationSettings }),
    updateNotificationSettings: (patch) => {
      notificationSettings = {
        ...notificationSettings,
        ...patch,
        // keep string fields trimmed, mirroring the api/'s SettingsService
        fromName:  (patch.fromName  ?? notificationSettings.fromName ).toString().trim() || 'Skin Tyee First Nation',
        fromEmail: (patch.fromEmail ?? notificationSettings.fromEmail).toString().trim() || 'it@skintyee.ca',
        replyTo:   (patch.replyTo   ?? notificationSettings.replyTo  ).toString().trim(),
      };
      return delay({ ...notificationSettings });
    },
  },
  events: {
    list: () => delay(fixtures.events),
    get: (id) => delay(fixtures.events.find((e) => e._id === id)),
  },
  meetings: {
    list:   () => delay(fixtures.meetings),
    types:  () => { throw new Error('meetings.types requires the real api/ (catalog lives in api/src/skintyee-meeting-types.ts)'); },
    create: () => { throw new Error('meetings.create requires the real api/ (writes a real M365 calendar event via Graph)'); },
    update: () => { throw new Error('meetings.update requires the real api/ (Graph PATCH)'); },
    delete: () => { throw new Error('meetings.delete requires the real api/ (Graph DELETE)'); },
  },
  publicRecords: {
    list: () => delay(fixtures.publicRecords),
  },
  timekeeping: {
    list: () => delay(fixtures.timeEntries),
    payPeriods:    () => { throw new Error('timekeeping.payPeriods requires the real api/'); },
    myTimesheets:  () => { throw new Error('timekeeping.myTimesheets requires the real api/'); },
    saveDraft:     () => { throw new Error('timekeeping.saveDraft requires the real api/ (Postgres-backed)'); },
    submit:        () => { throw new Error('timekeeping.submit requires the real api/'); },
    allTimesheets: () => { throw new Error('timekeeping.allTimesheets requires the real api/'); },
    approve:       () => { throw new Error('timekeeping.approve requires the real api/'); },
    reject:        () => { throw new Error('timekeeping.reject requires the real api/'); },
    reopen:        () => { throw new Error('timekeeping.reopen requires the real api/'); },
    deleteTimesheet: () => delay(undefined as any),
    adminGetTimesheet:  () => { throw new Error('timekeeping.adminGetTimesheet requires the real api/'); },
    adminEditTimesheet: () => { throw new Error('timekeeping.adminEditTimesheet requires the real api/'); },
    eligiblePeople:     () => delay([]),
    meEligible:         () => delay({ eligible: false, upn: '' }),
    adminStartTimesheet: () => { throw new Error('timekeeping.adminStartTimesheet requires the real api/'); },
    reports: {
      list:     () => delay([]),
      generate: () => { throw new Error('timekeeping.reports.generate requires the real api/'); },
      fetchPdf: () => { throw new Error('timekeeping.reports.fetchPdf requires the real api/'); },
      fetchCsv: () => { throw new Error('timekeeping.reports.fetchCsv requires the real api/'); },
    },
  },
  // Expenses — Postgres + storage + Anthropic backed; mock just throws.
  expenses: {
    periods:        () => { throw new Error('expenses.periods requires the real api/'); },
    meEligible:     () => delay({ eligible: false, upn: '' }),
    eligiblePeople: () => delay([]),
    tags:           () => delay([]),
    createTag:      () => { throw new Error('expenses.createTag requires the real api/'); },
    updateTag:      () => { throw new Error('expenses.updateTag requires the real api/'); },
    deleteTag:      () => delay(undefined as any),
    myClaims:       () => { throw new Error('expenses.myClaims requires the real api/'); },
    start:          () => { throw new Error('expenses.start requires the real api/'); },
    updateClaim:    () => { throw new Error('expenses.updateClaim requires the real api/'); },
    submit:         () => { throw new Error('expenses.submit requires the real api/'); },
    allClaims:      () => { throw new Error('expenses.allClaims requires the real api/'); },
    approve:        () => { throw new Error('expenses.approve requires the real api/'); },
    reject:         () => { throw new Error('expenses.reject requires the real api/'); },
    reopen:         () => { throw new Error('expenses.reopen requires the real api/'); },
    adminGetClaim:  () => { throw new Error('expenses.adminGetClaim requires the real api/'); },
    deleteClaim:    () => delay(undefined as any),
    addReceipt:     () => { throw new Error('expenses.addReceipt requires the real api/'); },
    updateItem:     () => { throw new Error('expenses.updateItem requires the real api/'); },
    deleteItem:     () => delay(undefined as any),
    receiptUrl:     () => '',
    fetchReceipt:   () => { throw new Error('expenses.fetchReceipt requires the real api/'); },
    reports: {
      list:        () => delay([]),
      generate:    () => { throw new Error('expenses.reports.generate requires the real api/'); },
      fetchPdf:    () => { throw new Error('expenses.reports.fetchPdf requires the real api/'); },
      fetchCsv:    () => { throw new Error('expenses.reports.fetchCsv requires the real api/'); },
      claimPdfUrl: () => '',
      fetchByUserPdf: () => { throw new Error('expenses.reports.fetchByUserPdf requires the real api/'); },
    },
  },
  polls: {
    list: () => delay(polls),
    get: (id) => delay(polls.find((p) => p._id === id)),
    vote: ({ pollId, optionId }) => {
      polls = polls.map((p) =>
        p._id === pollId
          ? { ...p, options: p.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)) }
          : p
      );
      const updated = polls.find((p) => p._id === pollId)!;
      return delay(updated);
    },
  },
  notifications: {
    list: () => delay(fixtures.notifications),
  },
  transparency: {
    expenditures: () => delay(fixtures.expenditures),
    majorProjects: () => delay(fixtures.majorProjects),
  },
  planner: {
    rollup: () => delay(fixtures.plannerRollup()),
    plans: () => delay(fixtures.plannerPlans),
    tasks: (planId) => delay(fixtures.plannerTasksByPlan[planId] ?? []),
  },
  feed: {
    // Merger of app-events + notifications + Planner due-dates, normalized
    // and role-filtered. Real impl calls /v1/feed; the mock builds the same
    // shape locally so the homescreen can render against either.
    get: ({ role, from, to }) => {
      const items: import('@skintyee/models').FeedItem[] = [];
      // App events (created in the app — community salmon BBQ, powwow, etc.)
      for (const e of fixtures.events) {
        items.push({
          id: `ae-${e._id}`,
          source: 'app-event',
          title: e.title,
          startAt: e.startsAt,
          category: 'Events',
          audience: ['public', 'member', 'staff', 'admin'],
        });
      }
      // Band meetings (created in the app — agendas, schedules, minutes).
      // Members + admins see these; public doesn't (member-only by default).
      for (const m of fixtures.meetings) {
        items.push({
          id: `bm-${m._id}`,
          source: 'app-event',
          title: m.title,
          startAt: m.startsAt,
          category: 'Council',
          audience: ['member', 'staff', 'admin'],
        });
      }
      // Notifications
      for (const n of fixtures.notifications) {
        items.push({
          id: `nt-${n._id}`,
          source: 'notification',
          title: n.title,
          startAt: n.createdAt,
          category: n.category,
          audience: ['public', 'member', 'staff', 'admin'],
        });
      }
      // Planner tasks with due dates (treated as time-bound items)
      for (const t of Object.values(fixtures.plannerTasksByPlan).flat()) {
        if (!t.dueDateTime || t.status === 'Completed') continue;
        const audience: import('@skintyee/models').Role[] =
          (t.categoryLabels?.[0]?.toLowerCase() === 'public')
            ? ['public', 'member', 'staff', 'admin']
            : ['staff', 'admin'];
        items.push({
          id: `pt-${t.id}`,
          source: 'planner-task',
          title: t.title,
          dueAt: t.dueDateTime,
          category: t.categoryLabels?.[0],
          audience,
        });
      }
      // (Teams meetings would come from the api/'s Graph integration when
      // wired live; mock omits them for now.)

      const filtered = items
        .filter((it) => it.audience.includes(role))
        .filter((it) => {
          if (!from && !to) return true;
          const t = it.startAt ?? it.dueAt;
          if (!t) return false;
          if (from && t < from) return false;
          if (to && t > to) return false;
          return true;
        })
        .sort((a, b) => {
          const ta = a.startAt ?? a.dueAt ?? '';
          const tb = b.startAt ?? b.dueAt ?? '';
          return ta.localeCompare(tb);
        });
      return delay(filtered);
    },
  },
  // Documents library — mock returns empty until the real api/ surfaces
  // seeded values. Admin-only screens behind these never render against
  // the mock in practice; included so MockApiService still satisfies
  // ApiService.
  documents: {
    list:   () => delay([]),
    get:    (id: string) => delay({} as any),
    create: () => delay({} as any),
    update: () => delay({} as any),
    delete: () => delay(undefined as any),
    fetchPdf: () => { throw new Error('documents.fetchPdf requires the real api/'); },
  },
  documentTags: {
    list:   () => delay({ categories: [], tags: [] }),
    create: () => delay({} as any),
    update: () => delay({} as any),
    delete: () => delay(undefined as any),
  },
  // Entra devices — served from fixtures so the Assets → Devices screens
  // render realistically against the mock. userCount is derived from the
  // embedded users; `get` returns the full detail (incl. the access list).
  devices: {
    list: () => delay(fixtures.devices.map((d) => ({ ...d, userCount: d.users.length }))),
    get: (id: string) => {
      const d = fixtures.devices.find((x) => x.id === id);
      if (!d) throw new Error(`Unknown device: ${id}`);
      return delay({ ...d, userCount: d.users.length });
    },
  },
  onboarding: {
    // Empty stubs — Onboarding screens render against the live api/
    // when run in dev. Mock satisfies the ApiService contract.
    listFlows:        () => delay([]),
    getFlow:          () => delay({} as any),
    createFlow:       () => delay({} as any),
    updateFlow:       () => delay({} as any),
    deleteFlow:       () => delay(undefined as any),
    addStep:          () => delay({} as any),
    updateStep:       () => delay({} as any),
    deleteStep:       () => delay(undefined as any),
    attachDocument:   () => delay(undefined as any),
    detachDocument:   () => delay(undefined as any),
    addLink:          () => delay(undefined as any),
    removeLink:       () => delay(undefined as any),
    listPeople:  () => delay([]),
    createPerson: () => delay({} as any),
    updatePerson: () => delay({} as any),
    deletePerson: () => delay(undefined as any),
    listAssignments:  () => delay([]),
    myAssignments:    () => delay([]),
    getAssignment:    () => delay({} as any),
    createAssignment: () => delay({} as any),
    rotateToken:      () => delay({ publicToken: '' }),
    approveStep:      () => delay({} as any),
    rejectStep:       () => delay({} as any),
    resetStep:        () => delay({} as any),
    adminUpload:      () => delay({} as any),
    meUpload:         () => delay({} as any),
    publicView:       () => delay({} as any),
    publicUpload:     () => delay({} as any),
  },
};
