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
