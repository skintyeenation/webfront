import { Injectable } from '@nestjs/common';
import * as seed from './fixtures';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * In-memory data layer for the POC. Seeded from ./fixtures and mutated by the
 * controllers. Replace with Prisma over Azure PostgreSQL + PostGIS (ADR-7);
 * the controller logic stays the same, only this service changes.
 */
@Injectable()
export class DataService {
  directory: any[] = clone(seed.directory);
  events: any[] = clone(seed.events);
  meetings: any[] = clone(seed.meetings);
  expenditures: any[] = clone(seed.expenditures);
  majorProjects: any[] = clone(seed.majorProjects);
  financials: any[] = clone(seed.financials);
  timeEntries: any[] = clone(seed.timeEntries);
  polls: any[] = clone(seed.polls);
  notifications: any[] = clone(seed.notifications);
  communityProfile: any = clone(seed.communityProfile);
  chartOfAccounts: any[] = clone(seed.chartOfAccounts);

  id(prefix: string): string {
    return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  }
}
