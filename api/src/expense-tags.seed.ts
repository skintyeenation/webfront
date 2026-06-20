// Starter values for the ExpenseTag catalog — the "tags" (expense categories)
// shown on the AddExpense screen and curated in the Tag Manager. Seeded once on
// startup (idempotent: skipped if any ExpenseTag row exists). Admins add / edit
// / deactivate from the UI thereafter; Claude suggests a tag from this list.
//
// `glAccount` is the General Ledger account number each category posts to — the
// accounting key that lets finance map a tagged receipt straight into Adagio /
// Sage 300 (the ASAP suite). The 5xxx codes below are a conventional expense
// chart-of-accounts placeholder; finance edits them in the Tag Manager to match
// the band's actual ledger.

export interface SeedExpenseTag {
  slug: string;
  label: string;
  glAccount: string;
}

export const EXPENSE_TAG_SEED: SeedExpenseTag[] = [
  { slug: 'travel',                label: 'Travel',                  glAccount: '5010' },
  { slug: 'meals',                 label: 'Meals & Entertainment',   glAccount: '5020' },
  { slug: 'fuel-mileage',          label: 'Fuel / Mileage',          glAccount: '5030' },
  { slug: 'accommodation',         label: 'Accommodation',           glAccount: '5040' },
  { slug: 'office-supplies',       label: 'Office Supplies',         glAccount: '5050' },
  { slug: 'equipment',             label: 'Equipment',               glAccount: '5060' },
  { slug: 'professional-services', label: 'Professional Services',   glAccount: '5070' },
  { slug: 'training',              label: 'Training & Conferences',  glAccount: '5080' },
  { slug: 'utilities',             label: 'Utilities',               glAccount: '5090' },
  { slug: 'telecom',               label: 'Telecom / Internet',      glAccount: '5100' },
  { slug: 'postage-shipping',      label: 'Postage & Shipping',      glAccount: '5110' },
  { slug: 'bank-fees',             label: 'Bank / Admin Fees',       glAccount: '5120' },
  { slug: 'vehicle-repairs',       label: 'Vehicle / Repairs',       glAccount: '5130' },
  { slug: 'software',              label: 'Subscriptions / Software', glAccount: '5140' },
  { slug: 'honoraria',             label: 'Honoraria',               glAccount: '5150' },
  { slug: 'miscellaneous',         label: 'Miscellaneous',           glAccount: '5900' },
];
