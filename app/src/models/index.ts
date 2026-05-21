// Domain models for the Skintyee app. These mirror the entities implied by the
// SkinTyee.drawio.pdf diagram (Directory, Events, Meetings, Records, Time Keeping,
// Financials, Polls). When the real API arrives these should be replaced by / kept
// in sync with the backend contract (see src/services/api/ApiService.ts).

export type Role = 'public' | 'member' | 'admin';

export interface BandMember {
  _id: string;
  name: string;
  role: 'Member' | 'Staff' | 'Chief' | 'Council';
  title?: string;
  email?: string; // sensitive: hidden from the public view
  phone?: string; // sensitive: hidden from the public view
  avatarLetter?: string;
}

export interface CommunityEvent {
  _id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string; // ISO date
  public: boolean;
}

export interface BandMeeting {
  _id: string;
  title: string;
  agenda: string;
  location: string;
  startsAt: string; // ISO date
  minutesUrl?: string;
}

export interface PublicRecord {
  _id: string;
  title: string;
  category: 'Bylaw' | 'Notice' | 'Report' | 'Form';
  summary: string;
  publishedAt: string; // ISO date
}

export interface TimeEntry {
  _id: string;
  workerName: string;
  date: string; // ISO date
  hours: number;
  task: string;
  approved: boolean;
}

export interface FinancialRecord {
  _id: string;
  title: string;
  period: string;
  category: 'Budget' | 'Statement' | 'Grant' | 'Expense';
  amount: number;
  notes?: string;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface Poll {
  _id: string;
  question: string;
  description: string;
  closesAt: string; // ISO date
  options: PollOption[];
  closed: boolean;
}
