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

// ISC Chart of Accounts coding (how the program's funds are coded in a funding
// agreement) — Cost Centre → BA/FA code → Funding Type (Block/Grant/Set/Fixed/Flex/
// NFR Grant). From the guide's "Chart of Accounts Reference for Transfer Payments".
export interface FundingCoding { costCentre?: string; baFa?: string; fundingType?: string }

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
  coding?: FundingCoding;
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
  {
    area: 'housing',
    name: 'Capital Facilities and Maintenance Program',
    acronym: 'CFMP',
    summary:
      'The main capital program — plan, construct/acquire, operate, and maintain community facilities, services (incl. schools), and housing per ISC policies and standards.',
    funds: ['Water & wastewater, housing, education facilities, roads/bridges, structural mitigation, fire protection, community buildings', 'Annual O&M for existing assets'],
    eligibility: 'First Nations and other eligible recipients; projects identified in the FNIIP and assessed for technical merit + Level of Service Standards (LOSS).',
    requirements: ['Project in the FNIIP', 'Stage applications (feasibility / design / construction) with Life-Cycle Cost analysis + LOSS compliance'],
    paw: [{ no: '460674', name: 'FNIIP (project must be listed)', due: 'Sep 30' }],
    dci: [
      { no: '41701', name: 'Community Infrastructure and Housing Annual Report', due: 'May 31' },
      { no: '460674', name: 'FNIIP Annual Report', due: 'Sep 30' },
    ],
    contacts: [{ label: 'Capital Management Officer (CMO)', phone: '1-800-665-9320' }],
    pdfPage: 31,
  },
  {
    area: 'housing',
    name: 'First Nations Infrastructure Fund',
    acronym: 'FNIF',
    summary:
      'Complements the CFMP — helps develop, improve, and increase public infrastructure (solid waste, roads/bridges, energy, connectivity, structural mitigation, cultural/recreational facilities), incl. cost-shared projects.',
    eligibility: 'First Nations; priority to high-needs, regional-impact, cost-shared, or partnered projects.',
    requirements: ['No application — ISC regional offices identify, review, and select projects from the FNIIP'],
    dci: [{ no: '460671', name: 'Capital Projects Report', due: '6-month progress; completion within 90 days' }],
    contacts: [{ label: 'Capital Management Officer (CMO)', phone: '1-800-665-9320' }],
    pdfPage: 34,
  },
  {
    area: 'housing',
    name: 'First Nations Water & Wastewater Enhanced Plan',
    acronym: 'FNWWEP',
    summary:
      'A 5-year plan delivering enhancements for community water and wastewater — assessment, operator training (Circuit Rider), policy support, and service agreements. Supports ending long-term drinking-water advisories.',
    eligibility: 'First Nations with an approved FNIIP; financial support for systems serving at least five homes on Band lands.',
    requirements: ['Approved FNIIP + a project submission through the capital approval process'],
    dci: [{ no: '460671', name: 'Capital Projects Report', due: '6-month progress; final within 90 days' }],
    contacts: [{ label: 'Manager, Specialist Services Unit', phone: '604-360-6512' }],
    pdfPage: 42,
  },
  {
    area: 'housing',
    name: 'Operation & Maintenance of Infrastructure',
    acronym: 'O&M',
    summary:
      'Annual funding to operate and maintain community assets recorded in ICMS (water systems, community buildings, fire trucks, roads), cost-shared by asset type.',
    eligibility: 'First Nations with assets recorded in ICMS (built into core funding for Block/NFR Grant agreements).',
    requirements: ['Asset recorded in ICMS — submit completion documents + ICMS Asset Inventory Form to add it', 'Urgent health/safety repairs: submit details + contractor quotes to the CMO'],
    contacts: [
      { label: 'Maintenance Systems Officer', phone: '604-655-4720' },
      { label: 'Capital Management Officer (CMO)', phone: '1-800-665-9320' },
    ],
    pdfPage: 45,
  },
  {
    area: 'housing',
    name: 'Fire Protection',
    summary:
      'CFMP-funded fire-protection support — a subsidy of $60 per household/year for prevention training, home inspections, smoke/CO alarms, extinguishers, and volunteer training; capital items (halls, trucks) go through the FNIIP.',
    eligibility: 'First Nations (formula based on the prior year house count; Block/NFR Grant recipients use core funding).',
    requirements: ['Capital fire requests (from a Fire Safety Assessment) must be in the FNIIP'],
    contacts: [
      { label: 'Regional Program Advisor – Fire Protection', phone: '604-314-1491' },
      { label: "First Nations' Emergency Services Society (FNESS)", phone: '1-888-822-3388' },
    ],
    pdfPage: 48,
  },
  {
    area: 'housing',
    name: 'Extended Asset Condition Reporting System',
    acronym: 'E-ACRS',
    summary:
      'Triennial inspection of on-reserve community assets in ICMS, plus additional funding for "Group 2 Priority Projects" addressing health-and-safety repairs to water/wastewater, fire, and school assets.',
    eligibility: 'On-reserve First Nations with ICMS assets receiving O&M funding (eligible asset types depend on your funding arrangement).',
    requirements: ['Submit the E-ACRS Group 2 Priority Projects Funding Application Form'],
    paw: [{ name: 'E-ACRS Group 2 Priority Projects Application', due: 'May 30' }],
    dci: [{ no: '4548549', name: 'Activities and Expenditure Report (E-ACRS Group 2)', due: 'May 31' }],
    contacts: [{ label: 'Maintenance Systems Officer', phone: '604-655-4720' }],
    pdfPage: 40,
  },
  {
    area: 'housing',
    name: 'Municipal Type Service Agreements',
    acronym: 'MTSA',
    summary:
      'Funds the purchase of essential municipal services from a neighbouring local government or third party — water, wastewater, fire suppression, garbage/recycling, street lighting, 9-1-1 dispatch.',
    eligibility: 'First Nations purchasing municipal-type services (only the portion serving Band-member residences, at 100% of eligible costs).',
    requirements: ['Submit the MTSA Application Template (recalculated each April with a 2% adjustment)'],
    paw: [{ name: 'MTSA Application Template', due: 'Jul 26' }],
    contacts: [{ label: 'Allocation Officer / Project Coordinator', phone: '1-800-665-9390' }],
    pdfPage: 47,
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
  {
    area: 'lands-economic-development',
    name: 'First Nations Land Management',
    acronym: 'FNLM',
    summary:
      'Lets a First Nation move out from 44 land/resource/environment sections of the Indian Act and make its own land, environment, and resource laws under its own Land Code.',
    eligibility: 'First Nations entering the FNLM initiative; the first step is a Band Council Resolution (accepted on an ongoing basis).',
    requirements: ['No PAW — entry begins with a Band Council Resolution', 'Developmental phase: develop a land code, negotiate an Individual Agreement, hold a ratification vote'],
    contacts: [{ label: 'Lands Modernization Team', email: 'modernisationdesterres-landsmodernization@sac-isc.gc.ca' }],
    pdfPage: 63,
  },
  {
    area: 'lands-economic-development',
    name: 'Contaminated Sites On-Reserve (FCSAP/CSOR)',
    summary:
      'Federal program addressing contaminated sites on reserve — assessment, remediation/risk management, and care & maintenance — prioritized by human-health and ecological risk.',
    eligibility: 'First Nations with known or newly identified on-reserve contaminated sites (tracked in IEMS).',
    dci: [{ no: '472939', name: 'LED Project Status Report', due: '6-month intervals + within 90 days of completion' }],
    contacts: [{ label: 'Contaminated Sites Team', email: 'bccontaminatedsites@sac-isc.gc.ca', phone: '604-404-2045' }],
    pdfPage: 65,
  },

  // ---- Community Development / Governance (band administration) ----
  {
    area: 'lands-economic-development',
    name: 'Band Support Funding',
    acronym: 'BSF',
    summary:
      'A grant to band councils for the costs of local government and the administration of departmentally funded services — policy, representation, and efficient service delivery.',
    eligibility: 'First Nations (built into core funding for Block/NFR Grant agreements — they only apply when renewing/entering an agreement).',
    paw: [{ no: '41814', name: 'Band Support Funding Application', due: 'Jan 10' }],
    contacts: [{ label: 'Manager, Governance and Capacity Development', phone: '236-330-4999' }],
    pdfPage: 17,
  },
  {
    area: 'lands-economic-development',
    name: 'Employee Benefits',
    acronym: 'EB',
    summary:
      "Funds the employer's share of contributions to eligible employees' pension plans, CPP/QPP, and additional benefits (capped percentages).",
    eligibility: 'Eligible First Nations and Tribal Councils (built into core funding for Block agreements).',
    paw: [{ no: '41802', name: 'Employee Benefits Application', due: 'Jan 10' }],
    dci: [{ no: '41784', name: 'Employee Benefits Report', due: 'Apr 30' }],
    contacts: [{ label: 'Manager, Governance and Capacity Development', phone: '236-330-4999' }],
    pdfPage: 18,
  },
  {
    area: 'lands-economic-development',
    name: 'Tribal Council Funding',
    acronym: 'TCF',
    summary: 'Supports the core operations of Tribal Councils so they can deliver programs/services to member First Nations and build capacity.',
    eligibility: 'Tribal Councils (tiered funding by number of member Nations, on-reserve population, and ongoing programs).',
    requirements: ['Work plan must deliver programs/services + capacity (core-admin-only plans are not eligible)'],
    paw: [{ no: '5814375', name: 'Tribal Council Funding Application (+ Certificate of Good Standing)', due: 'Jan 10' }],
    dci: [{ no: '5814389', name: 'Tribal Council Funding Report', due: 'Apr 30' }],
    contacts: [{ label: 'Manager, Governance and Capacity Development', phone: '236-330-4999' }],
    pdfPage: 20,
  },
  {
    area: 'lands-economic-development',
    name: 'Professional & Institutional Development',
    acronym: 'P&ID',
    summary:
      'Proposal-based funding to develop core governance capacity — leadership/governance training, financial & HR policies, custom election codes, strategic planning.',
    eligibility: 'First Nations (incl. Block and NFR Grant funded); a call for proposals runs annually (~6 weeks).',
    requirements: ['Project must be completed within the fiscal year', 'Include activities, deliverables, budget, timeline + quotes for consultants/training'],
    paw: [{ no: '638262', name: 'Project or Work Plan Funding Application', due: 'Annual call (~6 weeks); accepted year-round until allocated' }],
    dci: [{ no: '4548549', name: 'Activity and Expenditure Report — P&ID', due: 'May 31' }],
    contacts: [{ label: 'P&ID General Inquiries', email: 'bcregionpid@sac-isc.gc.ca' }],
    pdfPage: 21,
  },

  // ---- Emergency Management (cross-cutting; closest area) ----
  {
    area: 'lands-economic-development',
    name: 'Emergency Management Assistance Program',
    acronym: 'EMAP',
    summary:
      'Supports all four pillars of emergency management on reserve — mitigation, preparedness, response, and recovery (wildfire, flooding, severe weather). For an active emergency, call EMCR first: 1-800-663-3456 (24/7).',
    funds: ['Preparedness & non-structural mitigation: risk assessment, hazard mapping, plans, training, exercises', 'Response: 100% of eligible response costs (via EMCR)', 'Recovery: restoration of essential infrastructure + Building Back Better supports'],
    eligibility: 'First Nations on reserve in BC.',
    requirements: ['Mitigation/Preparedness: submit the application (annual funding call + ongoing intake)', 'Response/Recovery: work through EMCR — no deadline to apply'],
    paw: [{ no: '6978382', name: 'Non-Structural Mitigation & Preparedness Application', due: 'Annual call + ongoing' }],
    dci: [{ no: '4548549', name: 'Activities and Expenditures Report', due: 'May 31' }],
    contacts: [
      { label: 'Emergency Management Duty Officer', email: 'bcaandc.do@sac-isc.gc.ca', phone: '604-209-9709' },
      { label: 'EMCR Emergency Coordination Centre (report an emergency, 24/7)', phone: '1-800-663-3456' },
    ],
    pdfPage: 146,
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
  {
    area: 'education',
    name: 'Public & Independent School Tuition',
    summary:
      'Pays tuition for eligible on-reserve students (K-Grade 12) attending public or off-reserve independent schools, at the First Nation Student Rate for the district.',
    eligibility: 'On-reserve students on the Nominal Roll. A Local Education Agreement (LEA) lets funds be paid to the Nation directly (required for 10+ students at an independent school).',
    requirements: ['Submit the Nominal Roll + Education Staff Census Report', 'New/renewed LEAs due to ISC by Oct 15'],
    dci: [{ name: 'Nominal Roll + Education Staff Census Report', due: 'Oct 15' }],
    contacts: [{ label: 'ISC BC Region Education', email: 'bceducation@sac-isc.gc.ca', phone: '1-800-567-9604' }],
    pdfPage: 81,
  },
  {
    area: 'education',
    name: 'Elementary/Secondary student supports',
    summary:
      'Per-student supplements for on-reserve K-12 students (any school type), all driven by the annual Nominal Roll.',
    funds: [
      'Ancillary Services — $287/student/yr (supplies, equipment, specialized services)',
      'Comprehensive Instructional Support (CISS) — $221/student/yr',
      'Guidance & Counselling — $179/student/yr (+ $1,094 per student with approved accommodation)',
      'Menstrual Products — $154/eligible student/yr',
      'Financial Assistance (Student Allowance) — grades 8-12 ($144-$431/student/yr)',
    ],
    eligibility: 'Students reported on the Nominal Roll.',
    dci: [{ name: 'Nominal Roll + Education Staff Census Report', due: 'Oct 15' }],
    contacts: [{ label: 'ISC BC Region Education', email: 'bceducation@sac-isc.gc.ca', phone: '1-800-567-9604' }],
    pdfPage: 84,
  },
  {
    area: 'education',
    name: 'Student Accommodation Services',
    summary:
      'Funds room-and-board and related costs for school-age students (4-21) who must leave their home community to attend school (no suitable local school, medical access, or other documented need).',
    eligibility: 'School-age students (4-21) ordinarily resident on reserve before relocating. Adults 21+ are not eligible.',
    requirements: ['Email Education Programs with supporting documentation (annual medical certificate for medical cases)', 'Reflect accommodation on the Nominal Roll'],
    dci: [{ name: 'Nominal Roll + Education Staff Census Report', due: 'Oct 15' }],
    contacts: [{ label: 'ISC BC Region Education', email: 'bceducation@sac-isc.gc.ca', phone: '1-800-567-9604' }],
    pdfPage: 86,
  },
  {
    area: 'education',
    name: 'First Nations & Inuit Cultural Education Centre Program',
    acronym: 'CECP',
    summary:
      'Funds cultural education centres to develop and promote First Nations culture, revive traditional skills, and support traditional languages.',
    eligibility: 'Previously-funded centres (apply annually to FNCCEC) or BC Region proposals.',
    paw: [{ no: '515410', name: 'Cultural Education Centres Program Proposal', due: 'May 6 (BC Region proposals May 7)' }],
    dci: [{ no: '515786', name: 'Cultural Education Centres Program Report', due: 'Jun 30' }],
    contacts: [{ label: 'FNCCEC', email: 'ILCProgram@fnccec.ca' }],
    pdfPage: 91,
  },
  {
    area: 'education',
    name: 'Post-Secondary Partnerships Program',
    acronym: 'PSPP',
    summary:
      'First Nations-directed, proposal-based funding for First Nations post-secondary institutions and community-based programming, to increase the number of students pursuing post-secondary education.',
    eligibility: 'Determined through the BC call for proposals administered by FNESC (with IAHLA).',
    requirements: ['Submit a Post-Secondary Partnership Program Proposal via the FNESC call for proposals'],
    contacts: [{ label: 'FNESC PSE Allocations', email: 'pseallocations@fnesc.ca', phone: '1-877-422-3672' }],
    pdfPage: 96,
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
  {
    area: 'social',
    name: 'Pre-Employment Supports Program',
    acronym: 'PES',
    summary:
      'Case-management and pre-employment supports to help Income Assistance clients move toward employment, delivered through 8 sites serving 49 First Nations.',
    eligibility: 'IA clients aged 18-64 "expected to work" in the catchment communities (incl. PPMB/PWD).',
    requirements: ['A Band Resolution from First Nation leadership is required to participate', 'Subject to available targeted funding'],
    dci: [{ no: '455897A', name: 'Income Assistance Report — PES (quarterly)', due: 'Apr 30, Jul 30, Oct 30, Jan 30' }],
    contacts: [{ label: 'ISC BC Region', email: 'BCEducation@sac-isc.gc.ca' }],
    pdfPage: 116,
  },
  {
    area: 'social',
    name: 'Urban Programming for Indigenous Peoples',
    acronym: 'UPIP',
    summary:
      'Supports holistic, culturally appropriate programs and services for Indigenous Peoples living in or transitioning to urban centres. In BC, the Coalitions funding stream is managed regionally.',
    eligibility: 'Indigenous partner organizations/coalitions (BC Region manages the Coalitions stream).',
    dci: [{ no: '10868729', name: 'Urban Programming for Indigenous Peoples Report', due: 'Jul 29' }],
    contacts: [{ label: 'Regional Program Development Advisor', email: 'Mercy.mura@sac-isc.gc.ca', phone: '604-505-9138' }],
    pdfPage: 125,
  },
  {
    area: 'social',
    name: 'Basic Organizational Capacity',
    acronym: 'BOC',
    summary:
      'Regional "core" funding for eligible Indigenous Representative Organizations that represent the interests of their members.',
    eligibility: 'The three eligible BC Region organizations: Union of BC Indian Chiefs, First Nations Summit Society, BC Assembly of First Nations.',
    paw: [{ no: '1323247', name: 'Basic Organizational Capacity Contribution Program Funding Application', due: 'Dec 11' }],
    dci: [{ no: '1323248', name: 'Basic Organizational Capacity Program Annual Report', due: 'Apr 30' }],
    contacts: [{ label: 'Social Programs', phone: '1-888-440-4080' }],
    pdfPage: 126,
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
  {
    area: 'child-family-services',
    name: 'CFS Reform — Jurisdiction & Engagement',
    summary:
      'Supports First Nations exercising jurisdiction over child and family services under the federal Act (in force Jan 1, 2020) — capacity-building, coordination-agreement discussions, and implementing community CFS models.',
    eligibility: 'Indigenous governing bodies and section 35 rights-holding communities.',
    requirements: ['Application package: work plan, budget, and Indigenous governing body authorization (e.g. Band Council Resolution)', 'Continuous intake — submission recommended by early December for the fiscal year'],
    dci: [{ no: '4548549', name: 'Activities & Expenditures Report — Jurisdiction Capacity Development', due: 'Apr 30' }],
    contacts: [{ label: 'BC Jurisdiction & Engagement', email: 'bccfsjurisdiction-juridiction@sac-isc.gc.ca' }],
    pdfPage: 139,
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

// ---------------------------------------------------------------------------
// Chart of Accounts coding, applied to the programs above by key (acronym, then
// name). Cost Centre / BA-FA / Funding Type from the guide's "ISC Chart of
// Accounts Reference for Transfer Payments" (pp. 172-188).
const CODING_BY_KEY: Record<string, FundingCoding> = {
  // Infrastructure & housing (A0906x; block O&M under A09020)
  HSP: { costCentre: 'A0906E', baFa: 'B5812 (On-reserve housing, constr & reno)', fundingType: 'Fixed/Flex/Set' },
  CFMP: { costCentre: 'A0906B/D', baFa: 'B5618/B5911 (capital facilities)', fundingType: 'Fixed/Flex/Set' },
  FNIF: { costCentre: 'A0906D', baFa: 'B5913 (FN Infrastructure Fund)', fundingType: 'Fixed/Flex/Set' },
  FNWWEP: { costCentre: 'A0906D', baFa: 'B5618/B5619 (water & wastewater)', fundingType: 'Fixed/Flex/Set' },
  'O&M': { costCentre: 'A0906E', baFa: 'B5912 (O&M of infra assets)', fundingType: 'Fixed/Flex/Set' },
  'Fire Protection': { costCentre: 'A0906E', baFa: 'B5912 / Q3BG (Fire protection)', fundingType: 'Fixed/Flex/Grant/Set' },
  'E-ACRS': { costCentre: 'A0906B', baFa: 'B5912 / Q3BP (Asset Condition Reporting)', fundingType: 'Fixed/Flex/Set' },
  MTSA: { costCentre: 'A0906E', baFa: 'B5912 / Q3BJ (Municipal services)', fundingType: 'Fixed/Flex/Set' },
  // Lands & Economic Development (A0904x)
  'LEDSP Core': { costCentre: 'A09020 / A0904F', baFa: 'B6217/B6218 (LEDSP Core)', fundingType: 'Block · Fixed/Flex/Set' },
  'LEDSP Targeted': { costCentre: 'A0904A', baFa: 'B6219 (LEDSP Targeted)', fundingType: 'Fixed/Flex/Set' },
  CORP: { costCentre: 'A0904A', baFa: 'B6215 (Comm. Opportunity Readiness)', fundingType: 'Fixed/Flex/Set' },
  RLEMP: { costCentre: 'A0904C', baFa: 'B6311 (Reserve Land & Env Mgmt)', fundingType: 'Fixed/Flex/Set' },
  FNLM: { costCentre: 'A0904C', baFa: 'B6340 (FN Land Mgmt Initiative)', fundingType: 'Fixed/Flex/Grant/Set' },
  // Governance / IGS (A0907D; Band Support Funding is a Grant)
  BSF: { costCentre: 'A0907D', baFa: 'B5511 / Q31K (Band Support Funding)', fundingType: 'Grant' },
  EB: { costCentre: 'A0907D', baFa: 'B5512 (Band Employee Benefits)', fundingType: 'Fixed/Flex/Set' },
  TCF: { costCentre: 'A0907D', baFa: 'B5521 / Q34L (Tribal Council Funding)', fundingType: 'Fixed/Set' },
  'P&ID': { costCentre: 'A0907D', baFa: 'B5516 (Prof & Inst Development)', fundingType: 'Fixed/Flex/Set' },
  // Emergency Management (A0903A)
  EMAP: { costCentre: 'A0903A', baFa: 'B601x (Emergency Mgmt Assistance)', fundingType: 'Fixed/Flex/Set' },
  // Education (A0903B)
  BCTEA: { costCentre: 'A0903B', baFa: 'B3430 / Q2LH (FN School Formula)', fundingType: 'Fixed/Flex/Set' },
  'PSSSP / UCEPP': { costCentre: 'A0903B', baFa: 'B3421 / Q29A (Post-Secondary Student Support)', fundingType: 'Fixed/Flex/Grant/Set' },
  CECP: { costCentre: 'A0903B', baFa: 'B3416 (Cultural Education Centres)', fundingType: 'Fixed/Flex/Set' },
  'Public & Independent School Tuition': { costCentre: 'A0903B', baFa: 'B3430 / Q2LL·Q2LM (tuition)', fundingType: 'Fixed/Flex/Set' },
  // Social development (A0903D)
  IA: { costCentre: 'A0903D', baFa: 'B3511 (Income Assistance — Basic Needs)', fundingType: 'Fixed/Flex/Grant/Set' },
  AL: { costCentre: 'A0903D', baFa: 'B3611 (Assisted Living)', fundingType: 'Fixed/Flex/Grant/Set' },
  FVPP: { costCentre: 'A0903D', baFa: 'B3810 (Family Violence)', fundingType: 'Fixed/Flex/Set' },
  // Child & Family Services (A0908x)
  "Jordan's Principle": { costCentre: 'A0908B', baFa: 'B2610 (Jordan’s Principle)', fundingType: 'Fixed/Flex/Set' },
};
for (const p of FUNDING_PROGRAMS) {
  const c = (p.acronym && CODING_BY_KEY[p.acronym]) ?? CODING_BY_KEY[p.name];
  if (c) p.coding = c;
}

// Program-level view of the ISC Chart of Accounts (guide pp. 172-188): the major
// cost centres + the activities a band administrator uses to code program funds.
// Not every micro-row. Funding types: Block, Grant, Set, Fixed, Flex, NFR Grant.
export interface ChartOfAccountsRow { costCentre: string; baFa?: string; description: string; fundingType?: string }
export const CHART_OF_ACCOUNTS: ChartOfAccountsRow[] = [
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

// Commonly Used Acronyms (guide pp. 189-192) — so the UI can expand jargon for
// people who don't know it. + EMAP (used throughout but not in the guide's list).
export const ACRONYMS: Record<string, string> = {
  ABDP: 'Aboriginal Business Development Program',
  ACRS: 'Asset Condition Reporting System',
  AEP: 'Aboriginal Entrepreneurship Program',
  AFI: 'Aboriginal Financial Institutions',
  AFOA: 'Aboriginal Financial Officers Association of British Columbia',
  AIHC: 'Adult In-Home Care',
  AL: 'Assisted Living',
  BCCI: 'British Columbia Capacity Initiative',
  BCF: 'Building Canada Fund or Block Contribution Funding',
  BCR: 'Band Council Resolution',
  BOABC: 'Building Officers Association of BC',
  BOC: 'Basic Organizational Capacity',
  BSF: 'Band Support Funding',
  CAIS: 'Capital Asset Inventory System',
  CCAP: 'Climate Change Adaptation Program',
  CCP: 'Comprehensive Community Planning',
  CECP: 'Cultural Education Centre Program',
  CEDP: 'Community Economic Development Program',
  CEOP: 'Community Economic Opportunity Program',
  CFMP: 'Capital and Facilities Maintenance Program',
  CFS: 'Child and Family Services',
  CI: 'Community Infrastructure',
  CIRNAC: 'Crown-Indigenous Relations and Northern Affairs Canada',
  CISS: 'Comprehensive Instructional Support Service',
  CMHC: 'Canadian Mortgage & Housing Corporation',
  CMO: 'Capital Management Officer',
  COPH: 'Child Out of Parental Home',
  CORP: 'Community Opportunities Readiness Program',
  CPP: 'Canada Pension Plan',
  CRT: 'Circuit Rider Trainers',
  CRTP: 'Circuit Rider Training Program',
  CSMP: 'Contaminated Sites Management Program',
  CSSP: 'Community Support Services Program',
  DCI: 'Data Collection Instrument',
  EANCP: 'EcoEnergy for Aboriginal and Northern Communities Program',
  EB: 'Employee Benefits',
  ECC: 'Emergency Coordination Center',
  EIS: 'Education Information System',
  EMAP: 'Emergency Management Assistance Program',
  EMBC: 'Emergency Management British Columbia',
  ERAS: 'Education Reporting Access System',
  ESD: 'Enhanced Service Delivery',
  ESDC: 'Employment and Social Development Canada',
  FCSAP: 'Federal Contaminated Site Action Plan',
  FFA: 'Fiscal Financing Agreement',
  FN: 'First Nation',
  FNCCEC: 'First Nation Confederacy of Cultural Education Centres',
  FNCFS: 'First Nations Child and Family Services',
  FNCIDA: 'First Nations Commercial and Industrial Development Act',
  FNESC: 'First Nations Education Steering Committee Society',
  FNESS: 'First Nations Emergency Services Society',
  FNFTA: 'First Nations Financial Transparency Act',
  FNIF: 'First Nations Infrastructure Fund',
  FNIIP: 'First Nations Infrastructure and Investment Plan',
  FNIYES: 'First Nations and Inuit Employment Strategy',
  FNLMA: 'First Nations Land Management Act',
  FNMHF: 'First Nation Market Housing Fund',
  FNNBOA: 'First Nations National Building Officers Association',
  FNPO: 'First Nation Political Organization',
  FNSA: 'First Nations Schools Association',
  FNWWEP: 'First Nations Water & Wastewater Action Plan',
  FS: 'Funding Services',
  FSA: 'Fire Safety Assessment',
  FSO: 'Funding Services Officer',
  FTE: 'Full-Time Equivalent',
  FTP: 'Flexible Transfer Payment',
  FVPP: 'Family Violence Prevention Program',
  GA: 'General Assessment',
  GCIMS: 'Grants and Contributions Information Management System',
  GEDS: 'Government Electronic Directory Service',
  GFR: 'Gross Funding Requirement',
  GTF: 'Gas Tax Fund',
  'H&I': 'Housing and Infrastructure',
  HCSEP: 'High Cost Special Education Program',
  HQ: 'Headquarters',
  IA: 'Income Assistance',
  ICMS: 'Integrated Capital Management System',
  IEMS: 'Integrated Environment Management System',
  IGS: 'Indian Government Support',
  IRO: 'Indigenous Representative Organization',
  IRS: 'Indian Registry System',
  ISC: 'Indigenous Services Canada',
  'LAB-RC': 'Land Management Resource Centre',
  LEA: 'Local Education Agreement',
  LEAF: 'Lands and Environment Action Fund',
  LED: 'Lands and Economic Development',
  LEDSP: 'Lands and Economic Development Services Program',
  LOSS: 'Level of Service Standard',
  MCF: 'Management Control Framework',
  MCFD: 'Ministry for Children and Family Development',
  MLG: 'Ministerial Loan Guarantee',
  MOU: 'Memorandum of Understanding',
  MPIF: 'Major Projects and Investment Fund',
  MTSA: 'Municipal Type Service Agreement',
  NAHS: 'New Approach for Housing Support',
  NCBR: 'National Child Benefit Reinvestment',
  NFR: 'New Fiscal Relationship',
  NHQ: 'National Headquarters',
  NoA: 'Notice of Admission',
  NoD: 'Notice of Discharge',
  NR: 'Nominal Roll',
  NTCF: 'Notice to Commit Funds',
  'O&M': 'Operations & Maintenance',
  OGM: 'Operating Grants Manual',
  OSFI: 'Office of the Superintendent of Financial Institutions',
  OSR: 'Own Source Revenue',
  'P&ID': 'Professional & Institutional Development',
  PAR: 'Project Approval Request',
  PAW: 'Proposal, Application and Work plan',
  PIFI: 'Protocol for ISC Funded Infrastructure',
  PPMB: 'Persons with Persistent Multiple Barriers',
  PSAB: 'Procurement Strategy for Aboriginal Business',
  PSAR: 'Project and Specific Agreement Recipient',
  PSE: 'Post-Secondary Education',
  PSPP: 'Post-Secondary Partnership Program',
  PSSR: 'Post-Secondary Student Registry',
  PSSSP: 'Post-Secondary Student Support Program',
  PTO: 'Provincial/Territorial Organization',
  PTP: 'Policy on Transfer Payments',
  PWD: 'Persons with Disabilities',
  RG: 'Reporting Guide',
  RLAP: 'Regional Land Administration Program',
  RLEMP: 'Reserve Land and Environmental Management Program',
  RRAP: 'Residential Rehabilitation Assistance Program',
  SCIS: 'Secure Certificate of Indian Status Card',
  SDU: 'Service Delivery Unit',
  SMRT: 'Structural Mitigation Ranking Tool',
  SOFI: 'Statements of Financial Information',
  SOI: 'Statement of Intent',
  SPI: 'Strategic Partnership Initiative',
  SPRF: 'School Priority Ranking Framework',
  SS: 'Special Students',
  'T&C': 'Terms & Conditions',
  TAG: 'Treaties and Aboriginal Government',
  TB: 'Treasury Board',
  TBS: 'Treasury Board Secretariat',
  TC: 'Tribal Council',
  TCF: 'Tribal Council Funding',
  TEFA: 'Tripartite Education Framework Agreement',
  TRM: 'Treaty Related Measures',
  UCEP: 'University and College Entrance Program',
  WOP: 'Work Opportunity Program',
};

const ACRONYM_INDEX: Record<string, string> = Object.fromEntries(
  Object.entries(ACRONYMS).map(([k, v]) => [k.toUpperCase(), v]),
);
// Case-insensitive acronym lookup, e.g. expandAcronym('paw') → 'Proposal, Application and Work plan'.
export function expandAcronym(acr: string): string | undefined {
  return acr ? ACRONYM_INDEX[acr.toUpperCase()] : undefined;
}
