import { AppNotification, BandMember, BandMeeting, CommunityEvent, Expenditure, FinancialRecord, Poll, PublicRecord, TimeEntry } from 'skintyee/models';

/**
 * ApiService is the single seam between the app and its backend.
 *
 * STUB: there is no real backend yet. The diagram shows a future
 * API Server → Azure Cloud DB reachable at App.SkinTyee.ca. Until that exists,
 * the only implementation is the in-memory mock in ./mock. When the real API is
 * built, add a second implementation of this interface (e.g. HttpApiService) and
 * select it in src/store/apis.ts based on Config.apiServer. See STUBS.md.
 */
export interface ApiService {
  directory: {
    list(): Promise<BandMember[]>;
    get(id: string): Promise<BandMember | undefined>;
  };
  events: {
    list(): Promise<CommunityEvent[]>;
    get(id: string): Promise<CommunityEvent | undefined>;
  };
  meetings: {
    list(): Promise<BandMeeting[]>;
  };
  publicRecords: {
    list(): Promise<PublicRecord[]>;
  };
  transparency: {
    // Public band expenditures by program area. STUB: real figures come from the
    // Ferrus ASAP Suite + Adagio / Sage 300 financial integration. See STUBS.md.
    expenditures(): Promise<Expenditure[]>;
  };
  timekeeping: {
    list(): Promise<TimeEntry[]>;
  };
  financials: {
    list(): Promise<FinancialRecord[]>;
  };
  polls: {
    list(): Promise<Poll[]>;
    get(id: string): Promise<Poll | undefined>;
    vote(args: { pollId: string; optionId: string }): Promise<Poll>;
  };
  notifications: {
    // In-app notifications inbox. STUB: real push delivery (Expo Notifications +
    // backend) is not wired; this just lists stored notifications. See STUBS.md.
    list(): Promise<AppNotification[]>;
  };
}
