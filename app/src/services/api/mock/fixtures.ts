import { BandMember, BandMeeting, CommunityEvent, FinancialRecord, Poll, PublicRecord, TimeEntry } from 'skintyee/models';

// STUB DATA. Hand-authored sample content so every screen renders realistically
// without a backend. Replace with real API responses. See STUBS.md.

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

export const members: BandMember[] = [
  { _id: 'm1', name: 'Marie Joseph', role: 'Chief', title: 'Chief', email: 'chief@skintyee.ca', phone: '250-555-0101', avatarLetter: 'M' },
  { _id: 'm2', name: 'Daniel Pierre', role: 'Council', title: 'Council Member', email: 'd.pierre@skintyee.ca', phone: '250-555-0102', avatarLetter: 'D' },
  { _id: 'm3', name: 'Sandra Williams', role: 'Staff', title: 'Band Administrator', email: 'admin@skintyee.ca', phone: '250-555-0103', avatarLetter: 'S' },
  { _id: 'm4', name: 'Joseph Alec', role: 'Staff', title: 'Lands Manager', email: 'lands@skintyee.ca', phone: '250-555-0104', avatarLetter: 'J' },
  { _id: 'm5', name: 'Rita Thomas', role: 'Member', avatarLetter: 'R' },
  { _id: 'm6', name: 'Albert John', role: 'Member', avatarLetter: 'A' },
];

export const events: CommunityEvent[] = [
  { _id: 'e1', title: 'Community Salmon BBQ', description: 'Annual salmon BBQ at the community hall. All welcome.', location: 'Community Hall', startsAt: daysFromNow(5), public: true },
  { _id: 'e2', title: 'Youth Culture Night', description: 'Drumming, songs, and storytelling with elders.', location: 'Gymnasium', startsAt: daysFromNow(12), public: true },
  { _id: 'e3', title: 'Members-only Planning Session', description: 'Input session on the community plan.', location: 'Band Office', startsAt: daysFromNow(20), public: false },
];

export const meetings: BandMeeting[] = [
  { _id: 'bm1', title: 'Monthly Council Meeting', agenda: 'Budget review, lands update, housing.', location: 'Band Office Boardroom', startsAt: daysFromNow(7), minutesUrl: undefined },
  { _id: 'bm2', title: 'Special Membership Meeting', agenda: 'Vote on community plan amendments.', location: 'Community Hall', startsAt: daysFromNow(18) },
  { _id: 'bm3', title: 'Finance Committee', agenda: 'Q2 financial statements.', location: 'Band Office Boardroom', startsAt: daysFromNow(2) },
];

export const publicRecords: PublicRecord[] = [
  { _id: 'r1', title: 'Membership Code 2024', category: 'Bylaw', summary: 'Current membership code as ratified by the membership.', publishedAt: daysFromNow(-90) },
  { _id: 'r2', title: 'Notice: Road Maintenance', category: 'Notice', summary: 'Scheduled road works on the main access road.', publishedAt: daysFromNow(-3) },
  { _id: 'r3', title: 'Annual Report 2023', category: 'Report', summary: 'Year in review and audited highlights.', publishedAt: daysFromNow(-200) },
  { _id: 'r4', title: 'Housing Application Form', category: 'Form', summary: 'Apply for on-reserve housing.', publishedAt: daysFromNow(-30) },
];

export const timeEntries: TimeEntry[] = [
  { _id: 't1', workerName: 'Joseph Alec', date: daysFromNow(-1), hours: 7.5, task: 'Lands survey fieldwork', approved: true },
  { _id: 't2', workerName: 'Sandra Williams', date: daysFromNow(-1), hours: 8, task: 'Administration', approved: true },
  { _id: 't3', workerName: 'Albert John', date: daysFromNow(0), hours: 6, task: 'Community hall setup', approved: false },
  { _id: 't4', workerName: 'Rita Thomas', date: daysFromNow(0), hours: 4, task: 'Reception coverage', approved: false },
];

export const financials: FinancialRecord[] = [
  { _id: 'f1', title: 'Operating Budget', period: 'FY2024', category: 'Budget', amount: 1850000, notes: 'Approved by Council.' },
  { _id: 'f2', title: 'Q1 Financial Statement', period: 'Q1 FY2024', category: 'Statement', amount: 462300 },
  { _id: 'f3', title: 'Housing Capital Grant', period: 'FY2024', category: 'Grant', amount: 320000, notes: 'ISC capital funding.' },
  { _id: 'f4', title: 'Community Hall Repairs', period: 'Mar 2024', category: 'Expense', amount: 28750 },
];

export const polls: Poll[] = [
  {
    _id: 'p1',
    question: 'Should we extend community hall hours on weekends?',
    description: 'Council is considering keeping the hall open later on Saturdays.',
    closesAt: daysFromNow(10),
    closed: false,
    options: [
      { id: 'p1o1', label: 'Yes, extend hours', votes: 34 },
      { id: 'p1o2', label: 'No, keep current hours', votes: 12 },
      { id: 'p1o3', label: 'Undecided', votes: 5 },
    ],
  },
  {
    _id: 'p2',
    question: 'Priority for next capital project?',
    description: 'Help Council prioritize the next infrastructure investment.',
    closesAt: daysFromNow(25),
    closed: false,
    options: [
      { id: 'p2o1', label: 'Water system upgrade', votes: 41 },
      { id: 'p2o2', label: 'New youth centre', votes: 38 },
      { id: 'p2o3', label: 'Road paving', votes: 19 },
    ],
  },
];
