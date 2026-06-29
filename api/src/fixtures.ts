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
  { _id: 'm3', name: 'Sandra Williams', role: 'Staff', title: 'Band Administrator', email: 'admin@skintyee.ca', phone: '250-555-0103', avatarLetter: 'S', bandGroups: ['management'] },
];

export const events = [
  { _id: 'e1', title: 'Community Salmon BBQ', description: 'Annual salmon BBQ at the community hall.', location: 'Community Hall', startsAt: daysFromNow(5), public: true },
  { _id: 'e2', title: 'Members-only Planning Session', description: 'Input session on the community plan.', location: 'Band Office', startsAt: daysFromNow(20), public: false },
];

export const meetings = [
  { _id: 'bm1', title: 'Monthly Council Meeting', agenda: 'Budget review, lands update, housing.', location: 'Band Office Boardroom', startsAt: daysFromNow(7), type: 'council-meeting' },
  { _id: 'bm2', title: 'Community Band Meeting', agenda: 'Open community update — all members welcome.', location: 'Community Hall', startsAt: daysFromNow(14), type: 'band-meeting' },
  { _id: 'bm3', title: 'Closed Session — Personnel', agenda: 'In-camera.', location: 'Band Office', startsAt: daysFromNow(10), type: 'closed-session' },
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
  { _id: 'n3', title: 'Community Salmon BBQ', body: 'Join us at the Community Hall this weekend.', category: 'Events', createdAt: daysFromNow(-1), read: false },
  { _id: 'n4', title: 'Council in-camera notes', body: 'Internal council session summary.', category: 'Council', createdAt: daysFromNow(-1), read: false },
];

// Nation size/demographic profile. Mirrors SKIN_TYEE_PROFILE in @skintyee/models (kept in
// sync by hand for the POC — the api builds with tsc/rootDir and can't import the raw-TS
// shared package; Phase 2 shares it via the Prisma seed). Drives size-based funding tiers
// (e.g. TCF). Population is approximate (~200); most other fields are not yet confirmed.
export const communityProfile = {
  name: 'Skin Tyee First Nation',
  totalMembers: 200,
  onReservePopulation: null as number | null,
  registeredMembers: null as number | null,
  nominalRollStudents: null as number | null,
  firstNationsServed: 1,
  ongoingIscPrograms: null as number | null,
  asOf: 'FY2024-2025',
  notes:
    'Population is approximate (~200 members). On-reserve resident count, registered (status) members, Nominal Roll enrolment, and the number of ongoing ISC programs are not yet confirmed — funding figures that depend on them cannot be resolved until they are.',
};

// ISC Chart of Accounts for Transfer Payments (guide pp. 172-188). Mirrors
// CHART_OF_ACCOUNTS in @skintyee/models (see note above). Reference data for coding
// incoming ISC funding (EFTs) to the right Cost Centre / funding type in Sage 300.
export const chartOfAccounts = [
  { costCentre: 'A09020 (378)', description: 'Financial Transfer Agreement — Block core funding (governance/IGS, education, income assistance, assisted living, water/sewer & education O&M, housing, LEDSP core)', fundingType: 'Block' },
  { costCentre: 'A09020 (476-479)', description: 'New Fiscal Relationship — NFR Grant core + escalator (band support, employee benefits, water, education, housing, income assistance, assisted living, lands & econ dev)', fundingType: 'NFR Grant' },
  { costCentre: 'A0902D / A0902E', description: 'Self-government, claims & inter-sector (CIRNAC coding) — governance capacity, treaty/BCTC, FNIH health, family violence, urban programming, climate, MMIWG', fundingType: 'Fixed/Flex/Set' },
  { costCentre: 'A0903A', description: 'Emergency Management Assistance Program (EMAP) — capacity building, preparedness/mitigation, FireSmart, response, recovery', fundingType: 'Fixed/Flex/Set' },
  { costCentre: 'A0903B', description: 'Education — elementary/secondary (FN school formula, tuition, student supports), post-secondary (PSSSP/PSPP), cultural centres, youth employment', fundingType: 'Fixed/Flex/Set' },
  { costCentre: 'A0903D', description: 'Social development — Income Assistance (basic/special needs, service delivery, pre-employment), Assisted Living, Family Violence, Urban Programming, ICSF', fundingType: 'Fixed/Flex/Grant/Set' },
  { costCentre: 'A09040 / A0904A-F', description: 'Lands & Economic Development — LEDSP core/targeted, CORP, RLEMP, FN Land Management, Contaminated Sites (FCSAP/CSOR)', fundingType: 'Fixed/Flex/Set' },
  { costCentre: 'A0906B-E', description: 'Community infrastructure & housing — water/wastewater, O&M of assets, housing construction/reno, fire protection, FN Infrastructure Fund, Gas Tax, Building Canada Fund', fundingType: 'Fixed/Flex/Set' },
  { costCentre: 'A0907A-D', description: 'Governance & individual affairs — community safety, estates, registration & treaty annuities, Band Employee Benefits, Prof & Inst Dev, Tribal Council Funding, Band Support Funding', fundingType: 'Fixed/Set · Grant (BSF)' },
  { costCentre: 'A0908A', description: 'First Nation Child & Family Services — maintenance, operations, prevention, FN representative services, post-majority care', fundingType: 'Fixed/Flex/Set' },
  { costCentre: 'A0908B', description: "Jordan's Principle and Inuit — health, education, social, child/life necessities, service coordination, major capital (CHRT 41)", fundingType: 'Fixed/Flex/Set' },
  { costCentre: 'A0908C', description: 'Child & Family Services Reform (Bill C-92) — cost capacity-building, governance engagement, coordination-agreement discussions', fundingType: 'Fixed/Flex/Set' },
];
