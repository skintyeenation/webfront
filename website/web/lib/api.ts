import { buildHttpApiService } from '@skintyee/api-client';

// The website reads the SAME api/ server as the app, but always as the
// anonymous `public` role — the api/ filters to public-visible data
// (see api/src/public-view.ts). Server-side only.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export const publicApi = buildHttpApiService(API_URL, {
  getRole: () => 'public',
});

type Role = 'public' | 'member' | 'staff' | 'admin';

// An api service acting AS a signed-in user — sends x-role + x-upn so role-gated reads
// (e.g. onboarding) resolve to the caller. Server-side only. Role comes from resolveRole().
export function userApi(role: Role, upn: string) {
  return buildHttpApiService(API_URL, {
    getRole: () => role,
    getUpn: () => upn,
  });
}

// Resolve a UPN's effective app-role from the api/ (GET /v1/admin/role-for/:upn). Open endpoint
// used at sign-in to derive the role; degrades to 'public' if the api is unreachable.
export async function resolveRole(upn: string): Promise<Role> {
  return safe(
    fetch(`${API_URL}/v1/admin/role-for/${encodeURIComponent(upn)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { appRole: 'public' }))
      .then((d) => (d?.appRole ?? 'public') as Role),
    'public',
  );
}

// Never let one upstream hiccup blank the whole page — degrade to a fallback.
export async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}
