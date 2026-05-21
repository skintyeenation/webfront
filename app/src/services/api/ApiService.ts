import { BandMember, BandMeeting, CommunityEvent, FinancialRecord, Poll, PublicRecord, TimeEntry } from 'skintyee/models';

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
}
