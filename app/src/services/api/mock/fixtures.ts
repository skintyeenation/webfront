import { AppNotification, BandMember, BandMeeting, CommunityEvent, Expenditure, MajorProject, Poll, PublicRecord, TimeEntry } from 'skintyee/models';
import type { DeviceDetailDto } from 'skintyee/services/api/ApiService';

// STUB DATA. Hand-authored sample content so every screen renders realistically
// without a backend. Replace with real API responses. See STUBS.md.

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

const hoursAgo = (n: number) => {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
};

// Categories match the skintyee.ca WordPress taxonomy (Health / Safety / Council
// / Events / Programs / News / Announcements). Examples mirror real posts: a
// Water Boil Advisory => Health, a wildfire notice => Safety.
export const notifications: AppNotification[] = [
  { _id: 'n1', title: 'Water Boil Advisory in effect', body: 'Boil water for at least 1 minute before drinking until further notice.', category: 'Health', createdAt: hoursAgo(2), read: false },
  { _id: 'n2', title: 'Wildfire evacuation alert', body: 'An evacuation alert is in effect for the north reserve. Be ready to leave.', category: 'Safety', createdAt: hoursAgo(6), read: false },
  { _id: 'n3', title: 'Council meeting & agenda posted', body: 'Monthly Council Meeting is next week — agenda now available.', category: 'Council', createdAt: hoursAgo(30), read: true },
  { _id: 'n4', title: 'Community Salmon BBQ', body: 'Join us at the Community Hall this weekend.', category: 'Events', createdAt: hoursAgo(40), read: true },
  { _id: 'n5', title: 'Summer youth employment program', body: 'Applications are open for the summer youth employment program.', category: 'Programs', createdAt: hoursAgo(54), read: true },
  { _id: 'n6', title: 'Band office closure', body: 'The Band Office will be closed Friday for staff training.', category: 'Announcements', createdAt: hoursAgo(72), read: true },
];

// Named leadership + staff (have contact details).
const namedMembers: BandMember[] = [
  { _id: 'm1', name: 'Marie Joseph', role: 'Chief', title: 'Chief', email: 'chief@skintyee.ca', phone: '250-555-0101', avatarLetter: 'M' },
  { _id: 'm2', name: 'Daniel Pierre', role: 'Council', title: 'Council Member', email: 'd.pierre@skintyee.ca', phone: '250-555-0102', avatarLetter: 'D' },
  { _id: 'm3', name: 'Sandra Williams', role: 'Staff', title: 'Band Administrator', email: 'admin@skintyee.ca', phone: '250-555-0103', avatarLetter: 'S' },
  { _id: 'm4', name: 'Joseph Alec', role: 'Staff', title: 'Lands Manager', email: 'lands@skintyee.ca', phone: '250-555-0104', avatarLetter: 'J' },
  { _id: 'm5', name: 'Annie Michell', role: 'Council', title: 'Council Member', email: 'a.michell@skintyee.ca', phone: '250-555-0105', avatarLetter: 'A' },
  { _id: 'm6', name: 'Rita Thomas', role: 'Member', avatarLetter: 'R' },
];

// Generate the rest of the roster so reporting reflects the real ~150-member
// band. Deterministic (no randomness) so the data is stable across reloads.
const FIRST = ['Albert', 'Bernice', 'Clifford', 'Doreen', 'Edward', 'Florence', 'George', 'Helen', 'Ivan', 'Joanne', 'Kevin', 'Lorraine', 'Melvin', 'Norma', 'Oscar', 'Patricia', 'Quentin', 'Rose', 'Stanley', 'Theresa', 'Victor', 'Wanda', 'Wesley', 'Yvonne'];
const LAST = ['John', 'Pierre', 'Thomas', 'Joseph', 'Alec', 'William', 'Charlie', 'Mack', 'Tom', 'Michell', 'Patrick', 'Abraham', 'Isaac', 'Jacob', 'Louie', 'Sam'];
const TOTAL_MEMBERS = 150;

const generatedMembers: BandMember[] = Array.from({ length: TOTAL_MEMBERS - namedMembers.length }, (_, i) => {
  const first = FIRST[i % FIRST.length];
  const last = LAST[(i * 7 + 3) % LAST.length];
  const name = `${first} ${last}`;
  return { _id: `m${namedMembers.length + i + 1}`, name, role: 'Member' as const, avatarLetter: first[0] };
});

export const members: BandMember[] = [...namedMembers, ...generatedMembers];

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

// Public, transparent band expenditures by program area (FY2024). Areas mirror
// the Ferrus ASAP Suite modules + common band departments. Each area drills into
// a breakdown of how much was spent and where. STUB figures.
export const expenditures: Expenditure[] = [
  {
    _id: 'x1', area: 'Housing', spent: 612000, budget: 700000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'New unit construction (Lots 12–15)', amount: 340000 },
      { label: 'Renovations & repairs', amount: 168000 },
      { label: 'Mould remediation program', amount: 64000 },
      { label: 'Rental subsidies', amount: 40000 },
    ],
  },
  {
    _id: 'x2', area: 'Public Works', spent: 348000, budget: 400000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'Road grading & gravel', amount: 142000 },
      { label: 'Water system maintenance', amount: 121000 },
      { label: 'Waste management contract', amount: 85000 },
    ],
  },
  {
    _id: 'x3', area: 'Education', spent: 286000, budget: 300000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'Post-secondary sponsorships', amount: 158000 },
      { label: 'K–12 tutoring & supplies', amount: 78000 },
      { label: 'Language & culture program', amount: 50000 },
    ],
  },
  {
    _id: 'x4', area: 'Employment & Training', spent: 154000, budget: 200000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'Skills training partnership', amount: 92000 },
      { label: 'Summer youth employment', amount: 42000 },
      { label: 'Job readiness workshops', amount: 20000 },
    ],
  },
  {
    _id: 'x5', area: 'Health', spent: 198000, budget: 220000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'Community health nurse', amount: 96000 },
      { label: 'Medical transportation', amount: 58000 },
      { label: 'Wellness & mental health', amount: 44000 },
    ],
  },
  {
    _id: 'x6', area: 'Social Assistance', spent: 174000, budget: 180000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'Income assistance payments', amount: 138000 },
      { label: 'Emergency support', amount: 36000 },
    ],
  },
  {
    _id: 'x7', area: 'Child & Family Services', spent: 132000, budget: 160000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'Family support workers', amount: 84000 },
      { label: 'Youth programming', amount: 48000 },
    ],
  },
  {
    _id: 'x8', area: 'Information Technology', spent: 88000, budget: 120000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'Network & connectivity', amount: 46000 },
      { label: 'Devices & equipment', amount: 28000 },
      { label: 'Software & licensing', amount: 14000 },
    ],
  },
  {
    _id: 'x9', area: 'Administration', spent: 142000, budget: 150000, fiscalYear: 'FY2024',
    breakdown: [
      { label: 'Band office operations', amount: 92000 },
      { label: 'Governance & council', amount: 32000 },
      { label: 'Audit & professional fees', amount: 18000 },
    ],
  },
];

// Major capital projects — allocated budget vs actual spend. STUB figures.
export const majorProjects: MajorProject[] = [
  { _id: 'mp1', name: 'Water System Upgrade', allocated: 1200000, spent: 845000, status: 'in_progress', fiscalYear: 'FY2024' },
  { _id: 'mp2', name: 'New Youth Centre', allocated: 950000, spent: 312000, status: 'in_progress', fiscalYear: 'FY2024' },
  { _id: 'mp3', name: 'Main Road Paving', allocated: 480000, spent: 467000, status: 'complete', fiscalYear: 'FY2024' },
  { _id: 'mp4', name: 'Housing Subdivision (Phase 2)', allocated: 1600000, spent: 220000, status: 'planned', fiscalYear: 'FY2024' },
  { _id: 'mp5', name: 'Health Centre Renovation', allocated: 540000, spent: 528000, status: 'complete', fiscalYear: 'FY2024' },
];

export const polls: Poll[] = [
  {
    _id: 'p1',
    kind: 'survey',
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
    kind: 'survey',
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
  {
    _id: 'v1',
    kind: 'vote',
    question: 'Ratify the 2024 Community Plan amendment?',
    description: 'A formal vote on the proposed amendment to the community plan, as presented at the membership meeting.',
    closesAt: daysFromNow(14),
    closed: false,
    options: [
      { id: 'v1o1', label: 'In favour', votes: 58 },
      { id: 'v1o2', label: 'Opposed', votes: 21 },
      { id: 'v1o3', label: 'Abstain', votes: 6 },
    ],
  },
  {
    _id: 'v2',
    kind: 'vote',
    question: 'Approve the Housing Bylaw 2024-02?',
    description: 'Formal member vote to adopt the updated on-reserve housing bylaw.',
    closesAt: daysFromNow(-2),
    closed: true,
    options: [
      { id: 'v2o1', label: 'In favour', votes: 94 },
      { id: 'v2o2', label: 'Opposed', votes: 33 },
    ],
  },
];

// ---- Planner (mock) ------------------------------------------------------
// Mirrors what the api/'s GraphFeedService would return from real Microsoft
// Planner data. Per ADR-14.

import { PlannerPlanSummary, PlannerRollup, PlannerTask } from 'skintyee/models';

export const plannerPlans: PlannerPlanSummary[] = [
  { id: 'pl-housing',  title: 'Housing',        groupId: 'g-mgmt', groupName: 'Skin Tyee Management', taskCount: 18, openCount: 12, completedCount: 6 },
  { id: 'pl-forestry', title: 'Forestry',       groupId: 'g-mgmt', groupName: 'Skin Tyee Management', taskCount: 10, openCount: 6,  completedCount: 4 },
  { id: 'pl-health',   title: 'Health',         groupId: 'g-mgmt', groupName: 'Skin Tyee Management', taskCount: 14, openCount: 9,  completedCount: 5 },
  { id: 'pl-council',  title: 'Council',        groupId: 'g-mgmt', groupName: 'Skin Tyee Management', taskCount: 7,  openCount: 4,  completedCount: 3 },
  { id: 'pl-it-dev',   title: 'IT Development', groupId: 'g-mgmt', groupName: 'Skin Tyee Management', taskCount: 37, openCount: 24, completedCount: 13 },
];

const isoIn = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

export const plannerTasksByPlan: Record<string, PlannerTask[]> = {
  'pl-housing': [
    { id: 't-h1', planId: 'pl-housing', bucketName: 'In progress', title: 'Re-shingle community hall', status: 'InProgress', priority: 3, dueDateTime: isoIn(-3), assigneeNames: ['Marie J.'], categoryLabels: ['Housing'] },
    { id: 't-h2', planId: 'pl-housing', bucketName: 'In progress', title: 'Housing applications review', status: 'InProgress', priority: 5, dueDateTime: isoIn(0),  assigneeNames: ['Daniel P.'], categoryLabels: ['Housing'] },
    { id: 't-h3', planId: 'pl-housing', bucketName: 'Backlog',     title: 'Rental unit inspection — Lot 4', status: 'NotStarted', priority: 5, dueDateTime: isoIn(5), assigneeNames: ['Maintenance crew'], categoryLabels: ['Housing'] },
  ],
  'pl-forestry': [
    { id: 't-f1', planId: 'pl-forestry', bucketName: 'In progress', title: 'Forestry permit renewal', status: 'InProgress', priority: 2, dueDateTime: isoIn(-1), assigneeNames: ['Forestry lead'], categoryLabels: ['Forestry'] },
    { id: 't-f2', planId: 'pl-forestry', bucketName: 'Backlog',     title: 'Cutblock boundary survey', status: 'NotStarted', priority: 6, dueDateTime: isoIn(12), categoryLabels: ['Forestry'] },
  ],
  'pl-health': [
    { id: 't-hl1', planId: 'pl-health', bucketName: 'In progress', title: 'Water testing — Zone 2', status: 'InProgress', priority: 4, dueDateTime: isoIn(2), assigneeNames: ['Health team'], categoryLabels: ['Health'] },
    { id: 't-hl2', planId: 'pl-health', bucketName: 'In progress', title: 'Mental wellness program intake', status: 'InProgress', priority: 5, dueDateTime: isoIn(6), categoryLabels: ['Health'] },
  ],
  'pl-council': [
    { id: 't-c1', planId: 'pl-council', bucketName: 'In progress', title: 'June meeting agenda', status: 'InProgress', priority: 5, dueDateTime: isoIn(1), assigneeNames: ['Chief Marie'], categoryLabels: ['Council'] },
  ],
  'pl-it-dev': [
    { id: 't-i1', planId: 'pl-it-dev', bucketName: 'In progress', title: 'Skin Tyee app — homescreen rebuild', status: 'InProgress', priority: 4, dueDateTime: isoIn(7), categoryLabels: ['IT'] },
  ],
};

export function plannerRollup(): PlannerRollup {
  const allTasks = Object.values(plannerTasksByPlan).flat();
  const now = Date.now();
  const overdue = allTasks.filter(
    (t) => t.status !== 'Completed' && t.dueDateTime && new Date(t.dueDateTime).getTime() < now
  );

  const byArea = new Map<string, { open: number; completed: number }>();
  for (const t of allTasks) {
    const area = t.categoryLabels?.[0] ?? 'Unknown';
    const cur = byArea.get(area) ?? { open: 0, completed: 0 };
    if (t.status === 'Completed') cur.completed++;
    else cur.open++;
    byArea.set(area, cur);
  }

  return {
    totalOpen: allTasks.filter((t) => t.status !== 'Completed').length,
    totalCompleted: allTasks.filter((t) => t.status === 'Completed').length,
    totalOverdue: overdue.length,
    byProgramArea: Array.from(byArea.entries())
      .map(([programArea, counts]) => ({ programArea, ...counts }))
      .sort((a, b) => b.open - a.open),
    topOverdue: overdue
      .sort((a, b) => (a.dueDateTime ?? '').localeCompare(b.dueDateTime ?? ''))
      .slice(0, 5),
    generatedAt: new Date().toISOString(),
    cacheAgeMs: 0,
  };
}

// ---- Entra devices (Assets → Devices) --------------------------------------
// Stand-in for Microsoft Graph /devices + registeredOwners/registeredUsers.
// userCount is derived by the mock from `users.length`. Mix of OS, join type,
// compliance, and single- vs shared-access devices so the screens render
// realistically. Users reference the named members above.
export const devices: Array<Omit<DeviceDetailDto, 'userCount'>> = [
  {
    id: 'dev-srv01', displayName: 'STFN-SERVER01',
    operatingSystem: 'Windows Server', osVersion: '10.0.20348',
    trustType: 'Hybrid', isCompliant: true, isManaged: true, enabled: true,
    approximateLastSignInDateTime: hoursAgo(3), registrationDateTime: daysFromNow(-540),
    users: [
      { id: 'm3', displayName: 'Sandra Williams', email: 'admin@skintyee.ca', accessType: 'owner' },
    ],
  },
  {
    id: 'dev-chief-surface', displayName: 'CHIEF-SURFACE',
    operatingSystem: 'Windows', osVersion: '10.0.22631',
    trustType: 'AzureAd', isCompliant: true, isManaged: true, enabled: true,
    approximateLastSignInDateTime: hoursAgo(20), registrationDateTime: daysFromNow(-210),
    users: [
      { id: 'm1', displayName: 'Marie Joseph', email: 'chief@skintyee.ca', accessType: 'owner' },
    ],
  },
  {
    id: 'dev-reception', displayName: 'RECEPTION-PC',
    operatingSystem: 'Windows', osVersion: '10.0.19045',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: true,
    approximateLastSignInDateTime: hoursAgo(6), registrationDateTime: daysFromNow(-720),
    users: [
      { id: 'm3', displayName: 'Sandra Williams', email: 'admin@skintyee.ca', accessType: 'owner' },
      { id: 'm5', displayName: 'Annie Michell', email: 'a.michell@skintyee.ca', accessType: 'user' },
      { id: 'm2', displayName: 'Daniel Pierre', email: 'd.pierre@skintyee.ca', accessType: 'user' },
    ],
  },
  {
    id: 'dev-lands-laptop', displayName: 'LANDS-LAPTOP',
    operatingSystem: 'Windows', osVersion: '10.0.22631',
    trustType: 'Hybrid', isCompliant: true, isManaged: true, enabled: true,
    approximateLastSignInDateTime: daysFromNow(-2), registrationDateTime: daysFromNow(-150),
    users: [
      { id: 'm4', displayName: 'Joseph Alec', email: 'lands@skintyee.ca', accessType: 'owner' },
      { id: 'm3', displayName: 'Sandra Williams', email: 'admin@skintyee.ca', accessType: 'user' },
    ],
  },
  {
    id: 'dev-marie-iphone', displayName: 'Marie iPhone',
    operatingSystem: 'iOS', osVersion: '17.5.1',
    trustType: 'Workplace', isCompliant: true, isManaged: true, enabled: true,
    approximateLastSignInDateTime: hoursAgo(1), registrationDateTime: daysFromNow(-95),
    users: [
      { id: 'm1', displayName: 'Marie Joseph', email: 'chief@skintyee.ca', accessType: 'owner' },
    ],
  },
  {
    id: 'dev-council-ipad', displayName: 'Council iPad',
    operatingSystem: 'iPadOS', osVersion: '17.5',
    trustType: 'Workplace', isCompliant: true, isManaged: true, enabled: true,
    approximateLastSignInDateTime: daysFromNow(-5), registrationDateTime: daysFromNow(-120),
    users: [
      { id: 'm2', displayName: 'Daniel Pierre', email: 'd.pierre@skintyee.ca', accessType: 'user' },
      { id: 'm5', displayName: 'Annie Michell', email: 'a.michell@skintyee.ca', accessType: 'user' },
    ],
  },
  {
    id: 'dev-daniel-pixel', displayName: 'Daniel Pixel 8',
    operatingSystem: 'Android', osVersion: '14',
    trustType: 'Workplace', isCompliant: false, isManaged: false, enabled: true,
    approximateLastSignInDateTime: daysFromNow(-9), registrationDateTime: daysFromNow(-60),
    users: [
      { id: 'm2', displayName: 'Daniel Pierre', email: 'd.pierre@skintyee.ca', accessType: 'owner' },
    ],
  },
  {
    id: 'dev-old-laptop', displayName: 'BANDOFFICE-OLD',
    operatingSystem: 'Windows', osVersion: '10.0.19044',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-140), registrationDateTime: daysFromNow(-900),
    users: [
      { id: 'm3', displayName: 'Sandra Williams', email: 'admin@skintyee.ca', accessType: 'owner' },
    ],
  },
  // On-prem STALE machines — domain-joined boxes whose last logon was back in 2024.
  // Retained in AD but marked stale + disabled (stfn-setup Phase3-MarkStaleComputers.ps1),
  // mirrored here as enabled:false so they render greyed out and behind the
  // "Show disabled" toggle on the Devices screen. No current users (decommissioned).
  {
    id: 'dev-xyntax-fms1', displayName: 'XYNTAX-FMS1',
    operatingSystem: 'Windows', osVersion: '10.0.22631',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-585), registrationDateTime: daysFromNow(-675),
    users: [],
  },
  {
    id: 'dev-stfn2024-lt01', displayName: 'STFN2024-LT01',
    operatingSystem: 'Windows', osVersion: '10.0.22631',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-638), registrationDateTime: daysFromNow(-681),
    users: [],
  },
  {
    id: 'dev-stfn2024-lt02', displayName: 'STFN2024-LT02',
    operatingSystem: 'Windows', osVersion: '10.0.22631',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-572), registrationDateTime: daysFromNow(-681),
    users: [],
  },
  {
    id: 'dev-stfn2024-lt03', displayName: 'STFN2024-LT03',
    operatingSystem: 'Windows', osVersion: '10.0.22631',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-611), registrationDateTime: daysFromNow(-675),
    users: [],
  },
  {
    id: 'dev-stfn2022-lt01', displayName: 'STFN2022-LT01',
    operatingSystem: 'Windows', osVersion: '10.0.22631',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-668), registrationDateTime: daysFromNow(-668),
    users: [],
  },
  {
    id: 'dev-fs1', displayName: 'FS1',
    operatingSystem: 'Windows', osVersion: '10.0.19045',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-680), registrationDateTime: daysFromNow(-762),
    users: [],
  },
  {
    id: 'dev-fs2', displayName: 'FS2',
    operatingSystem: 'Windows', osVersion: '10.0.19045',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-680), registrationDateTime: daysFromNow(-762),
    users: [],
  },
  {
    id: 'dev-fs3', displayName: 'FS3',
    operatingSystem: 'Windows', osVersion: '10.0.19045',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-680), registrationDateTime: daysFromNow(-758),
    users: [],
  },
  {
    id: 'dev-fs4', displayName: 'FS4',
    operatingSystem: 'Windows', osVersion: '10.0.19045',
    trustType: 'Hybrid', isCompliant: false, isManaged: true, enabled: false,
    approximateLastSignInDateTime: daysFromNow(-680), registrationDateTime: daysFromNow(-758),
    users: [],
  },
];
