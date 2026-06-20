// Starter values for the ExpenseTag catalog — the "tags" (expense categories)
// shown on the AddExpense screen and curated in the Tag Manager. Seeded once on
// startup (idempotent: skipped if any ExpenseTag row exists). Admins add / edit
// / deactivate from the UI thereafter; Claude suggests a tag from this list.

export interface SeedExpenseTag {
  slug: string;
  label: string;
}

export const EXPENSE_TAG_SEED: SeedExpenseTag[] = [
  { slug: 'travel',              label: 'Travel' },
  { slug: 'meals',               label: 'Meals & Entertainment' },
  { slug: 'fuel-mileage',        label: 'Fuel / Mileage' },
  { slug: 'accommodation',       label: 'Accommodation' },
  { slug: 'office-supplies',     label: 'Office Supplies' },
  { slug: 'equipment',           label: 'Equipment' },
  { slug: 'professional-services', label: 'Professional Services' },
  { slug: 'training',            label: 'Training & Conferences' },
  { slug: 'utilities',           label: 'Utilities' },
  { slug: 'telecom',             label: 'Telecom / Internet' },
  { slug: 'postage-shipping',    label: 'Postage & Shipping' },
  { slug: 'bank-fees',           label: 'Bank / Admin Fees' },
  { slug: 'vehicle-repairs',     label: 'Vehicle / Repairs' },
  { slug: 'software',            label: 'Subscriptions / Software' },
  { slug: 'honoraria',           label: 'Honoraria' },
  { slug: 'miscellaneous',       label: 'Miscellaneous' },
];
