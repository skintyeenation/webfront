import {
  OVERALL_STATUS_META,
  STEP_STATUS_META,
  type OnboardingOverall,
  type OnboardingStepStatus,
} from '@/lib/onboarding';

function Pill({ label, color, className = '' }: { label: string; color: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      style={{ color, backgroundColor: `${color}1a` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

// Assignment overall status pill — used in the nav, user menu, and admin list.
export function OnboardingStatusBadge({ status, className = '' }: { status: OnboardingOverall; className?: string }) {
  const m = OVERALL_STATUS_META[status];
  return <Pill label={m.label} color={m.color} className={className} />;
}

// Per-step status pill — used in the assignment timeline.
export function StepStatusBadge({ status, className = '' }: { status: OnboardingStepStatus; className?: string }) {
  const m = STEP_STATUS_META[status];
  return <Pill label={m.label} color={m.color} className={className} />;
}
