// Public (anonymous, x-role: public) visibility rules — what the skintyee.ca
// website may show to anyone signed-out. Keeps internal/sensitive data from
// leaking through the shared ApiService. See website/docs/plan.md §4.

// Meeting types an anonymous visitor may see. Never staff-meeting,
// council-meeting, or closed-session.
export const PUBLIC_MEETING_TYPES = ['public-event', 'band-meeting'];

// Notification categories visible to anonymous visitors — the community-facing
// slice of the skintyee.ca WordPress taxonomy. 'Council' (internal governance)
// is gated to signed-in callers. Adjust this allowlist to change the policy.
export const PUBLIC_NOTIFICATION_CATEGORIES = [
  'Health', 'Safety', 'Events', 'Programs', 'News', 'Announcements',
];

// Entra SECURITY-group slugs (skintyee-groups.ts, kind: 'entra') that put a
// member on the public governance/management roster. NOTE: the BandMember.role
// field is just the app tier (Member/Staff) — governance is encoded in
// bandGroups. The '-m365' variants are mailing lists, NOT roster designators.
// Ordered by precedence — first match wins for the displayed role label.
const ROSTER_GROUPS: Array<{ slug: string; label: string }> = [
  { slug: 'chief',         label: 'Chief' },
  { slug: 'band-manager',  label: 'Band Manager' },
  { slug: 'council',       label: 'Council' },
  { slug: 'council-m365',  label: 'Council' },
  { slug: 'management',    label: 'Management' },
  { slug: 'management-m365', label: 'Management' },
  { slug: 'staff',         label: 'Staff' },
];

// bandGroups may arrive as an array (mapped) or a CSV string (raw row).
function groupsOf(m: any): string[] {
  if (Array.isArray(m?.bandGroups)) return m.bandGroups;
  if (typeof m?.bandGroups === 'string') return m.bandGroups.split(',').filter(Boolean);
  return [];
}

// The governance role to display, derived from the security groups (falls back
// to the model role for mock data that uses role: 'Chief'/'Council').
function rosterRole(m: any): string | undefined {
  const g = groupsOf(m);
  for (const { slug, label } of ROSTER_GROUPS) if (g.includes(slug)) return label;
  if (m?.role === 'Chief' || m?.role === 'Council') return m.role;
  return undefined;
}

// On the public governance/management roster if a governance role applies and
// the account isn't disabled.
export function isPublicRoster(m: any): boolean {
  if (m?.enabled === false) return false;
  return rosterRole(m) !== undefined;
}

// Curated public projection — name/governance-role/title/department/photo only.
// Drops email, phone, upn, mailboxes, bandGroups, licences, manager, app tier,
// and all Entra internals.
export function toPublicBandMember(m: any) {
  return {
    _id: m._id ?? m.id,
    name: m.name,
    role: rosterRole(m),            // Chief / Council / Band Manager / Management
    title: m.title ?? undefined,
    department: m.department ?? undefined,
    avatarLetter: m.avatarLetter ?? undefined,
    hasPhoto: m.hasPhoto ?? false,
  };
}

// Filter + project a directory to the public governance/management roster,
// ordered by governance precedence (Chief → Council → Band Manager → Management).
export function publicRoster(members: any[]) {
  const rank = (m: any) => {
    const r = rosterRole(m);
    const i = ROSTER_GROUPS.findIndex((g) => g.label === r);
    return i === -1 ? ROSTER_GROUPS.length : i;
  };
  return (members ?? [])
    .filter(isPublicRoster)
    .sort((a, b) => rank(a) - rank(b))
    .map(toPublicBandMember);
}
