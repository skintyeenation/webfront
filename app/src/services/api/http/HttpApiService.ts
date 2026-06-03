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
  Expenditure, FeedItem, MajorProject,
  PlannerPlanSummary, PlannerRollup, PlannerTask, Poll,
  PublicRecord, Role, TimeEntry,
} from 'skintyee/models';
import { ApiService, SecurityGroup, SharedMailbox, MailboxAccess, DocumentDto, DocumentTagDto } from 'skintyee/services/api/ApiService';

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
      types: () => get<any>('/meetings/types'),
      create: (input: any) => post<any>('/meetings', input),
      update: (id: string, input: any) => patch<any>(`/meetings/${id}`, input),
      delete: async (id: string, sourceIndex: number) => {
        const res = await fetch(api(`/meetings/${id}?sourceIndex=${sourceIndex}`), {
          method: 'DELETE',
          headers: headers({ 'Cache-Control': 'no-cache' }),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`DELETE /meetings/${id} → ${res.status}: ${await res.text()}`);
      },
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
      payPeriods: (count?: number) => get<any>('/timekeeping/pay-periods', count ? { count: String(count) } : undefined),
      myTimesheets: (period?: string) => get<any>('/timekeeping/timesheets', period ? { period } : undefined),
      saveDraft: (periodId: string, body: any) => patch<any>(`/timekeeping/timesheets/${encodeURIComponent(periodId)}/draft`, body),
      submit:    (periodId: string, body: any) => post<any>(`/timekeeping/timesheets/${encodeURIComponent(periodId)}`, body),
      allTimesheets: (period?: string, status?: string) =>
        get<any>('/timekeeping/timesheets/all', {
          ...(period ? { period } : {}),
          ...(status ? { status } : {}),
        }),
      approve: (id: string)                  => post<any>(`/timekeeping/timesheets/${encodeURIComponent(id)}/approve`, {}),
      reject:  (id: string, reason?: string) => post<any>(`/timekeeping/timesheets/${encodeURIComponent(id)}/reject`,  { reason }),
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
    documents: {
      list: (opts?: { tag?: string; search?: string }) =>
        get<DocumentDto[]>('/documents', { tag: opts?.tag, search: opts?.search }),
      get: (id: string) => get<DocumentDto>(`/documents/${encodeURIComponent(id)}`),
      // Multipart POST — file (optional) goes as a `file` part; the
      // metadata (title / description / audience / tagIds / linkUrl
      // / companyId) goes as a JSON-encoded `payload` part. The api/'s
      // FileInterceptor + Body parser pull them apart.
      create: async (input: any) => {
        const fd = new FormData();
        if (input.file) {
          // Expo DocumentPicker hands us { uri, name, mimeType } — on web
          // we fetch the blob; on native it's the file URI directly.
          if (typeof window !== 'undefined' && input.file.uri.startsWith('data:')) {
            const blob = await (await fetch(input.file.uri)).blob();
            fd.append('file', blob, input.file.name);
          } else if (typeof window !== 'undefined') {
            const blob = await (await fetch(input.file.uri)).blob();
            fd.append('file', blob, input.file.name);
          } else {
            // React Native FormData accepts the {uri,name,type} shim.
            fd.append('file', { uri: input.file.uri, name: input.file.name, type: input.file.mimeType } as any);
          }
        }
        const { file: _file, ...payload } = input;
        fd.append('payload', JSON.stringify(payload));
        const res = await fetch(api('/documents'), {
          method: 'POST',
          // Don't set Content-Type — the browser / RN sets the multipart
          // boundary for us. We still want x-role / x-upn / Bearer though.
          headers: (() => { const h = headers(); delete (h as any)['Accept']; return h; })(),
          body: fd as any,
        });
        if (!res.ok) throw new Error(`POST /documents → ${res.status}: ${await res.text()}`);
        return res.json();
      },
      update: (id: string, body: any) => patch<DocumentDto>(`/documents/${encodeURIComponent(id)}`, body),
      delete: async (id: string) => {
        const res = await fetch(api(`/documents/${encodeURIComponent(id)}`), {
          method: 'DELETE',
          headers: headers(),
        });
        if (!res.ok && res.status !== 204) throw new Error(`DELETE /documents/${id} → ${res.status}: ${await res.text()}`);
      },
    },
    documentTags: {
      list: () => get<any>('/document-tags'),
      create: (input: any) => post<DocumentTagDto>('/document-tags', input),
      update: (id: string, body: any) => patch<DocumentTagDto>(`/document-tags/${encodeURIComponent(id)}`, body),
      delete: async (id: string) => {
        const res = await fetch(api(`/document-tags/${encodeURIComponent(id)}`), {
          method: 'DELETE',
          headers: headers(),
        });
        if (!res.ok) throw new Error(`DELETE /document-tags/${id} → ${res.status}: ${await res.text()}`);
      },
    },
  };
}

export { buildHttpApiService };
