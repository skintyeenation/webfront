// Shared appRole derivation. Both the directory seed
// (GraphFeedService.getDirectory) and the new Add Member endpoint
// (POST /v1/admin/users) compute appRole through this single switch
// so a freshly-created user lands with the same role they'd get on
// the next re-seed.
//
// Documented in docs/365/app-roles.md — first hit wins.

export type AppRole = 'public' | 'member' | 'staff' | 'admin';

export interface RoleDerivationInput {
  isBreakGlass?: boolean;
  // Slugs from api/src/skintyee-groups.ts the user belongs to.
  bandGroupSlugs: string[];
  // Free-form job title from Entra (may be empty).
  jobTitle?: string;
}

/**
 * Compute the canonical appRole for a user. First match wins:
 *   1. Break-glass account → admin.
 *   2. Entra security-group membership:
 *        admins / system-admin / chief / council  → admin
 *        management / it / band-manager / finance → staff
 *   3. Job-title heuristic:
 *        chief/council in title OR
 *        director|manager|admin (regex) → admin
 *        any other non-empty title       → staff
 *   4. No title and no matching group → member.
 *
 * Note: the additional People-based "timesheetsEnabled bumps to staff"
 * layer documented in docs/365/app-roles.md happens INSIDE the
 * role-for endpoint at request time, NOT here — this helper produces
 * the stage-1 baseline that gets persisted to BandMember.appRole.
 */
export function deriveAppRole(input: RoleDerivationInput): AppRole {
  if (input.isBreakGlass) return 'admin';

  const groups = new Set(input.bandGroupSlugs.map((s) => s.toLowerCase()));
  const inGroup = (slug: string) => groups.has(slug);

  if (inGroup('admins') || inGroup('system-admin')) return 'admin';
  if (inGroup('chief')  || inGroup('council'))      return 'admin';
  if (inGroup('management') || inGroup('it') || inGroup('band-manager') || inGroup('finance')) {
    return 'staff';
  }

  const title = (input.jobTitle ?? '').trim();
  if (!title) return 'member';
  if (/chief|council/i.test(title)) return 'admin';
  if (/director|manager|admin/i.test(title)) return 'admin';
  return 'staff';
}
