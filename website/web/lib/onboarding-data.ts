import { userApi, resolveRole, safe } from './api';
import {
  overallStatus,
  type OnboardingAssignment,
  type OnboardingFlow,
  type OnboardingOverall,
  type OnboardingPerson,
} from './onboarding';

// Server-only onboarding data layer — reads the live api/ (the Skin Tyee band app api + db),
// the SAME source the app uses, and adapts its DTOs into the website's view models. Role is
// resolved per signed-in user so admins see the cross-person list and workers see their own.

type Api = ReturnType<typeof userApi>;
type AssignmentDto = Awaited<ReturnType<Api['onboarding']['listAssignments']>>[number];
type FlowDto = Awaited<ReturnType<Api['onboarding']['listFlows']>>[number];
type PersonDto = Awaited<ReturnType<Api['onboarding']['listPeople']>>[number];

function toFlow(d: FlowDto): OnboardingFlow {
  return {
    id: d.id,
    title: d.title,
    description: d.description ?? undefined,
    steps: (d.steps ?? []).map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      instructions: s.instructions ?? undefined,
      completion: s.completion,
    })),
  };
}

function toAssignment(d: AssignmentDto, flow: OnboardingFlow, person: OnboardingPerson): OnboardingAssignment {
  return {
    id: d.id,
    person,
    flow,
    startedAt: d.startedAt,
    completedAt: d.completedAt ?? null,
    publicToken: d.publicToken,
    stepStates: (d.stepStates ?? []).map((s) => ({
      stepId: s.stepId,
      status: s.status,
      notes: s.notes ?? undefined,
      completedAt: s.completedAt ?? undefined,
    })),
  };
}

// Overall status straight off a raw DTO (no flow join needed) — for the nav badge.
function overallFromDto(d: AssignmentDto): OnboardingOverall {
  if (d.completedAt) return 'completed';
  return (d.stepStates ?? []).some((s) => s.status !== 'pending') ? 'in_progress' : 'pending';
}

// Lightweight summary for the header nav: is the caller an admin, and their own overall status.
export async function onboardingSummary(
  email: string,
): Promise<{ admin: boolean; status?: OnboardingOverall }> {
  const role = await resolveRole(email);
  const api = userApi(role, email);
  const mine = await safe(api.onboarding.myAssignments(), [] as AssignmentDto[]);
  return { admin: role === 'admin', status: mine.length ? overallFromDto(mine[0]) : undefined };
}

// Full page data: the caller's own assignments + (for admins) the cross-person in-progress list.
export async function onboardingForPage(email: string): Promise<{
  admin: boolean;
  mine: OnboardingAssignment[];
  inProgress: OnboardingAssignment[];
}> {
  const role = await resolveRole(email);
  const admin = role === 'admin';
  const api = userApi(role, email);

  // The caller's own assignments — resolve each flow (getFlow is open to signed-in members).
  const myDtos = await safe(api.onboarding.myAssignments(), [] as AssignmentDto[]);
  const flowCache = new Map<string, OnboardingFlow>();
  async function flowFor(id: string): Promise<OnboardingFlow> {
    const hit = flowCache.get(id);
    if (hit) return hit;
    const dto = await safe(api.onboarding.getFlow(id), null as FlowDto | null);
    const f: OnboardingFlow = dto ? toFlow(dto) : { id, title: 'Onboarding', steps: [] };
    flowCache.set(id, f);
    return f;
  }
  const self: OnboardingPerson = { id: 'self', displayName: email, email };
  const mine: OnboardingAssignment[] = [];
  for (const d of myDtos) mine.push(toAssignment(d, await flowFor(d.flowId), self));

  // Admin cross-person list — join assignments with flow titles + person names.
  let inProgress: OnboardingAssignment[] = [];
  if (admin) {
    const [assignments, flows, people] = await Promise.all([
      safe(api.onboarding.listAssignments(), [] as AssignmentDto[]),
      safe(api.onboarding.listFlows(), [] as FlowDto[]),
      safe(api.onboarding.listPeople(), [] as PersonDto[]),
    ]);
    const flowById = new Map(flows.map((f) => [f.id, toFlow(f)]));
    const personById = new Map(people.map((p) => [p.id, p]));
    inProgress = assignments
      .map((d) => {
        const flow = flowById.get(d.flowId) ?? { id: d.flowId, title: 'Onboarding', steps: [] };
        const p = personById.get(d.personId);
        const person: OnboardingPerson = {
          id: d.personId,
          displayName: p?.displayName ?? 'Unknown',
          email: p?.email ?? '',
        };
        return toAssignment(d, flow, person);
      })
      .filter((a) => overallStatus(a) !== 'completed')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  return { admin, mine, inProgress };
}
