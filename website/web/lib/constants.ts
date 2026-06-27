// Band program areas (Programs nav). These mirror the transparency expenditure
// `area` values + the app's program areas. Each links to a WP page for detail.
// Program categories — the Programs master page lists these; each has a
// sub-page at /programs/<slug> (content authored as a WP page by slug).
export const PROGRAM_AREAS = [
  { slug: 'housing', name: 'Housing', desc: 'On-reserve housing, repairs, and applications.' },
  { slug: 'education', name: 'Education', desc: 'K–12 support and post-secondary sponsorship.' },
  { slug: 'lands-economic-development', name: 'Lands & Economic Development', desc: 'Land and resource stewardship, business and employment.' },
  { slug: 'social', name: 'Social Development', desc: 'Income assistance and family support.' },
  { slug: 'child-family-services', name: 'Child & Family Services', desc: 'Family and child wellbeing.' },
  { slug: 'health', name: 'Health', desc: 'Community health and wellness programs.' },
];

// Major Project sectors (same categories as the home Major Projects band). The
// Projects page lists every sector with its projects (WP category by slug).
export const MAJOR_PROJECT_SECTORS = [
  { slug: 'oil-gas', name: 'Oil & Gas' },
  { slug: 'minerals-mining', name: 'Minerals & Mining' },
  { slug: 'housing-economic-development', name: 'Housing & Economic Development' },
  { slug: 'forestry-conservation', name: 'Forestry & Conservation' },
  { slug: 'telecommunications', name: 'Telecommunications' },
];

// Notification category → accent colour (matches the app palette where possible).
export const NOTIFICATION_COLORS: Record<string, string> = {
  Health: '#E53935',
  Safety: '#EC6A37',
  Council: '#7E57C2',
  Events: '#00B8EC',
  Programs: '#9ECD3B',
  News: '#5C6BC0',
  Announcements: '#90A4AE',
};

export const CAD = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

// "Rights & Title" resource links — rendered site-wide (footer) and reusable as
// a section/CTA. URLs are best-effort official sources; verify/adjust as needed.
export const RESOURCE_LINKS = [
  { label: 'Aboriginal Rights & Title', url: 'https://www2.gov.bc.ca/gov/content/governments/indigenous-people' },
  { label: 'DRIPA — BC Declaration Act', url: 'https://www.declaration.gov.bc.ca/' },
  { label: 'UNDRIP', url: 'https://www.un.org/development/desa/indigenouspeoples/declaration-on-the-rights-of-indigenous-peoples.html' },
  { label: 'TRC: Calls to Action', url: 'https://nctr.ca/about/history/calls-to-action/' },
  { label: 'Regional District of Fraser-Fort George', url: 'https://www.rdffg.bc.ca/' },
];
