// Onboarding model — mirrors the @skintyee/app onboarding contract
// (packages/api-client/src/ApiService.ts): a Flow (template) has ordered Steps; an Assignment
// enrols one Person in one Flow and tracks a StepState per step. The actual completion
// (uploads, admin approve/reject) happens in the app — the website is a *surface*: it shows
// the signed-in person their assignment, shows admins the in-progress list, and hands off to
// app.skintyee.ca to complete.
//
// Pure data + helpers (no Node deps) — safe to import from client or server components. The
// seed below stands in for the api/ onboarding store for the POC (the app's mock is empty and
// renders against the live api/; the website mirrors the same shapes here).

export type StepCompletion = 'admin_marks' | 'person_uploads' | 'both';
export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';
export type OnboardingOverall = 'pending' | 'in_progress' | 'completed';

export interface OnboardingStep {
  id: string;
  order: number;
  title: string;
  instructions?: string;
  completion: StepCompletion;
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

// Admins (system admins) see the cross-person in-progress list. Allowlist by email, overridable
// via env. Defaults to the band IT admin who is also seeded with an assignment below.
const ADMIN_EMAILS = (process.env.ONBOARDING_ADMIN_EMAILS || 'lucas.lopatka@skintyee.ca')
  .toLowerCase()
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const isOnboardingAdmin = (email?: string | null) =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());

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

// ── Seed flows ──────────────────────────────────────────────────────────────
const EMPLOYEE_FLOW: OnboardingFlow = {
  id: 'flow-employee',
  title: 'Employee Onboarding',
  description: 'Standard intake for new Skin Tyee employees.',
  steps: [
    { id: 'e-agreement', order: 0, title: 'Sign employment agreement', instructions: 'Review and sign your employment agreement.', completion: 'both' },
    { id: 'e-id', order: 1, title: 'Submit photo ID', instructions: "Driver's licence, status card, or passport.", completion: 'person_uploads' },
    { id: 'e-deposit', order: 2, title: 'Direct deposit', instructions: 'Void cheque or a bank direct-deposit form.', completion: 'person_uploads' },
    { id: 'e-td1', order: 3, title: 'Tax forms (TD1)', instructions: 'Federal + BC TD1 personal tax credits return.', completion: 'person_uploads' },
    { id: 'e-worksafe', order: 4, title: 'WorkSafeBC orientation', instructions: 'Acknowledge the WorkSafeBC orientation for your role.', completion: 'both' },
    { id: 'e-safety', order: 5, title: 'Safety orientation', instructions: 'Attend the site safety orientation.', completion: 'admin_marks' },
  ],
};

const CONTRACTOR_FLOW: OnboardingFlow = {
  id: 'flow-contractor',
  title: 'Contractor Onboarding',
  description: 'Standard intake for contractors and seasonal crew working with Skin Tyee.',
  steps: [
    { id: 'c-agreement', order: 0, title: 'Sign contractor agreement', instructions: 'Review and sign your engagement agreement.', completion: 'both' },
    { id: 'c-id', order: 1, title: 'Submit photo ID', instructions: "Driver's licence, status card, or passport.", completion: 'person_uploads' },
    { id: 'c-insurance', order: 2, title: 'Proof of insurance / WCB', instructions: 'Liability insurance + WorkSafeBC clearance letter.', completion: 'person_uploads' },
    { id: 'c-deposit', order: 3, title: 'Direct deposit', instructions: 'Void cheque or a bank direct-deposit form.', completion: 'person_uploads' },
    { id: 'c-safety', order: 4, title: 'Safety orientation', instructions: 'Attend the site safety orientation.', completion: 'admin_marks' },
  ],
};

const ALL_FLOWS: OnboardingFlow[] = [EMPLOYEE_FLOW, CONTRACTOR_FLOW];

const LUCAS: OnboardingPerson = { id: 'p-lucas', displayName: 'Lucas Lopatka', email: 'lucas.lopatka@skintyee.ca' };

// ── Seed assignments ──────────────────────────────────────────────────────────
// Helper: build step states for a flow from a partial status map (missing steps → pending),
// with optional per-step notes (e.g. a rejection reason).
function statesFor(
  flow: OnboardingFlow,
  map: Record<string, OnboardingStepStatus>,
  notes: Record<string, string> = {},
): OnboardingStepState[] {
  return flow.steps.map((s) => ({ stepId: s.id, status: map[s.id] ?? 'pending', notes: notes[s.id] }));
}

const ALL_ASSIGNMENTS: OnboardingAssignment[] = [
  {
    id: 'asg-lucas-employee',
    person: LUCAS,
    flow: EMPLOYEE_FLOW,
    startedAt: '2026-06-22T16:00:00.000Z',
    completedAt: null,
    publicToken: 'tok-lucas-emp-7f3a',
    stepStates: statesFor(
      EMPLOYEE_FLOW,
      { 'e-agreement': 'completed', 'e-id': 'completed', 'e-deposit': 'in_progress', 'e-td1': 'rejected' },
      { 'e-td1': 'BC TD1 page was missing — please include both the federal and provincial forms.' },
    ),
  },
  {
    id: 'asg-lucas-contractor',
    person: LUCAS,
    flow: CONTRACTOR_FLOW,
    startedAt: '2026-06-26T17:15:00.000Z',
    completedAt: null,
    publicToken: 'tok-lucas-con-9b21',
    stepStates: statesFor(CONTRACTOR_FLOW, { 'c-agreement': 'completed', 'c-id': 'in_progress' }),
  },
];

// ── Queries ───────────────────────────────────────────────────────────────────
export function flows(): OnboardingFlow[] {
  return ALL_FLOWS;
}

// A person's own assignment(s), by email (worker view).
export function assignmentsFor(email?: string | null): OnboardingAssignment[] {
  if (!email) return [];
  const e = email.toLowerCase();
  return ALL_ASSIGNMENTS.filter((a) => a.person.email.toLowerCase() === e);
}

// All assignments still in progress (admin view) — newest first.
export function inProgressAssignments(): OnboardingAssignment[] {
  return ALL_ASSIGNMENTS.filter((a) => overallStatus(a) !== 'completed').sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export function completedAssignments(): OnboardingAssignment[] {
  return ALL_ASSIGNMENTS.filter((a) => overallStatus(a) === 'completed');
}
