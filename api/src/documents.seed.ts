// Starter values for the DocumentTag catalog — seeded once on startup
// (idempotent: skipped if any row exists for that category+slug). Admins
// add/edit/delete from the Tag Manager UI thereafter.
//
// See docs/features/documents-and-onboarding.md → Tag taxonomy.

export interface SeedTag {
  category: 'gov' | 'gov_sector' | 'department' | 'records';
  slug: string;
  displayName: string;
}

export const DOCUMENT_TAG_SEED: SeedTag[] = [
  // Single gov flag — present means "this is a government doc".
  { category: 'gov', slug: 'gov', displayName: 'Gov' },

  // Sectors — Skin Tyee's program/funding areas (mirrors the ISC First Nations
  // program sectors). These are the top-level sector tags.
  { category: 'gov_sector', slug: 'registration-governance',     displayName: 'Registration & Governance' },
  { category: 'gov_sector', slug: 'education',                   displayName: 'Education' },
  { category: 'gov_sector', slug: 'lands-economic-development',  displayName: 'Lands & Economic Development' },
  { category: 'gov_sector', slug: 'social',                      displayName: 'Social' },
  { category: 'gov_sector', slug: 'housing',                    displayName: 'Housing' },
  { category: 'gov_sector', slug: 'child-family-services',       displayName: 'Child & Family Services' },
  { category: 'gov_sector', slug: 'health',                     displayName: 'Health' },

  // Departments — mirrors Skin Tyee's internal departments
  // (intersection with skintyee-groups.ts).
  { category: 'department', slug: 'housing',  displayName: 'Housing' },
  { category: 'department', slug: 'forestry', displayName: 'Forestry' },
  { category: 'department', slug: 'finance',  displayName: 'Finance' },
  { category: 'department', slug: 'gis',      displayName: 'GIS' },

  // Records — accounts-payable / payroll document types managed by the app
  // (Band Admin EFTs, payroll slips, expense sheets, mileage logs, timesheets).
  // The seeded CRA/Service Canada forms (T4, ROE, …) file under these.
  { category: 'records', slug: 'band-admin-efts', displayName: 'Band Admin EFTs' },
  { category: 'records', slug: 'payroll-slips',   displayName: 'Payroll Slips' },
  { category: 'records', slug: 'expense-sheets',  displayName: 'Expense Sheets' },
  { category: 'records', slug: 'mileage-records', displayName: 'Mileage Records' },
  { category: 'records', slug: 'timesheets',      displayName: 'Timesheets' },
];

// Category labels for the UI catalog endpoint.
export const TAG_CATEGORIES: Array<{ slug: 'gov' | 'gov_sector' | 'department' | 'records'; displayName: string; description: string }> = [
  { slug: 'gov',         displayName: 'Government',  description: 'Flag a document as government-issued (single tag, on/off).' },
  { slug: 'gov_sector',  displayName: 'Categories',  description: 'Skin Tyee program/funding sector the document concerns (Registration & Governance, Education, Health, …).' },
  { slug: 'department',  displayName: 'Department',  description: 'Which internal Skin Tyee department owns it.' },
  { slug: 'records',     displayName: 'Records',     description: 'Accounts-payable / payroll document type (EFTs, payroll slips, expense sheets, mileage, timesheets).' },
];
