import { Logger, Module } from '@nestjs/common';
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
import { OnboardingService } from './onboarding.service';
import { OnboardingController, OnboardingPublicController } from './onboarding.controller';
import { TimekeepingReportsService } from './timekeeping-reports.service';
import { StaffAuthService } from './staff-auth.service';
import { StaffAuthController } from './staff-auth.controller';
import { DevicesController } from './devices.controller';
import { MailgunService } from './mailgun.service';
import { SettingsService } from './settings.service';
import { SettingsController, DocumentSettingsController } from './settings.controller';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseReportsService } from './expense-reports.service';
import { AnthropicService } from './anthropic.service';
import { SAGE_INTACCT_CLIENT, SageIntacctDriver } from './sage-intacct/sage-intacct-client';
import { StubSageIntacctClient } from './sage-intacct/stub-sage-intacct.client';
import { SageIntacctSyncService } from './sage-intacct/sage-intacct-sync.service';

@Module({
  imports: [StorageModule],
  controllers: [
    ...CONTROLLERS,
    DocumentsController, DocumentTagsController,
    OnboardingController, OnboardingPublicController,
    StaffAuthController,  // staff-auth feature — public /v1/auth/staff/*
    DevicesController,    // System → Devices (Entra devices, seeded; admin-only)
    SettingsController,   // System → Configure Notifications (admin-only)
    DocumentSettingsController, // System → finance-doc group scope (admin-only)
    ExpensesController,   // Expenses module — claims/receipts/tags (mirrors TimeKeeping)
  ],
  providers: [
    DataService,
    SettingsService,   // Admin-configurable email toggles + sender/reply-to
    ExpensesService,   // Expense claims/items/tags + receipt upload + AI prefill
    ExpenseReportsService, // Expense PDF/CSV reports (band letterhead, like timesheets)
    AnthropicService,  // Claude vision — receipt extraction + tag suggestion
    GraphFeedService,  // ADR-14: Microsoft Graph reader for Planner + Teams meetings
    PrismaService,     // ADR-7:  Postgres data layer (degrades to in-memory if no DATABASE_URL)
    ExoService,        // ADR-15: Exchange Online PowerShell via Azure Function (shared mailbox perms)
    MailboxReconcileService,  // Pulls EXO truth → mailboxMemberships column on seed + admin sync
    DocumentsService,  // Phase 1 Documents library w/ pluggable storage adapter
    OnboardingService, // Phase 2 Onboarding flows (uses the same storage adapter)
    TimekeepingReportsService, // Time Keeping > Reports — PDF + CSV per pay period
    StaffAuthService,  // Password hashing + JWT for the non-Entra sign-in path (docs/features/staff-auth.md)
    MailgunService,    // Transactional email (staff OTP onboarding, band-member notifications)
    // Sage Intacct sync — pushes approved timesheets/claims to Intacct (STUBBED).
    // Registered here (not a sub-module) so it shares this module's PrismaService.
    StubSageIntacctClient,
    {
      // Bind the SAGE_INTACCT_CLIENT token by SAGE_INTACCT_DRIVER, mirroring the
      // DOCUMENT_STORAGE factory in storage.module.ts. Only 'stub' ships today;
      // 'live' falls back to the stub with a warning until the XML client lands.
      provide: SAGE_INTACCT_CLIENT,
      inject: [StubSageIntacctClient],
      useFactory: (stub: StubSageIntacctClient) => {
        const log = new Logger('SageIntacctModule');
        const driver = (process.env.SAGE_INTACCT_DRIVER as SageIntacctDriver | undefined) ?? 'stub';
        if (driver === 'live') {
          log.warn('SAGE_INTACCT_DRIVER=live but the live XML client is not implemented — using the stub.');
        }
        log.log(`Sage Intacct driver: ${stub.driver}`);
        return stub;
      },
    },
    SageIntacctSyncService, // syncTimesheet / syncExpenseClaim, called on approve
    // Role guard runs on every route; handlers without @Roles are public.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
