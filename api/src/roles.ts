import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type Role = 'public' | 'member' | 'staff' | 'admin';

export const ROLES_KEY = 'roles';
// Decorate a handler with the roles allowed to call it.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Role guard. POC: the caller's role comes from an `x-role` header (defaults to
 * `public`), standing in for an Entra ID access token. The production version
 * validates the Entra JWT and maps app roles/group claims to these roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<Role[]>(ROLES_KEY, ctx.getHandler());
    if (!required || required.length === 0) return true; // public
    const req = ctx.switchToHttp().getRequest();
    const role = (req.headers['x-role'] as Role) || 'public';
    if (!required.includes(role)) {
      throw new ForbiddenException(`Requires role: ${required.join(' / ')}`);
    }
    return true;
  }
}

// Read the caller's role (for filtering responses, e.g. staff see own timesheets).
export const callerRole = (req: any): Role => (req.headers['x-role'] as Role) || 'public';

// Per-document audience values. Matches the `audience` column on Document
// and is used by the documents + onboarding features for read gating.
export type DocumentAudience = 'admin' | 'staff' | 'band_member' | 'public';

// Whether the caller's role is allowed to see a document tagged with
// `audience`. Strict tier: admin > staff > member > public. A caller's
// role grants access to everything at-or-below their tier.
export function canSeeAudience(role: Role, audience: DocumentAudience): boolean {
  const rank: Record<Role, number> = { public: 0, member: 1, staff: 2, admin: 3 };
  const audRank: Record<DocumentAudience, number> = {
    public: 0,
    band_member: 1,
    staff: 2,
    admin: 3,
  };
  return rank[role] >= audRank[audience];
}

// SQL "IN" clause helper for filtering documents by what the caller can
// see — used inside Prisma `where: { audience: { in: ... } }` predicates.
export function audiencesVisibleTo(role: Role): DocumentAudience[] {
  if (role === 'admin') return ['admin', 'staff', 'band_member', 'public'];
  if (role === 'staff') return ['staff', 'band_member', 'public'];
  if (role === 'member') return ['band_member', 'public'];
  return ['public'];
}
