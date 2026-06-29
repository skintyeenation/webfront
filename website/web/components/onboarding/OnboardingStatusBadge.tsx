import { ONBOARDING_STATUS_META, type OnboardingStatus } from '@/lib/onboarding';

// Reusable status pill — used on the onboarding page, in the checklist header, and under the
// user menu. Pure (no hooks), so it works in server or client components.
export function OnboardingStatusBadge({
  status,
  className = '',
}: {
  status: OnboardingStatus;
  className?: string;
}) {
  const m = ONBOARDING_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      style={{ color: m.color, backgroundColor: `${m.color}1a` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} aria-hidden="true" />
      {m.label}
    </span>
  );
}
