// Reusable onboarding model — pure data + helpers, safe to import from client or server
// components (no Node APIs). The server-only store/status reader lives in onboarding-store.ts.
//
// Mirrors the @skintyee/app "documents & onboarding" flow, but driven from the website:
// a contractor/staff member uploads their onboarding documents, and can see their own
// status. WordPress has no approval workflow, so approval is set out-of-band (in the app /
// finance system) and the website simply *reflects* it — when approved, we surface it under
// the user menu and hide the Onboarding nav item.

export type OnboardingStatus = 'not-started' | 'in-progress' | 'submitted' | 'approved';

export interface OnboardingDocument {
  key: string;
  label: string;
  description: string;
  required: boolean;
}

// The document checklist. Reused by the page checklist and the status computation.
export const ONBOARDING_DOCUMENTS: OnboardingDocument[] = [
  { key: 'photo-id', label: 'Government photo ID', description: "Driver's licence, status card, or passport.", required: true },
  { key: 'direct-deposit', label: 'Direct deposit', description: 'Void cheque or a bank-issued direct-deposit form.', required: true },
  { key: 'tax-forms', label: 'Tax forms (TD1)', description: 'Federal + BC TD1 personal tax credits return.', required: true },
  { key: 'agreement', label: 'Signed agreement', description: 'Your signed contract / employment or contractor agreement.', required: true },
  { key: 'insurance', label: 'Insurance / WorkSafeBC', description: 'Contractors: proof of liability insurance + WorkSafeBC clearance.', required: false },
  { key: 'safety', label: 'Safety orientation', description: 'Signed acknowledgement of the safety orientation.', required: false },
];

export const REQUIRED_DOC_KEYS = ONBOARDING_DOCUMENTS.filter((d) => d.required).map((d) => d.key);

export const ONBOARDING_STATUS_META: Record<OnboardingStatus, { label: string; color: string; description: string }> = {
  'not-started': { label: 'Not started', color: '#9AA0A6', description: 'You have not uploaded any onboarding documents yet.' },
  'in-progress': { label: 'In progress', color: '#EC6A37', description: 'Some documents are uploaded — a few required ones are still outstanding.' },
  submitted: { label: 'Submitted', color: '#00B8EC', description: 'All required documents are in. Your onboarding is awaiting review.' },
  approved: { label: 'Approved', color: '#5C9E31', description: 'Your onboarding is complete and approved.' },
};

// Derive the status from which document keys have been uploaded + the (external) approval flag.
export function computeOnboardingStatus(uploaded: string[], approved: boolean): OnboardingStatus {
  if (approved) return 'approved';
  const have = new Set(uploaded);
  const haveAllRequired = REQUIRED_DOC_KEYS.every((k) => have.has(k));
  if (haveAllRequired) return 'submitted';
  return uploaded.length ? 'in-progress' : 'not-started';
}

// Stable, filesystem-safe key for a user (used as the per-user store folder).
export const onboardingUserKey = (idOrEmail: string) =>
  idOrEmail.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
