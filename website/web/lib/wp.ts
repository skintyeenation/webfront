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

export interface WPCategory {
  id: number;
  slug: string;
  name: string;
}

async function wpFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback; // WP down / not reachable at build → degrade, don't crash
  }
}

async function oneBySlug(type: 'posts' | 'pages', slug: string): Promise<WPEntry | null> {
  const [entry] = await wpFetch<WPEntry[]>(`/${type}?slug=${encodeURIComponent(slug)}`, []);
  return entry ?? null;
}

export const getPosts = () =>
  wpFetch<WPEntry[]>('/posts?per_page=20&_fields=id,slug,date,title,excerpt', []);

export const getPostBySlug = (slug: string) => oneBySlug('posts', slug);
export const getPageBySlug = (slug: string) => oneBySlug('pages', slug);

export const getPostSlugs = () => wpFetch<{ slug: string }[]>('/posts?per_page=100&_fields=slug', []);
export const getPageSlugs = () => wpFetch<{ slug: string }[]>('/pages?per_page=100&_fields=slug', []);

async function categoryBySlug(slug: string): Promise<WPCategory | null> {
  const [cat] = await wpFetch<WPCategory[]>(`/categories?slug=${encodeURIComponent(slug)}&_fields=id,slug,name`, []);
  return cat ?? null;
}

// Posts in a category (by slug) — used for Major Projects, Programs, etc.,
// which are authored as WordPress posts. Empty array if the category/posts
// don't exist yet.
export async function getPostsByCategory(categorySlug: string, limit = 12): Promise<WPEntry[]> {
  const cat = await categoryBySlug(categorySlug);
  if (!cat) return [];
  return wpFetch<WPEntry[]>(
    `/posts?categories=${cat.id}&per_page=${limit}&_fields=id,slug,date,title,excerpt`,
    [],
  );
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Strip tags AND decode HTML entities — WordPress returns texturized content
// (e.g. Witsuwit&#8217;en), and JSX renders entities literally if left encoded.
export const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .trim();
