// Small sample dataset so the stub server returns realistic responses that match
// the OpenAPI schemas. Mirrors the app's mock fixtures. Replace with Azure
// Cloud DB queries + the Ferrus/Adagio + WordPress integrations.

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

export const directory = [
  { _id: 'm1', name: 'Marie Joseph', role: 'Chief', title: 'Chief', email: 'chief@skintyee.ca', phone: '250-555-0101', avatarLetter: 'M' },
  { _id: 'm2', name: 'Daniel Pierre', role: 'Council', title: 'Council Member', email: 'd.pierre@skintyee.ca', phone: '250-555-0102', avatarLetter: 'D' },
  { _id: 'm3', name: 'Sandra Williams', role: 'Staff', title: 'Band Administrator', email: 'admin@skintyee.ca', phone: '250-555-0103', avatarLetter: 'S' },
];

export const events = [
  { _id: 'e1', title: 'Community Salmon BBQ', description: 'Annual salmon BBQ at the community hall.', location: 'Community Hall', startsAt: daysFromNow(5), public: true },
  { _id: 'e2', title: 'Members-only Planning Session', description: 'Input session on the community plan.', location: 'Band Office', startsAt: daysFromNow(20), public: false },
];

export const meetings = [
  { _id: 'bm1', title: 'Monthly Council Meeting', agenda: 'Budget review, lands update, housing.', location: 'Band Office Boardroom', startsAt: daysFromNow(7) },
];

export const expenditures = [
  { _id: 'x1', area: 'Housing', spent: 612000, budget: 700000, fiscalYear: 'FY2024', breakdown: [{ label: 'New unit construction', amount: 340000 }, { label: 'Renovations & repairs', amount: 168000 }] },
  { _id: 'x3', area: 'Education', spent: 286000, budget: 300000, fiscalYear: 'FY2024', breakdown: [{ label: 'Post-secondary sponsorships', amount: 158000 }] },
];

export const majorProjects = [
  { _id: 'mp1', name: 'Water System Upgrade', allocated: 1200000, spent: 845000, status: 'in_progress', fiscalYear: 'FY2024' },
  { _id: 'mp3', name: 'Main Road Paving', allocated: 480000, spent: 467000, status: 'complete', fiscalYear: 'FY2024' },
];

export const financials = [
  { _id: 'f1', title: 'Operating Budget', period: 'FY2024', category: 'Budget', amount: 1850000, notes: 'Approved by Council.' },
];

export const timeEntries = [
  { _id: 't1', workerName: 'Joseph Alec', date: daysFromNow(-1), hours: 7.5, task: 'Lands survey fieldwork', approved: true },
  { _id: 't3', workerName: 'Albert John', date: daysFromNow(0), hours: 6, task: 'Community hall setup', approved: false },
];

export const polls = [
  { _id: 'p1', kind: 'survey', question: 'Should we extend community hall hours on weekends?', description: 'Council is considering keeping the hall open later on Saturdays.', closesAt: daysFromNow(10), closed: false, options: [{ id: 'p1o1', label: 'Yes', votes: 34 }, { id: 'p1o2', label: 'No', votes: 12 }] },
  { _id: 'v1', kind: 'vote', question: 'Ratify the 2024 Community Plan amendment?', description: 'Formal member vote.', closesAt: daysFromNow(14), closed: false, options: [{ id: 'v1o1', label: 'In favour', votes: 58 }, { id: 'v1o2', label: 'Opposed', votes: 21 }] },
];

export const notifications = [
  { _id: 'n1', title: 'Water Boil Advisory in effect', body: 'Boil water for at least 1 minute before drinking.', category: 'Health', createdAt: daysFromNow(0), read: false },
  { _id: 'n2', title: 'Wildfire evacuation alert', body: 'Evacuation alert for the north reserve.', category: 'Safety', createdAt: daysFromNow(0), read: false },
];
