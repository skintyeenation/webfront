import { ApiService } from 'skintyee/services/api/ApiService';
import * as fixtures from './fixtures';
import { Poll } from 'skintyee/models';

// STUB: an in-memory implementation of ApiService. State lives in module scope and
// resets on reload (no persistence). Network latency is simulated with `delay`.
// Replace this with a real HTTP client when the Azure API exists. See STUBS.md.

const delay = <T>(value: T, ms = 250): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

// Mutable copy so `vote` can mutate poll state during a session.
let polls: Poll[] = JSON.parse(JSON.stringify(fixtures.polls));

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
  },
  admin: {
    securityGroups:   () => { throw new Error('admin.securityGroups requires the real api/'); },
    sharedMailboxes:  () => { throw new Error('admin.sharedMailboxes requires the real api/ (EXO function)'); },
    mailboxAccess:    () => { throw new Error('admin.mailboxAccess requires the real api/ (EXO function)'); },
    setMailboxAccess: () => { throw new Error('admin.setMailboxAccess requires the real api/ (EXO function)'); },
    sync:             () => { throw new Error('admin.sync requires the real api/'); },
  },
  events: {
    list: () => delay(fixtures.events),
    get: (id) => delay(fixtures.events.find((e) => e._id === id)),
  },
  meetings: {
    list: () => delay(fixtures.meetings),
  },
  publicRecords: {
    list: () => delay(fixtures.publicRecords),
  },
  timekeeping: {
    list: () => delay(fixtures.timeEntries),
  },
  financials: {
    list: () => delay(fixtures.financials),
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
      const items: import('skintyee/models').FeedItem[] = [];
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
        const audience: import('skintyee/models').Role[] =
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
};
