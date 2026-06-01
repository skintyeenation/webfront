/**
 * HttpApiService — the real implementation of ApiService that hits the
 * NestJS api/ at https://api.skintyee.ca/v1/* (or whatever
 * EXPO_PUBLIC_API_SERVER is wired to at build time).
 *
 * Mirrors the MockApiService shape exactly, so swapping between them is
 * a one-line change in store/apis.ts based on Config.apiServer.
 *
 * Auth (today): a dev role header `x-role` (admin/staff/member/public)
 * matches the api/'s RolesGuard. When app-side Entra ID is wired
 * (Phase 2), this becomes a Bearer token from the signed-in user's
 * delegated token.
 *
 * Per ADR-7 + docs/features/planner-dashboard.md.
 */

import {
  AppNotification, BandMember, BandMeeting, CommunityEvent,
  Expenditure, FeedItem, FinancialRecord, MajorProject,
  PlannerPlanSummary, PlannerRollup, PlannerTask, Poll,
  PublicRecord, Role, TimeEntry,
} from 'skintyee/models';
import { ApiService } from 'skintyee/services/api/ApiService';

// In a real auth-wired build, this would come from the auth store /
// Entra-issued JWT. For Phase 1 we read the current role out of the
// Redux store via a deferred getter so HttpApiService doesn't have to
// be reconstructed on every role switch.
type RoleGetter = () => Role;

function buildHttpApiService(baseUrl: string, getRole: RoleGetter): ApiService {
  const trimmed = baseUrl.replace(/\/+$/, '');
  const api = (path: string): string => `${trimmed}/v1${path}`;

  async function get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(api(path));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'x-role': getRole(),
      },
    });
    if (!res.ok) {
      throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(api(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-role': getRole(),
      },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new Error(`POST ${api(path)} → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    directory: {
      list: () => get<BandMember[]>('/directory'),
      get: (id: string) => get<BandMember | undefined>(`/directory/${id}`).catch(() => undefined),
    },
    events: {
      list: () => get<CommunityEvent[]>('/events'),
      get: (id: string) => get<CommunityEvent | undefined>(`/events/${id}`).catch(() => undefined),
    },
    meetings: {
      list: () => get<BandMeeting[]>('/meetings'),
    },
    publicRecords: {
      // The /v1/transparency/* endpoints are what serve "public records" in
      // the api/; the old PublicRecord shape is being retired.
      list: () => get<PublicRecord[]>('/transparency/public-records').catch(() => []),
    },
    transparency: {
      expenditures: () => get<Expenditure[]>('/transparency/expenditures'),
      majorProjects: () => get<MajorProject[]>('/transparency/major-projects'),
    },
    timekeeping: {
      list: () => get<TimeEntry[]>('/timekeeping/entries'),
    },
    financials: {
      list: () => get<FinancialRecord[]>('/financials'),
    },
    polls: {
      list: () => get<Poll[]>('/polls'),
      get: (id: string) => get<Poll | undefined>(`/polls/${id}`).catch(() => undefined),
      vote: ({ pollId, optionId }) => post<Poll>(`/polls/${pollId}/vote`, { optionId }),
    },
    notifications: {
      list: () => get<AppNotification[]>('/notifications'),
    },
    planner: {
      rollup: () => get<PlannerRollup>('/planner/rollup'),
      plans:  () => get<PlannerPlanSummary[]>('/planner/plans'),
      tasks:  (planId: string) => get<PlannerTask[]>(`/planner/plans/${planId}/tasks`),
    },
    feed: {
      get: ({ role, from, to }) => get<FeedItem[]>('/feed', { from, to, _role: role }),
      //                                                       ^^^^^^ noop; role is sent
      //                                                       via x-role header. Kept on
      //                                                       the object for parity with
      //                                                       the mock signature.
    },
  };
}

export { buildHttpApiService };
