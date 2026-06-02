/**
 * MailboxReconcileService
 * -----------------------
 * Reconciles Exchange Online mailbox permissions (the source of truth)
 * into the BandMember.mailboxMemberships DB column (the app's display
 * cache).
 *
 * The `mailboxMemberships` column is a comma-separated list of tagged
 * entries:
 *
 *   <mailbox-upn>|<relation>
 *
 * where relation ∈ {fullaccess, owner, member, manual}:
 *
 *   • fullaccess — written by reconcile-from-EXO. Source: Exchange Online.
 *   • owner      — written by graph-feed.service.ts. Source: M365 Group owners.
 *   • member     — written by graph-feed.service.ts. Source: M365 Group members.
 *   • manual     — written by the admin's PATCH /admin/users/:upn/mailbox-
 *                  memberships endpoint, for classic shared-mailbox grants
 *                  that admin chose to track even though they're not in EXO
 *                  (legacy / historical).
 *
 * Reconcile preserves owner/member/manual entries and only rewrites the
 * fullaccess ones — those are the EXO truth.
 *
 * Used by:
 *   - AdminController.seedDirectory (so DB matches EXO after every seed)
 *   - SharedMailboxesController.setAccess (write-through to DB after grant/revoke)
 *   - GET /v1/admin/shared-mailboxes/reconcile (admin trigger)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExoService } from './exo.service';
import { PrismaService } from './prisma.service';

@Injectable()
export class MailboxReconcileService {
  private readonly log = new Logger(MailboxReconcileService.name);

  constructor(
    private exo: ExoService,
    private prisma: PrismaService,
  ) {}

  // Full reconcile: read all 13 shared mailboxes' access lists from EXO,
  // rewrite every affected BandMember.mailboxMemberships |fullaccess
  // entries. Preserves other tags.
  async reconcileAll(): Promise<{ users: number; mailboxes: number; grants: number }> {
    if (!this.exo.isAvailable || !this.prisma.isAvailable) {
      this.log.warn('reconcile: EXO or Prisma not available, skipping');
      return { users: 0, mailboxes: 0, grants: 0 };
    }

    const mboxes = await this.exo.listSharedMailboxes();
    // upn → set of mailbox UPNs they have FullAccess on
    const accessByUser = new Map<string, Set<string>>();
    let totalGrants = 0;
    for (const m of mboxes) {
      try {
        const access = await this.exo.getMailboxAccess(m.upn);
        for (const { user } of access.full) {
          const u = user.toLowerCase();
          if (!accessByUser.has(u)) accessByUser.set(u, new Set());
          accessByUser.get(u)!.add(m.upn);
          totalGrants++;
        }
      } catch (e) {
        this.log.warn(`reconcile: couldn't read ${m.upn} access: ${e}`);
      }
    }

    // Apply to DB
    let userCount = 0;
    for (const [userUpn, mailboxes] of accessByUser) {
      try {
        const updated = await this.applyForUser(userUpn, mailboxes);
        if (updated) userCount++;
      } catch (e) {
        this.log.warn(`reconcile: couldn't update ${userUpn}: ${e}`);
      }
    }

    // Also clear |fullaccess for users no longer in any mailbox.
    // We don't want stale grants to linger after a revoke.
    const allUsers = await this.prisma.bandMember.findMany({
      where: { mailboxMemberships: { contains: '|fullaccess' } },
      select: { upn: true, mailboxMemberships: true },
    });
    for (const u of allUsers) {
      if (accessByUser.has(u.upn)) continue;   // already handled above
      await this.applyForUser(u.upn, new Set());
    }

    this.log.log(`reconcile: ${userCount} users updated from ${mboxes.length} mailboxes (${totalGrants} grants)`);
    return { users: userCount, mailboxes: mboxes.length, grants: totalGrants };
  }

  // Write a specific user's |fullaccess entries (idempotent).
  // Preserves non-fullaccess tags (owner/member/manual).
  async applyForUser(userUpn: string, fullAccessMailboxes: Set<string>): Promise<boolean> {
    const row = await this.prisma.bandMember.findUnique({ where: { upn: userUpn } });
    if (!row) return false;   // not in our BandMember table (e.g. admin@…onmicrosoft.com tenant root)

    const existing = row.mailboxMemberships ? row.mailboxMemberships.split(',').filter(Boolean) : [];
    const others   = existing.filter((raw) => raw.split('|')[1] !== 'fullaccess');
    const merged   = [...others, ...Array.from(fullAccessMailboxes).map((mb) => `${mb}|fullaccess`)];

    // No-op if unchanged (avoids needless update + syncedAt churn)
    const next = merged.join(',');
    if (next === (row.mailboxMemberships ?? '')) return false;

    await this.prisma.bandMember.update({
      where: { upn: userUpn },
      data: { mailboxMemberships: next, syncedAt: new Date() },
    });
    return true;
  }
}
