// Onboarding view-model + helpers — the website renders the SAME onboarding data the app does,
// read live from the api/ (Skin Tyee band app api + db) via the api-client. These are the
// display shapes the page/components consume; the api-backed fetch + DTO→view-model adapters
// live in onboarding-data.ts (server-only). Pure (no Node deps) — client-safe.

export type StepCompletion = 'admin_marks' | 'person_uploads' | 'both';
export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';
export type OnboardingOverall = 'pending' | 'in_progress' | 'completed';

// A document attached to a step (resolved from the api/ documents store). `viewable` means it
// can be opened inline (PDF/image) vs download-only.
export interface StepDoc {
  documentId: string;
  title: string;
  mimeType?: string;
  viewable: boolean;
}

export interface OnboardingStep {
  id: string;
  order: number;
  title: string;
  instructions?: string;
  completion: StepCompletion;
  documents?: StepDoc[];
}

export interface OnboardingFlow {
  id: string;
  title: string;
  description?: string;
  steps: OnboardingStep[];
}

export interface OnboardingStepState {
  stepId: string;
  status: OnboardingStepStatus;
  notes?: string;
  completedAt?: string | null;
  personFileName?: string;
  personFileUrl?: string;
}

export interface OnboardingPerson {
  id: string;
  displayName: string;
  email: string;
}

export interface OnboardingAssignment {
  id: string;
  person: OnboardingPerson;
  flow: OnboardingFlow;
  startedAt: string;
  completedAt: string | null;
  publicToken: string;
  stepStates: OnboardingStepState[];
}

// The app where onboarding is actually completed (uploads / admin review).
export const ONBOARDING_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.skintyee.ca';

// ── Status meta ─────────────────────────────────────────────────────────────
export const OVERALL_STATUS_META: Record<OnboardingOverall, { label: string; color: string; description: string }> = {
  pending: { label: 'Not started', color: '#9AA0A6', description: 'Assigned — no steps started yet.' },
  in_progress: { label: 'In progress', color: '#00B8EC', description: 'Some steps are underway or awaiting review.' },
  completed: { label: 'Completed', color: '#5C9E31', description: 'All steps are complete and approved.' },
};

export const STEP_STATUS_META: Record<OnboardingStepStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#9AA0A6' },
  in_progress: { label: 'In review', color: '#00B8EC' },
  completed: { label: 'Done', color: '#5C9E31' },
  rejected: { label: 'Needs redo', color: '#D14343' },
};

export const STEP_COMPLETION_LABEL: Record<StepCompletion, string> = {
  admin_marks: 'Staff marks complete',
  person_uploads: 'You upload',
  both: 'You upload · staff approves',
};

// Assignment overall status — same derivation as the app (MyOnboarding/OnboardingFlows):
// completed when completedAt is set; in_progress once any step has moved off pending; else pending.
export function overallStatus(a: OnboardingAssignment): OnboardingOverall {
  if (a.completedAt) return 'completed';
  const started = a.stepStates.some((s) => s.status !== 'pending');
  return started ? 'in_progress' : 'pending';
}

export function stepProgress(a: OnboardingAssignment): { done: number; total: number } {
  return { done: a.stepStates.filter((s) => s.status === 'completed').length, total: a.flow.steps.length };
}
