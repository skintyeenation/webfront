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
  },
};
