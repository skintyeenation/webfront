import { buildHttpApiService } from '@skintyee/api-client';

// The website reads the SAME api/ server as the app, but always as the
// anonymous `public` role — the api/ filters to public-visible data
// (see api/src/public-view.ts). Server-side only.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export const publicApi = buildHttpApiService(API_URL, {
  getRole: () => 'public',
});

// Never let one upstream hiccup blank the whole page — degrade to a fallback.
export async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}
