export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function timestampSlug(d: Date = new Date()): string {
  // 2026-05-23T18-42-11Z — filename-safe ISO.
  return d.toISOString().replace(/:/g, '-').replace(/\..+/, 'Z');
}
