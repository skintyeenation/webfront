import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DataService } from './data.service';
import { RolesGuard } from './roles';
import { CONTROLLERS } from './controllers';
import { GraphFeedService } from './graph-feed.service';
import { PrismaService } from './prisma.service';
import { ExoService } from './exo.service';
import { MailboxReconcileService } from './mailbox-reconcile.service';

@Module({
  controllers: CONTROLLERS,
  providers: [
    DataService,
    GraphFeedService,  // ADR-14: Microsoft Graph reader for Planner + Teams meetings
    PrismaService,     // ADR-7:  Postgres data layer (degrades to in-memory if no DATABASE_URL)
    ExoService,        // ADR-15: Exchange Online PowerShell via Azure Function (shared mailbox perms)
    MailboxReconcileService,  // Pulls EXO truth → mailboxMemberships column on seed + admin sync
    // Role guard runs on every route; handlers without @Roles are public.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
