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
import {
  ApiService, SecurityGroup, SharedMailbox, MailboxAccess, NotificationSettings, LicenseSku,
  DocumentDto, DocumentTagDto,
  DeviceDto, DeviceDetailDto,
  OnboardingFlowDto, OnboardingStepDto, OnboardingAssignmentDto, OnboardingStepStateDto,
  PersonDto,
} from 'skintyee/services/api/ApiService';

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

  async function put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(api(path), {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }),
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`PUT ${api(path)} → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async function del(path: string): Promise<void> {
    const res = await fetch(api(path), {
      method: 'DELETE',
      headers: headers({ 'Cache-Control': 'no-cache' }),
      cache: 'no-store',
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`DELETE ${api(path)} → ${res.status}: ${await res.text()}`);
    }
  }

  return {
    directory: {
      list: () => get<BandMember[]>('/directory'),
      get: (id: string) => get<BandMember | undefined>(`/directory/${id}`).catch(() => undefined),
      setGroups: (id: string, groups: string[]) => patch<BandMember>(`/directory/${id}/groups`, { groups }),
      setMailboxes: (id: string, mailboxes: string[]) => patch<BandMember>(`/directory/${id}/mailbox-access`, { mailboxes }),
      setLicenses: (id: string, skuIds: string[]) => patch<BandMember>(`/directory/${id}/licenses`, { licenses: skuIds }),
      setBlocked: (id: string, blocked: boolean) => post<BandMember>(`/directory/${id}/block`, { blocked }),
      forcePasswordReset: (id: string) => post<{ ok: boolean; emailed: boolean; emailedTo?: string; ssprUrl: string }>(`/directory/${id}/force-password-reset`, {}),
    },
    admin: {
      securityGroups: () => get<SecurityGroup[]>('/admin/security-groups'),
      licenseCatalog: () => get<LicenseSku[]>('/admin/licenses'),
      sharedMailboxes: () => get<SharedMailbox[]>('/admin/shared-mailboxes'),
      mailboxAccess: (mailboxUpn: string) => get<MailboxAccess>(`/admin/shared-mailboxes/${encodeURIComponent(mailboxUpn)}/access`),
      setMailboxAccess: (mailboxUpn: string, users: string[]) =>
        patch<MailboxAccess>(`/admin/shared-mailboxes/${encodeURIComponent(mailboxUpn)}/access`, { users }),
      sync: () => post<any>('/admin/sync', {}),
      createUser: (input: any) => post<any>('/admin/users', input),
      rotatePassword: (id: string, password?: string) => post<{ password: string }>(`/admin/users/${encodeURIComponent(id)}/rotate-password`, password ? { password } : {}),
      setPersonPassword: (id: string, password?: string) => post<{ password: string }>(`/admin/people/${encodeURIComponent(id)}/set-password`, password ? { password } : {}),
      revokePersonPassword: (id: string) => del(`/admin/people/${encodeURIComponent(id)}/password`),
      getNotificationSettings: () => get<NotificationSettings>('/admin/notification-settings'),
      updateNotificationSettings: (patchBody: Partial<NotificationSettings>) =>
        put<NotificationSettings>('/admin/notification-settings', patchBody),
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
      reopen:  (id: string)                  => post<any>(`/timekeeping/timesheets/${encodeURIComponent(id)}/reopen`, {}),
      deleteTimesheet: async (id: string) => {
        const res = await fetch(api(`/timekeeping/timesheets/${encodeURIComponent(id)}`), {
          method: 'DELETE',
          headers: headers(),
        });
        if (!res.ok && res.status !== 204) throw new Error(`DELETE /timekeeping/timesheets/${id} → ${res.status}: ${await res.text()}`);
      },
      adminGetTimesheet:  (id: string)            => get<any>(`/timekeeping/timesheets/admin/${encodeURIComponent(id)}`),
      adminEditTimesheet: (id: string, body: any) => patch<any>(`/timekeeping/timesheets/admin/${encodeURIComponent(id)}`, body),
      eligiblePeople:     ()                      => get<any[]>('/timekeeping/eligible-people'),
      meEligible:         ()                      => get<any>('/timekeeping/me/eligible'),
      adminStartTimesheet: (input: any)           => post<any>('/timekeeping/timesheets/admin/start', input),
      reports: {
        list: (count?: number) => get<any[]>('/timekeeping/reports', count ? { count: String(count) } : undefined),
        generate: (periodId: string) => post<any>(`/timekeeping/reports/${encodeURIComponent(periodId)}/generate`, {}),
        // Fetch the PDF / CSV bytes through the authenticated HTTP
        // layer (auth headers + bypasses the `mem://` issue when the
        // api/ runs in in-memory storage mode). Caller decides what to
        // do with the Blob (open / save / share).
        fetchPdf: async (periodId: string, opts?: { download?: boolean }) => {
          const path = `/timekeeping/reports/${encodeURIComponent(periodId)}/pdf${opts?.download ? '?download=1' : ''}`;
          const res = await fetch(api(path), { headers: headers() });
          if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
          const blob = await res.blob();
          // Best-effort filename from Content-Disposition.
          const cd = res.headers.get('content-disposition') ?? '';
          const fnMatch = cd.match(/filename="([^"]+)"/);
          return { blob, filename: fnMatch?.[1] ?? `timesheets-${periodId}.pdf` };
        },
        fetchCsv: async (periodId: string) => {
          const path = `/timekeeping/reports/${encodeURIComponent(periodId)}/csv`;
          const res = await fetch(api(path), { headers: headers() });
          if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
          const blob = await res.blob();
          const cd = res.headers.get('content-disposition') ?? '';
          const fnMatch = cd.match(/filename="([^"]+)"/);
          return { blob, filename: fnMatch?.[1] ?? `timesheets-${periodId}.csv` };
        },
      },
    },
    expenses: {
      periods: (count?: number) => get<any>('/expenses/periods', count ? { count: String(count) } : undefined),
      meEligible: () => get<any>('/expenses/me/eligible'),
      eligiblePeople: () => get<any[]>('/expenses/eligible-people'),
      tags: (activeOnly?: boolean) => get<any[]>('/expenses/tags', activeOnly ? { active: '1' } : undefined),
      createTag: (slug: string, label: string, glAccount?: string) => post<any>('/expenses/tags', { slug, label, glAccount }),
      updateTag: (slug: string, p: any) => patch<any>(`/expenses/tags/${encodeURIComponent(slug)}`, p),
      deleteTag: async (slug: string) => {
        const res = await fetch(api(`/expenses/tags/${encodeURIComponent(slug)}`), { method: 'DELETE', headers: headers() });
        if (!res.ok && res.status !== 204) throw new Error(`DELETE /expenses/tags/${slug} → ${res.status}`);
      },
      myClaims: (period?: string) => get<any>('/expenses/claims', period ? { period } : undefined),
      start: (periodId?: string) => post<any>('/expenses/claims/start', periodId ? { periodId } : {}),
      updateClaim: (id: string, p: any) => patch<any>(`/expenses/claims/${encodeURIComponent(id)}`, p),
      submit: (id: string) => post<any>(`/expenses/claims/${encodeURIComponent(id)}/submit`, {}),
      allClaims: (period?: string, status?: string) =>
        get<any[]>('/expenses/claims/all', { ...(period ? { period } : {}), ...(status ? { status } : {}) }),
      approve: (id: string) => post<any>(`/expenses/claims/${encodeURIComponent(id)}/approve`, {}),
      reject: (id: string, reason?: string) => post<any>(`/expenses/claims/${encodeURIComponent(id)}/reject`, { reason }),
      reopen: (id: string) => post<any>(`/expenses/claims/${encodeURIComponent(id)}/reopen`, {}),
      adminGetClaim: (id: string) => get<any>(`/expenses/claims/admin/${encodeURIComponent(id)}`),
      deleteClaim: async (id: string) => {
        const res = await fetch(api(`/expenses/claims/${encodeURIComponent(id)}`), { method: 'DELETE', headers: headers() });
        if (!res.ok && res.status !== 204) throw new Error(`DELETE /expenses/claims/${id} → ${res.status}`);
      },
      addReceipt: async (claimId: string, file: any, fields: any) => {
        const fd = new FormData();
        if (file) {
          if (typeof window !== 'undefined') {
            const blob = await (await fetch(file.uri)).blob();
            fd.append('file', blob, file.name);
          } else {
            fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
          }
        }
        fd.append('payload', JSON.stringify(fields ?? {}));
        const res = await fetch(api(`/expenses/claims/${encodeURIComponent(claimId)}/items`), {
          method: 'POST',
          headers: (() => { const h = headers(); delete (h as any)['Accept']; return h; })(),
          body: fd as any,
        });
        if (!res.ok) throw new Error(`POST /expenses/claims/${claimId}/items → ${res.status}: ${await res.text()}`);
        return res.json();
      },
      updateItem: (id: string, p: any) => patch<any>(`/expenses/items/${encodeURIComponent(id)}`, p),
      deleteItem: async (id: string) => {
        const res = await fetch(api(`/expenses/items/${encodeURIComponent(id)}`), { method: 'DELETE', headers: headers() });
        if (!res.ok && res.status !== 204) throw new Error(`DELETE /expenses/items/${id} → ${res.status}`);
      },
      receiptUrl: (itemId: string) => api(`/expenses/items/${encodeURIComponent(itemId)}/receipt`),
      fetchReceipt: async (itemId: string) => {
        const path = `/expenses/items/${encodeURIComponent(itemId)}/receipt/raw`;
        const res = await fetch(api(path), { headers: headers() });
        if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
        const blob = await res.blob();
        return { blob, mimeType: res.headers.get('content-type') ?? blob.type ?? 'application/octet-stream' };
      },
      reports: {
        list: (count?: number) => get<any[]>('/expenses/reports', count ? { count: String(count) } : undefined),
        generate: (periodId: string) => post<any>(`/expenses/reports/${encodeURIComponent(periodId)}/generate`, {}),
        fetchPdf: async (periodId: string, opts?: { download?: boolean }) => {
          const path = `/expenses/reports/${encodeURIComponent(periodId)}/pdf${opts?.download ? '?download=1' : ''}`;
          const res = await fetch(api(path), { headers: headers() });
          if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
          const blob = await res.blob();
          const cd = res.headers.get('content-disposition') ?? '';
          return { blob, filename: cd.match(/filename="([^"]+)"/)?.[1] ?? `expenses-${periodId}.pdf` };
        },
        fetchCsv: async (periodId: string) => {
          const path = `/expenses/reports/${encodeURIComponent(periodId)}/csv`;
          const res = await fetch(api(path), { headers: headers() });
          if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
          const blob = await res.blob();
          const cd = res.headers.get('content-disposition') ?? '';
          return { blob, filename: cd.match(/filename="([^"]+)"/)?.[1] ?? `expenses-${periodId}.csv` };
        },
        claimPdfUrl: (claimId: string, opts?: { download?: boolean }) => api(`/expenses/claims/${encodeURIComponent(claimId)}/pdf${opts?.download ? '?download=1' : ''}`),
        fetchByUserPdf: async (periodId: string, opts?: { download?: boolean }) => {
          const path = `/expenses/reports/${encodeURIComponent(periodId)}/by-user/pdf${opts?.download ? '?download=1' : ''}`;
          const res = await fetch(api(path), { headers: headers() });
          if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
          const blob = await res.blob();
          const cd = res.headers.get('content-disposition') ?? '';
          return { blob, filename: cd.match(/filename="([^"]+)"/)?.[1] ?? `expenses-by-user-${periodId}.pdf` };
        },
      },
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
      fetchPdf: async (id: string, opts?: { download?: boolean }) => {
        const path = `/documents/${encodeURIComponent(id)}/pdf${opts?.download ? '?download=1' : ''}`;
        const res = await fetch(api(path), { headers: headers() });
        if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
        const blob = await res.blob();
        const cd = res.headers.get('content-disposition') ?? '';
        const fnMatch = cd.match(/filename="([^"]+)"/);
        return { blob, filename: fnMatch?.[1] ?? `document-${id}.pdf` };
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
    devices: {
      list: () => get<DeviceDto[]>('/devices'),
      get: (id: string) => get<DeviceDetailDto>(`/devices/${encodeURIComponent(id)}`),
    },
    onboarding: (() => {
      const uploadFile = async (path: string, file: { uri: string; name: string; mimeType: string }, withHeaders = true) => {
        const fd = new FormData();
        if (typeof window !== 'undefined') {
          const blob = await (await fetch(file.uri)).blob();
          fd.append('file', blob, file.name);
        } else {
          fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
        }
        const res = await fetch(api(path), {
          method: 'POST',
          headers: withHeaders ? (() => { const h = headers(); delete (h as any)['Accept']; return h; })() : { 'x-role': 'public' },
          body: fd as any,
        });
        if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
        return res.json();
      };
      return {
        listFlows: () => get<OnboardingFlowDto[]>('/onboarding/flows'),
        getFlow:   (id: string) => get<OnboardingFlowDto>(`/onboarding/flows/${encodeURIComponent(id)}`),
        createFlow: (input: any) => post<OnboardingFlowDto>('/onboarding/flows', input),
        updateFlow: (id: string, body: any) => patch<OnboardingFlowDto>(`/onboarding/flows/${encodeURIComponent(id)}`, body),
        deleteFlow: async (id: string) => {
          const res = await fetch(api(`/onboarding/flows/${encodeURIComponent(id)}`), { method: 'DELETE', headers: headers() });
          if (!res.ok && res.status !== 204) throw new Error(`DELETE /onboarding/flows/${id} → ${res.status}: ${await res.text()}`);
        },
        addStep:    (flowId: string, input: any) => post<OnboardingStepDto>(`/onboarding/flows/${encodeURIComponent(flowId)}/steps`, input),
        updateStep: (id: string, body: any) => patch<OnboardingStepDto>(`/onboarding/steps/${encodeURIComponent(id)}`, body),
        deleteStep: async (id: string) => {
          const res = await fetch(api(`/onboarding/steps/${encodeURIComponent(id)}`), { method: 'DELETE', headers: headers() });
          if (!res.ok && res.status !== 204) throw new Error(`DELETE /onboarding/steps/${id} → ${res.status}: ${await res.text()}`);
        },
        attachDocument: async (stepId: string, input: any) => { await post<any>(`/onboarding/steps/${encodeURIComponent(stepId)}/documents`, input); },
        detachDocument: async (rowId: string) => {
          const res = await fetch(api(`/onboarding/step-documents/${encodeURIComponent(rowId)}`), { method: 'DELETE', headers: headers() });
          if (!res.ok && res.status !== 204) throw new Error(`DELETE /onboarding/step-documents/${rowId} → ${res.status}: ${await res.text()}`);
        },
        addLink: async (stepId: string, input: any) => { await post<any>(`/onboarding/steps/${encodeURIComponent(stepId)}/links`, input); },
        removeLink: async (rowId: string) => {
          const res = await fetch(api(`/onboarding/step-links/${encodeURIComponent(rowId)}`), { method: 'DELETE', headers: headers() });
          if (!res.ok && res.status !== 204) throw new Error(`DELETE /onboarding/step-links/${rowId} → ${res.status}: ${await res.text()}`);
        },
        listPeople:   () => get<PersonDto[]>('/onboarding/people'),
        createPerson:  (input: any) => post<PersonDto>('/onboarding/people', input),
        updatePerson:  (id: string, body: any) => patch<PersonDto>(`/onboarding/people/${encodeURIComponent(id)}`, body),
        deletePerson: async (id: string) => {
          const res = await fetch(api(`/onboarding/people/${encodeURIComponent(id)}`), { method: 'DELETE', headers: headers() });
          if (!res.ok && res.status !== 204) throw new Error(`DELETE /onboarding/people/${id} → ${res.status}: ${await res.text()}`);
        },
        listAssignments:   (opts?: any) => get<OnboardingAssignmentDto[]>('/onboarding/assignments', opts ? { flowId: opts.flowId, personId: opts.personId } : undefined),
        myAssignments:     () => get<OnboardingAssignmentDto[]>('/onboarding/my-assignments'),
        getAssignment:     (id: string) => get<OnboardingAssignmentDto>(`/onboarding/assignments/${encodeURIComponent(id)}`),
        createAssignment:  (input: any) => post<OnboardingAssignmentDto>('/onboarding/assignments', input),
        rotateToken:       (id: string) => post<{ publicToken: string }>(`/onboarding/assignments/${encodeURIComponent(id)}/rotate-token`, {}),
        approveStep:       (assignmentId: string, stepId: string, notes?: string) =>
          post<OnboardingStepStateDto>(`/onboarding/assignments/${encodeURIComponent(assignmentId)}/steps/${encodeURIComponent(stepId)}/complete`, { notes }),
        rejectStep:        (assignmentId: string, stepId: string, notes?: string) =>
          post<OnboardingStepStateDto>(`/onboarding/assignments/${encodeURIComponent(assignmentId)}/steps/${encodeURIComponent(stepId)}/reject`, { notes }),
        resetStep:         (assignmentId: string, stepId: string) =>
          post<OnboardingStepStateDto>(`/onboarding/assignments/${encodeURIComponent(assignmentId)}/steps/${encodeURIComponent(stepId)}/reset`, {}),
        adminUpload: (assignmentId: string, stepId: string, file: any) =>
          uploadFile(`/onboarding/assignments/${encodeURIComponent(assignmentId)}/steps/${encodeURIComponent(stepId)}/upload`, file),
        meUpload: (assignmentId: string, stepId: string, file: any) =>
          uploadFile(`/onboarding/assignments/${encodeURIComponent(assignmentId)}/steps/${encodeURIComponent(stepId)}/me-upload`, file),
        publicView: (token: string) => get<OnboardingAssignmentDto>(`/onboarding/public/${encodeURIComponent(token)}`),
        publicUpload: (token: string, stepId: string, file: any) =>
          uploadFile(`/onboarding/public/${encodeURIComponent(token)}/steps/${encodeURIComponent(stepId)}/upload`, file, false),
      };
    })(),
  };
}

export { buildHttpApiService };
