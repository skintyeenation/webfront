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
import { ApiService, SecurityGroup, SharedMailbox, MailboxAccess } from 'skintyee/services/api/ApiService';

// The auth header context — pulled lazily so the same HttpApiService
// instance survives sign-in / sign-out / role switches without rebuild.
//
//   getRole()        → 'public' | 'member' | 'staff' | 'admin' (always present)
//   getAccessToken() → Microsoft Entra access token if signed in (otherwise null)
//   getUpn()         → signed-in user's UPN if signed in (otherwise null) —
//                      lets the api/ fetch Teams meetings + personalized
//                      Planner views for this specific user
type AuthCtxGetters = {
  getRole: () => Role;
  getAccessToken?: () => string | null;
  getUpn?: () => string | null;
};

function buildHttpApiService(baseUrl: string, ctx: AuthCtxGetters): ApiService {
  const trimmed = baseUrl.replace(/\/+$/, '');
  const api = (path: string): string => `${trimmed}/v1${path}`;

  function headers(extra?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {
      Accept: 'application/json',
      'x-role': ctx.getRole(),
      ...(extra ?? {}),
    };
    const token = ctx.getAccessToken?.();
    if (token) out['Authorization'] = `Bearer ${token}`;
    const upn = ctx.getUpn?.();
    if (upn) out['x-upn'] = upn;
    return out;
  }

  async function get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(api(path));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      headers: headers({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' }),
      // cache: 'no-store' — bypass the browser HTTP cache entirely. NestJS
      // sends ETags by default, so without this the browser caches the
      // first response + uses 304 cached-body forever (saw stale empty
      // directory after the table got seeded mid-session).
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(api(path), {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }),
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`POST ${api(path)} → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async function patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(api(path), {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }),
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`PATCH ${api(path)} → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    directory: {
      list: () => get<BandMember[]>('/directory'),
      get: (id: string) => get<BandMember | undefined>(`/directory/${id}`).catch(() => undefined),
      setGroups: (id: string, groups: string[]) => patch<BandMember>(`/directory/${id}/groups`, { groups }),
      setMailboxes: (id: string, mailboxes: string[]) => patch<BandMember>(`/directory/${id}/mailbox-access`, { mailboxes }),
    },
    admin: {
      securityGroups: () => get<SecurityGroup[]>('/admin/security-groups'),
      sharedMailboxes: () => get<SharedMailbox[]>('/admin/shared-mailboxes'),
      mailboxAccess: (mailboxUpn: string) => get<MailboxAccess>(`/admin/shared-mailboxes/${encodeURIComponent(mailboxUpn)}/access`),
      setMailboxAccess: (mailboxUpn: string, users: string[]) =>
        patch<MailboxAccess>(`/admin/shared-mailboxes/${encodeURIComponent(mailboxUpn)}/access`, { users }),
      sync: () => post<any>('/admin/sync', {}),
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
