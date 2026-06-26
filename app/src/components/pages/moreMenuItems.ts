import { Role } from 'skintyee/models';

// Shared definitions for the overflow ("More" / "Admin") destinations. Used by
// both the MoreMenu page and the desktop left-rail (when expanded, the rail
// renders these as labelled subsections). Single source of truth so the two
// surfaces never drift.

export interface MoreItem {
  route: string;
  label: string;
  description: string;
  icon: string;
  roles: Role[];
  root?: boolean; // navigate on the root navigator (e.g. the Account modal)
}

// Account & Role — sits at the top of the More page for every role
// (above Admin tools). Single item: "My Account" → the Account modal.
export const ACCOUNT_ITEMS: MoreItem[] = [
  { route: 'Account', label: 'My Account', description: 'Profile, sign-in, and role', icon: 'account-circle', roles: ['public', 'member', 'staff', 'admin'], root: true },
];

// Admin-only tools — grouped under the Admin tab for admins.
// Order: Time Keeping → Band Management → Staff Management → Onboarding
// → Documents. Onboarding sits right above Documents because the two
// are paired (flows pull from the document library).
export const ADMIN_ITEMS: MoreItem[] = [
  { route: 'timekeeping',      label: 'Time Keeping',      description: 'Worker hours & approvals',                                 icon: 'clock-outline',            roles: ['admin'] },
  { route: 'expenses',         label: 'Expenses',          description: 'Receipt claims & finance approvals',                       icon: 'receipt',                  roles: ['admin'] },
  { route: 'directory',        label: 'Band Management',   description: 'Members, council & staff — add, remove, manage groups',   icon: 'account-group',            roles: ['admin'] },
  { route: 'onboardingPeople', label: 'Staff Management',  description: 'People on file — band members + external contractors',    icon: 'account-supervisor',       roles: ['admin'] },
  { route: 'onboardingFlows',  label: 'Onboarding',        description: 'Design onboarding flows & track progress for new people', icon: 'clipboard-check-multiple', roles: ['admin'] },
  { route: 'documents',        label: 'Documents',         description: 'Forms, filings & PDFs by tag',                             icon: 'file-document-multiple',   roles: ['admin'] },
];

// "System" — admin inventory of band-owned assets/infrastructure. First
// tile: Devices (Entra-registered devices + who can access them). Sits in
// its own section right below Admin tools so future system entries
// (equipment, licenses) can slot in here.
export const SYSTEM_ITEMS: MoreItem[] = [
  { route: 'devices', label: 'Devices', description: 'Entra devices & who can access them', icon: 'devices', roles: ['admin'] },
  { route: 'configureNotifications', label: 'Configure Notifications', description: 'Enable/disable system emails & set sender', icon: 'email-edit-outline', roles: ['admin'] },
];

// "Tools" — non-admin everyday operational tiles. Mirrors the admin
// items 1:1 by route so a staff member's menu structure feels like a
// subset of the admin's. Items here render in the Tools section above
// the Community section so the bottom of the page consistently holds
// community-browsing surfaces (Polls, Financial Summary).
export const TOOLS_ITEMS: MoreItem[] = [
  // Mirrors admin's "Time Keeping" entry.
  { route: 'timekeeping',    label: 'My Timesheets',         description: 'Submit & view your hours',                                 icon: 'clock-outline',           roles: ['staff'] },
  // Mirrors admin's "Expenses" entry — finance-group staff also reach
  // the approval queue here (the Expenses screen gates on bandGroups).
  { route: 'expenses',       label: 'My Expenses',           description: 'Submit receipts & expense claims',                         icon: 'receipt',                 roles: ['staff'] },
  // Mirrors admin's "Band Management" entry — non-admins see it as
  // the read-only "Band Member Directory".
  { route: 'directory',      label: 'Band Member Directory', description: 'Members, council & staff',                                 icon: 'account-group',           roles: ['public', 'member', 'staff'] },
  // Mirrors admin's "Documents" entry — staff-visible read view.
  { route: 'documents',      label: 'Forms & Documents',     description: 'Forms, filings & PDFs by category',                        icon: 'file-document-outline',   roles: ['member', 'staff'] },
];

// "My Onboarding" — its own pinned section above Tools so workers
// can see they have outstanding onboarding to complete. Only renders
// when /v1/onboarding/my-assignments returns at least one open
// (non-completed) assignment.
export const ONBOARDING_ITEMS: MoreItem[] = [
  { route: 'myOnboarding', label: 'My Onboarding', description: 'Complete your onboarding steps', icon: 'clipboard-check-outline', roles: ['member', 'staff', 'admin'] },
];

// "Community" — bottom grouping on every role's view. Both admins and
// staff/members see Polls here; Financial Summary is public + member
// only (staff don't see it, admin reaches it via Admin tools if needed
// — but the admin view ALSO shows the community section so they get
// Polls there).
export const COMMUNITY_ITEMS: MoreItem[] = [
  { route: 'polls',         label: 'Polling + Surveys',     description: 'Surveys & vote on issues',                                 icon: 'vote-outline',          roles: ['public', 'member', 'staff', 'admin'] },
  { route: 'publicRecords', label: 'Financial Summary',     description: 'Where the money goes — budgets, expenditures & projects', icon: 'chart-pie',             roles: ['public', 'member'] },
];

export interface MoreSection {
  title?: string;
  items: MoreItem[];
}

/**
 * The ordered overflow sections for a role (role-filtered, empty sections
 * dropped). Mirrors the MoreMenu page order: Admin tools + System for admins,
 * Tools otherwise, then Community. The conditional "My Onboarding" section is
 * intentionally NOT included (the caller decides based on open assignments).
 *
 * @param opts.includeAccount include the "Account & Role" section (default
 *   true). The left-rail passes false — the account is already reachable via
 *   the header avatar there.
 */
export function moreSectionsFor(role: Role, opts?: { includeAccount?: boolean }): MoreSection[] {
  const isAdmin = role === 'admin';
  const sections: MoreSection[] = [];
  if (opts?.includeAccount !== false) sections.push({ title: 'Account & Role', items: ACCOUNT_ITEMS });
  if (isAdmin) {
    sections.push({ title: 'Admin tools', items: ADMIN_ITEMS });
    sections.push({ title: 'System', items: SYSTEM_ITEMS });
  } else {
    sections.push({ title: 'Tools', items: TOOLS_ITEMS });
  }
  sections.push({ title: 'Community', items: COMMUNITY_ITEMS });
  return sections
    .map((s) => ({ ...s, items: s.items.filter((it) => it.roles.includes(role)) }))
    .filter((s) => s.items.length > 0);
}
