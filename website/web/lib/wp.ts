// Tiny typed client for the WordPress REST API (wp/v2). Server-side only —
// every call runs in a React Server Component / build step, so there's no CORS
// and no token. Set WP_API_URL to point at the headless CMS.

const BASE = (process.env.WP_API_URL ?? 'http://localhost:8080') + '/wp-json/wp/v2';
const REVALIDATE = 60; // ISR: re-fetch from WP at most once a minute

export interface WPEntry {
  id: number;
  slug: string;
  date: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
}

async function wpFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`WP REST ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function oneBySlug(type: 'posts' | 'pages', slug: string): Promise<WPEntry | null> {
  const [entry] = await wpFetch<WPEntry[]>(`/${type}?slug=${encodeURIComponent(slug)}`);
  return entry ?? null;
}

export const getPosts = () =>
  wpFetch<WPEntry[]>('/posts?per_page=20&_fields=id,slug,date,title,excerpt');

export const getPostBySlug = (slug: string) => oneBySlug('posts', slug);
export const getPageBySlug = (slug: string) => oneBySlug('pages', slug);

export const getPostSlugs = () => wpFetch<{ slug: string }[]>('/posts?per_page=100&_fields=slug');
export const getPageSlugs = () => wpFetch<{ slug: string }[]>('/pages?per_page=100&_fields=slug');

export const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim();
