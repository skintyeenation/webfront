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
import { OnboardingService } from './onboarding.service';
import { OnboardingController, OnboardingPublicController } from './onboarding.controller';
import { TimekeepingReportsService } from './timekeeping-reports.service';
import { StaffAuthService } from './staff-auth.service';
import { StaffAuthController } from './staff-auth.controller';
import { DevicesController } from './devices.controller';
import { MailgunService } from './mailgun.service';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseReportsService } from './expense-reports.service';
import { AnthropicService } from './anthropic.service';

@Module({
  imports: [StorageModule],
  controllers: [
    ...CONTROLLERS,
    DocumentsController, DocumentTagsController,
    OnboardingController, OnboardingPublicController,
    StaffAuthController,  // staff-auth feature — public /v1/auth/staff/*
    DevicesController,    // System → Devices (Entra devices, seeded; admin-only)
    SettingsController,   // System → Configure Notifications (admin-only)
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
    // Role guard runs on every route; handlers without @Roles are public.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
