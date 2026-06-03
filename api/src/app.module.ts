import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DataService } from './data.service';
import { RolesGuard } from './roles';
import { CONTROLLERS } from './controllers';
import { GraphFeedService } from './graph-feed.service';
import { PrismaService } from './prisma.service';
import { ExoService } from './exo.service';
import { MailboxReconcileService } from './mailbox-reconcile.service';
import { StorageModule } from './storage/storage.module';
import { DocumentsService } from './documents.service';
import { DocumentsController, DocumentTagsController } from './documents.controller';

@Module({
  imports: [StorageModule],
  controllers: [...CONTROLLERS, DocumentsController, DocumentTagsController],
  providers: [
    DataService,
    GraphFeedService,  // ADR-14: Microsoft Graph reader for Planner + Teams meetings
    PrismaService,     // ADR-7:  Postgres data layer (degrades to in-memory if no DATABASE_URL)
    ExoService,        // ADR-15: Exchange Online PowerShell via Azure Function (shared mailbox perms)
    MailboxReconcileService,  // Pulls EXO truth → mailboxMemberships column on seed + admin sync
    DocumentsService,  // Phase 1 Documents library w/ pluggable storage adapter
    // Role guard runs on every route; handlers without @Roles are public.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
