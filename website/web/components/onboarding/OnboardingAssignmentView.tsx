import { ArrowUpRight } from 'lucide-react';
import {
  ONBOARDING_APP_URL,
  STEP_COMPLETION_LABEL,
  overallStatus,
  stepProgress,
  type OnboardingAssignment,
} from '@/lib/onboarding';
import { OnboardingStatusBadge, StepStatusBadge } from './OnboardingStatusBadge';

// Worker view of one assignment — the flow's steps with their statuses, read-only. Completion
// (uploads, signing) happens in the app, so each card hands off to app.skintyee.ca.
export function OnboardingAssignmentView({ assignment }: { assignment: OnboardingAssignment }) {
  const { done, total } = stepProgress(assignment);
  const steps = [...assignment.flow.steps].sort((a, b) => a.order - b.order);
  const stateByStep = new Map(assignment.stepStates.map((s) => [s.stepId, s]));

  return (
    <section className="rounded-2xl border border-[var(--line)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">{assignment.flow.title}</h2>
          {assignment.flow.description && <p className="text-sm text-ink/60">{assignment.flow.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink/60">
            {done} of {total} done
          </span>
          <OnboardingStatusBadge status={overallStatus(assignment)} />
        </div>
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step, i) => {
          const st = stateByStep.get(step.id);
          const status = st?.status ?? 'pending';
          return (
            <li key={step.id} className="rounded-xl border border-[var(--line)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    <span className="text-ink/40">{i + 1}.</span> {step.title}
                  </p>
                  {step.instructions && <p className="mt-0.5 text-sm text-ink/60">{step.instructions}</p>}
                  <p className="mt-1 text-xs uppercase tracking-wide text-ink/40">
                    {STEP_COMPLETION_LABEL[step.completion]}
                  </p>
                  {status === 'rejected' && st?.notes && (
                    <p className="mt-1 text-sm text-red-600">Needs redo: {st.notes}</p>
                  )}
                </div>
                <StepStatusBadge status={status} />
              </div>
            </li>
          );
        })}
      </ol>

      <a
        href={ONBOARDING_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
      >
        Complete in the app <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}
