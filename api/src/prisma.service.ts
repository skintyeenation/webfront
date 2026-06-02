import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Wraps PrismaClient in a NestJS @Injectable so controllers + other
 * services can constructor-inject it. Connects on module init, cleanly
 * disconnects on shutdown.
 *
 * Configured via the DATABASE_URL env var (set as a Container App
 * secret via scripts/setup-api-azure.sh).
 *
 * If DATABASE_URL is missing OR Prisma can't connect (network, wrong
 * credentials, db not provisioned), the service falls back to "no-db
 * mode" — it logs the failure but doesn't crash the api/. Controllers
 * detect this via `prisma.isAvailable` and gracefully fall back to
 * DataService's in-memory data. This means the api/ stays up during
 * Postgres outages (degraded — directory shows the in-memory mock
 * instead of seeded users — but everything else works).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);
  public isAvailable = false;

  async onModuleInit(): Promise<void> {
    if (!process.env.DATABASE_URL) {
      this.log.warn('DATABASE_URL not set — Prisma running in no-db fallback mode');
      return;
    }
    try {
      await this.$connect();
      this.isAvailable = true;
      this.log.log('Prisma connected to Postgres');
    } catch (e) {
      this.log.error(`Prisma couldn't connect — falling back to in-memory mode: ${e}`);
      this.isAvailable = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isAvailable) {
      await this.$disconnect();
    }
  }
}
