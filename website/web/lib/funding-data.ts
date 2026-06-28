// ISC (Indigenous Services Canada) BC Region funding programs, structured from the
// 2024-2025 Program Guide (see website/docs/funding/). Drives the program-area pages
// (requirements + PAW/DCI deadline tables + contact cards) and the /funding hub.
//
//   PAW = Proposal / Application / Work plan (how you apply; has a # + due date)
//   DCI = Data Collection Instrument (the report you owe; has a # + due date)
//   FNIIP = First Nations Infrastructure Investment Plan (most capital/housing money
//           requires the project to be listed in it)
//
// `area` matches the PROGRAM_AREAS slugs in constants.ts. `pdfPage` deep-links into
// /docs/2024-2025-bc-region-program-guide.pdf#page=N.

export interface PawItem { no?: string; name: string; due?: string; note?: string }
export interface DciItem { no?: string; name: string; due?: string }
export interface FundingContact { label: string; email?: string; phone?: string }

export interface FundingProgram {
  area: string;
  name: string;
  acronym?: string;
  summary: string;
  funds?: string[];
  eligibility?: string;
  requirements?: string[];
  paw?: PawItem[];
  dci?: DciItem[];
  contacts?: FundingContact[];
  pdfPage?: number;
}

export const FUNDING_PROGRAMS: FundingProgram[] = [
  // ---------------- HOUSING ----------------
  {
    area: 'housing',
    name: 'Housing Support Program',
    acronym: 'HSP',
    summary:
      'Federal subsidy support for on-reserve housing — from housing strategy/policy and capacity to new construction, purchase, renovations, and energy-efficiency upgrades.',
    funds: [
      'Governance & Capacity: housing policies, plans, training',
      'Housing Support Project: flat-rate subsidy toward new construction/purchase, regular + health-and-safety renovations, energy-efficiency renos (incl. inspection costs)',
    ],
    eligibility:
      'First Nations (NOT individual members — members work through their First Nation Administration). Planned/ongoing projects must be in the FNIIP, in priority order.',
    requirements: [
      'Project listed in your FNIIP (in priority order)',
      'Complete the Governance & Capacity and/or Housing Support Project application(s)',
      'Submit to HousingBC-logementcb@sac-isc.gc.ca',
      'All construction inspected to meet/exceed current BC building + fire codes (BOABC-certified inspector)',
    ],
    paw: [{ no: '460674', name: 'FNIIP (project must be listed)', due: 'Sep 30' }],
    dci: [
      { no: '460671', name: 'Capital Projects Report for Housing Projects (+ Housing Inspection Report + financial summary)', due: 'Jun 30 of the following fiscal year' },
      { no: '41701', name: 'Community Infrastructure and Housing Annual Report', due: 'May 31' },
    ],
    contacts: [{ label: 'Regional Housing Officer', phone: '1-800-665-9320', email: 'HousingBC-logementcb@sac-isc.gc.ca' }],
    pdfPage: 37,
  },
  {
    area: 'housing',
    name: 'Ministerial Loan Guarantee',
    acronym: 'MLG',
    summary:
      'ISC loan guarantees that give lenders the security to finance construction, acquisition, or renovation of on-reserve housing.',
    eligibility: 'First Nations — for both individual-member and Band housing projects (the First Nation applies, not the member directly).',
    requirements: ['First Nation submits the MLG application to ISC on behalf of the individual or Band project'],
    contacts: [{ label: 'Regional Housing Officer', phone: '1-800-665-9320' }],
    pdfPage: 39,
  },
  {
    area: 'housing',
    name: 'First Nations Infrastructure Investment Plan',
    acronym: 'FNIIP',
    summary:
      'The 5-year community-priorities plan (housing, water, schools, roads…) that gates access to nearly every capital + housing program. Build/update it with your Capital Management Officer.',
    eligibility: 'First Nations; developed by Chief & Council with the BC Region Capital Management Officer (CMO).',
    requirements: ['Submit/update at least every other year', 'Projects ranked by health/safety risk, asset life-cycle, water/sewage backlog, sustainability'],
    paw: [{ no: '460674', name: 'FNIIP', due: 'Sep 30' }],
    dci: [
      { no: '41701', name: 'Community Infrastructure and Housing Annual Report', due: 'May 31' },
      { no: '460674', name: 'FNIIP Annual Report', due: 'Sep 30' },
    ],
    contacts: [{ label: 'Capital Management Officer (CMO)', phone: '1-800-665-9320' }],
    pdfPage: 30,
  },

  // ---------------- LANDS & ECONOMIC DEVELOPMENT ----------------
  {
    area: 'lands-economic-development',
    name: 'Lands & Economic Development Services Program — Core',
    acronym: 'LEDSP Core',
    summary: 'Ongoing operational funding for community economic development — planning, capacity, proposal development, and financial resource management.',
    eligibility: 'First Nations and Tribal Councils (built into core funding for Block/NFR Grant agreements).',
    requirements: ['No annual application — funds advanced in your annual allocation'],
    dci: [{ no: '471935', name: 'LEDSP Planned Activities and Report', due: 'May 31' }],
    contacts: [{ label: 'Economic Development Team', email: 'bcledecdev@sac-isc.gc.ca', phone: '604-562-6865' }],
    pdfPage: 56,
  },
  {
    area: 'lands-economic-development',
    name: 'Lands & Economic Development Services Program — Targeted',
    acronym: 'LEDSP Targeted',
    summary: 'Project funding for lands management, environmental management, and economic development activities (Additions-to-Reserve, leases/permits, pollution prevention, capacity).',
    eligibility: 'Block and 10-year Grant funded applicants (not built into Block core budgets).',
    requirements: ['Submit the LEDSP application + supporting documents'],
    paw: [{ no: '6161886', name: 'LEDSP Application', due: 'Intake 1: Mar 1, then continuous (budget permitting)' }],
    dci: [{ no: '472939', name: 'LED Programs Project Status Report', due: 'May 31' }],
    contacts: [{ label: 'Economic Development', email: 'bcecdev@sac-isc.gc.ca' }],
    pdfPage: 57,
  },
  {
    area: 'lands-economic-development',
    name: 'Community Opportunity Readiness Program',
    acronym: 'CORP',
    summary: 'Project funding for community pursuit of revenue-generating economic opportunities — shovel-ready capital, business development, and planning stages.',
    eligibility: 'Block and 10-year Grant funded applicants (not built into core budgets); a community plan supporting the project must be in place.',
    paw: [
      { no: '6161886', name: 'CORP / CORP-PF Application', due: 'Shovel-ready: Intake 1 Nov; planning: Mar 1 (continuous)' },
      { name: 'Requests ≤ $250K', due: 'Mar 15' },
      { name: 'Requests > $250K (capital)', due: 'Dec 3' },
    ],
    dci: [{ no: '472939', name: 'LED Programs Project Status Report', due: 'May 31' }],
    contacts: [{ label: 'Economic Development Team', email: 'bcecdev@isc-sac.gc.ca' }],
    pdfPage: 59,
  },
  {
    area: 'lands-economic-development',
    name: 'Reserve Land & Environment Management Program',
    acronym: 'RLEMP',
    summary: 'Builds First Nation capacity to manage reserve land, resources, and environment under the Indian Act, including operating a lands office.',
    eligibility: 'First Nations under the Indian Act seeking increased land/environment responsibilities.',
    paw: [{ no: '6978371', name: 'RLEMP Expression of Interest', due: 'Ongoing (no deadline)' }],
    dci: [{ no: '10067812', name: 'RLEMP Activity Report', due: 'May 31' }],
    contacts: [{ label: 'Lands Modernization Team', email: 'modernisationdesterres-landsmodernization@sac-isc.gc.ca' }],
    pdfPage: 61,
  },

  // ---------------- EDUCATION ----------------
  {
    area: 'education',
    name: 'BC Tripartite Education Agreement funding',
    acronym: 'BCTEA',
    summary: 'Formula funding for band-operated on-reserve schools (K4-Grade 12) — instruction, special education, language/culture, school operations & maintenance, transportation.',
    eligibility: 'First Nations operating on-reserve schools (all attending students, ages 4-21).',
    requirements: ['Submit the Nominal Roll Report (the registry of eligible students)'],
    dci: [{ name: 'Nominal Roll Report', due: 'Oct 15' }],
    contacts: [{ label: 'ISC BC Region Education', email: 'bceducation@sac-isc.gc.ca', phone: '1-800-567-9604' }],
    pdfPage: 79,
  },
  {
    area: 'education',
    name: 'Post-Secondary Student Support Program',
    acronym: 'PSSSP / UCEPP',
    summary: 'Non-repayable financial support for First Nations (registered) students pursuing post-secondary credentials, plus college/university entrance preparation (UCEPP).',
    eligibility: 'First Nations (registered Indian) students, prioritized by First Nations. (Treaty/Self-Government and Block/NFR Grant Nations differ.)',
    paw: [{ name: 'Post-Secondary Education Protected/General Pool Application', due: 'May 31' }],
    dci: [{ no: '4016769', name: 'Annual Register of Post-Secondary Education Students', due: 'Aug 31' }],
    contacts: [{ label: 'PSE Resource Line (FNESC)', email: 'pse@fnesc.ca', phone: '1-877-280-4151' }],
    pdfPage: 94,
  },

  // ---------------- SOCIAL DEVELOPMENT ----------------
  {
    area: 'social',
    name: 'Income Assistance',
    acronym: 'IA',
    summary: 'Last-resort funding so eligible individuals/families ordinarily resident on reserve can cover basic daily living (food, clothing, shelter), aligned with provincial rates.',
    funds: ['Basic Support Allowance, Shelter Allowance', 'PPMB / Persons with Disabilities assistance', 'Special Needs, Other Benefits, Non-Status Health Benefits'],
    eligibility: 'Individuals/families ordinarily resident on reserve who have exhausted other income sources.',
    requirements: ['Administered by the Band Social Development Worker (BSDW); handbook + forms via the BSDW Policy Support Line'],
    dci: [{ no: '455897A', name: 'Income Assistance Report (quarterly)', due: 'Jul 30, Oct 30, Jan 30, Apr 30' }],
    contacts: [{ label: 'BSDW Policy Support Line', email: 'tsdbsoutien-bsdwsupport-bc@sac-isc.gc.ca', phone: '1-888-440-4080' }],
    pdfPage: 106,
  },
  {
    area: 'social',
    name: 'Assisted Living',
    acronym: 'AL',
    summary: 'Non-medical in-home care, institutional care, and a disabilities initiative to help on-reserve residents maintain independence and safety.',
    eligibility: 'On-reserve residents requiring non-medical support; an assessment is required before in-home delivery.',
    dci: [{ no: '455937', name: 'Assisted Living Report (quarterly)', due: 'Jul 30, Oct 30, Jan 30, Apr 30' }],
    contacts: [{ label: 'BSDW Policy Support Line', email: 'tsdbsoutien-bsdwsupport-bc@sac-isc.gc.ca', phone: '1-888-440-4080' }],
    pdfPage: 118,
  },
  {
    area: 'social',
    name: 'Family Violence Prevention Program',
    acronym: 'FVPP',
    summary: 'Funds emergency shelters + transitional housing operations and community-driven family-violence prevention projects for Indigenous women, children, families, and 2SLGBTQQIA+ people.',
    eligibility: 'First Nations (on/off reserve), shelters, and transitional homes.',
    paw: [{ no: '5664860', name: 'FVPP Project Proposal', due: 'Jan 15' }],
    dci: [
      { no: '455955', name: 'Family Violence Shelter and Transitional Housing Annual Report', due: 'May 31' },
      { no: '1063749', name: 'Family Violence Prevention Project Annual Report', due: 'May 31' },
    ],
    contacts: [{ label: 'Regional Program Development Advisor', email: 'mercy.mura@sac-isc.gc.ca', phone: '604-505-9138' }],
    pdfPage: 123,
  },

  // ---------------- CHILD & FAMILY SERVICES ----------------
  {
    area: 'child-family-services',
    name: "Jordan's Principle",
    summary:
      "Ensures First Nations children get the products, services, and supports they need, when they need them — health, social, and education — reviewed case-by-case (no fixed list).",
    funds: ['Health: therapies, medical equipment, assessments, mental health, transportation', 'Social: support workers, respite, specialized/cultural programs', 'Education: tutoring, assistive tech, school supplies, teaching assistants'],
    eligibility:
      'A First Nations child under the age of majority who is registered/eligible under the Indian Act, has a registered/eligible parent, is recognized by their Nation, or is ordinarily resident on reserve.',
    requirements: ['Contact the 24/7 call centre or your BC service coordinator to start a request (ongoing intake)'],
    dci: [
      { no: 'HC-P111', name: 'Service Delivery Annual Report', due: 'Jul 29' },
      { no: 'HC-P113', name: 'Service Coordination Annual Report', due: 'Jul 29' },
    ],
    contacts: [
      { label: "National Call Centre (24/7) — 1-855-JP-CHILD", phone: '1-855-572-4453' },
      { label: 'BC Region', email: 'principedejordancb-bcjordansprinciple@sac-isc.gc.ca', phone: '778-951-0716' },
    ],
    pdfPage: 135,
  },
  {
    area: 'child-family-services',
    name: 'First Nations Child & Family Services / ICFSA',
    summary:
      'Culturally appropriate prevention + protection services for First Nations children ordinarily resident on reserve, under the reformed (post-CHRT) funding approach — prevention, representative services, post-majority care to age 27.',
    eligibility: 'Children ordinarily resident on reserve, registered or entitled to be registered under the Indian Act; delivered by First Nations and Indigenous Child & Family Services Agencies.',
    requirements: ['Submit the annual Business Plan + delegation confirmation, certificate of good standing, board resolutions'],
    paw: [
      { no: '493710', name: 'Notice of Admission (NOA)', due: 'As a child enters care' },
      { no: '493738', name: 'Notice of Discharge (NOD)', due: 'As a child leaves care' },
    ],
    dci: [{ no: '455917', name: 'Child and Family Services Maintenance Report', due: 'Monthly' }],
    contacts: [{ label: 'BC CFS Unit', email: 'bccfs@sac-isc.gc.ca' }],
    pdfPage: 133,
  },

  // ---------------- HEALTH ----------------
  {
    area: 'health',
    name: 'Health funding (FNHA + ISC health supports)',
    summary:
      'In BC, most First Nations health programming is delivered through the First Nations Health Authority (FNHA) rather than ISC. ISC-side health-related supports flow via social programs and Jordan’s Principle.',
    eligibility: 'See the FNHA for BC health programs; Jordan’s Principle covers health products/services for First Nations children.',
    contacts: [{ label: "Jordan's Principle Call Centre (24/7)", phone: '1-855-572-4453' }],
  },
];

export const fundingByArea = (areaSlug: string): FundingProgram[] =>
  FUNDING_PROGRAMS.filter((p) => p.area === areaSlug);

// Flattened deadline rows for a funding calendar.
export interface DeadlineRow { area: string; program: string; kind: 'Application (PAW)' | 'Report (DCI)'; ref?: string; name: string; due?: string }
export const allDeadlines = (): DeadlineRow[] =>
  FUNDING_PROGRAMS.flatMap((p) => [
    ...(p.paw ?? []).map((x): DeadlineRow => ({ area: p.area, program: p.acronym ?? p.name, kind: 'Application (PAW)', ref: x.no, name: x.name, due: x.due })),
    ...(p.dci ?? []).map((x): DeadlineRow => ({ area: p.area, program: p.acronym ?? p.name, kind: 'Report (DCI)', ref: x.no, name: x.name, due: x.due })),
  ]);
