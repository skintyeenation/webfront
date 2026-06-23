import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffAuthService } from './staff-auth.service';

export type Role = 'public' | 'member' | 'staff' | 'admin';

export const ROLES_KEY = 'roles';
// Decorate a handler with the roles allowed to call it.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Role guard. Two sources for the caller's role, checked in order:
 *
 *   1. `Authorization: Bearer <jwt>` — the staff-auth path
 *      (docs/features/staff-auth.md). JWT validated by StaffAuthService;
 *      payload's role lands as the caller role and the Person id is
 *      attached to req.staffPersonId for audit / row-ownership checks.
 *      Invalid / expired tokens fall through to (2); a malformed token
 *      doesn't get to spoof a role.
 *
 *   2. `x-role` header — the POC stand-in for Entra ID + role-derivation
 *      that the Entra sign-in path uses today. Defaults to `public`.
 *      Will be retired (along with the Entra side moving to JWT) when
 *      ADR-7's full token validation lands.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private staffAuth: StaffAuthService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<Role[]>(ROLES_KEY, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest();

    // (1) Bearer JWT wins when present + valid.
    const auth = req.headers['authorization'] as string | undefined;
    if (auth && /^Bearer\s+/i.test(auth)) {
      const token = auth.replace(/^Bearer\s+/i, '').trim();
      const payload = this.staffAuth.verifyToken(token);
      if (payload) {
        req.staffPersonId = payload.sub;
        req.callerRole    = payload.role;
      }
      // If the token was malformed/expired, payload is null and we fall
      // through to x-role — but the JWT wasn't allowed to set a role
      // higher than what x-role provides. The token spoofing surface
      // is therefore zero (you can't gain access without a valid
      // signature).
    }

    if (!required || required.length === 0) return true; // public route
    const role: Role = (req.callerRole as Role) || (req.headers['x-role'] as Role) || 'public';
    if (!required.includes(role)) {
      throw new ForbiddenException(`Requires role: ${required.join(' / ')}`);
    }
    return true;
  }
}

// Read the caller's role (for filtering responses, e.g. staff see own
// timesheets). Prefers the JWT-derived role attached by the guard;
// falls back to the x-role header for the legacy Entra-stub path.
export const callerRole = (req: any): Role =>
  (req.callerRole as Role) || (req.headers['x-role'] as Role) || 'public';

// Per-document audience values. Matches the `audience` column on Document
// and is used by the documents + onboarding features for read gating.
// `finance` is a lateral, group-scoped tier (NOT on the public<…<admin
// ladder): only admins and members of a configured finance group see it.
export type DocumentAudience = 'admin' | 'staff' | 'band_member' | 'public' | 'finance';

// Optional context for finance-scoped visibility. Both fields default safely:
// without ctx, only admins can see `finance` docs — so existing callers that
// don't pass it (e.g. onboarding) never leak finance docs to plain staff.
export interface DocAudienceCtx {
  groups?: string[];        // the caller's Entra security-group slugs (bandGroups)
  financeGroups?: string[]; // group slugs configured to grant finance-doc access (default ['finance'])
}

function seesFinance(role: Role, ctx?: DocAudienceCtx): boolean {
  if (role === 'admin') return true;
  const finance = ctx?.financeGroups ?? ['finance'];
  return (ctx?.groups ?? []).some((g) => finance.includes(g));
}

// Whether the caller's role is allowed to see a document tagged with
// `audience`. The public>member>staff>admin ladder grants everything
// at-or-below the caller's tier; `finance` is handled separately as a
// group scope (admin OR a configured finance group).
export function canSeeAudience(role: Role, audience: DocumentAudience, ctx?: DocAudienceCtx): boolean {
  if (audience === 'finance') return seesFinance(role, ctx);
  const rank: Record<Role, number> = { public: 0, member: 1, staff: 2, admin: 3 };
  // `finance` carries a sentinel rank but is never read (handled above).
  const audRank: Record<DocumentAudience, number> = {
    public: 0,
    band_member: 1,
    staff: 2,
    admin: 3,
    finance: 3,
  };
  return rank[role] >= audRank[audience];
}

// SQL "IN" clause helper for filtering documents by what the caller can
// see — used inside Prisma `where: { audience: { in: ... } }` predicates.
export function audiencesVisibleTo(role: Role, ctx?: DocAudienceCtx): DocumentAudience[] {
  const base: DocumentAudience[] =
    role === 'admin' ? ['admin', 'staff', 'band_member', 'public']
    : role === 'staff' ? ['staff', 'band_member', 'public']
    : role === 'member' ? ['band_member', 'public']
    : ['public'];
  if (seesFinance(role, ctx)) base.push('finance');
  return base;
}
