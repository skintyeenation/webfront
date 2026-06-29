import Link from 'next/link';
import { ArrowUpRight, Users, ChevronDown } from 'lucide-react';
import {
  ONBOARDING_APP_URL,
  overallStatus,
  stepProgress,
  type OnboardingAssignment,
} from '@/lib/onboarding';
import { OnboardingStatusBadge } from './OnboardingStatusBadge';

// Admin (system admin) view — the cross-person list of in-progress onboardings, each handing
// off to the app where staff complete / approve. Mirrors the app's OnboardingFlows "Assignments"
// tab; the website is the at-a-glance surface + launcher.
export function OnboardingAdminList({
  assignments,
  appUrl = ONBOARDING_APP_URL,
}: {
  assignments: OnboardingAssignment[];
  appUrl?: string;
}) {
  return (
    <details className="group rounded-2xl border border-[var(--line)] p-5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <ChevronDown
            size={18}
            className="text-ink/50 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
          <Users size={18} className="text-primary" aria-hidden="true" />
          <h2 className="text-lg font-bold text-ink">Onboarding in progress</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {assignments.length}
          </span>
        </div>
        <a
          href={appUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Manage in the app <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </summary>

      {assignments.length === 0 ? (
        <p className="mt-4 text-sm text-ink/60">No onboardings are currently in progress.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
          {assignments.map((a) => {
            const { done, total } = stepProgress(a);
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{a.person.displayName}</p>
                  <p className="truncate text-sm text-ink/60">
                    {a.person.email} · {a.flow.title}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink/60">
                    {done}/{total}
                  </span>
                  <OnboardingStatusBadge status={overallStatus(a)} />
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Open <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-ink/50">
        Need to design a flow or approve a step?{' '}
        <Link href={appUrl} className="font-medium text-primary hover:underline">
          Open onboarding in the app
        </Link>
        .
      </p>
    </details>
  );
}
