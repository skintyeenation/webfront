import { userApi, resolveRole, safe } from './api';
import {
  overallStatus,
  type OnboardingAssignment,
  type OnboardingFlow,
  type OnboardingOverall,
  type OnboardingPerson,
  type StepDoc,
} from './onboarding';

// Server-only onboarding data layer — reads the live api/ (the Skin Tyee band app api + db),
// the SAME source the app uses, and adapts its DTOs into the website's view models. Role is
// resolved per signed-in user so admins see the cross-person list and workers see their own.

type Api = ReturnType<typeof userApi>;
type AssignmentDto = Awaited<ReturnType<Api['onboarding']['listAssignments']>>[number];
type FlowDto = Awaited<ReturnType<Api['onboarding']['listFlows']>>[number];
type PersonDto = Awaited<ReturnType<Api['onboarding']['listPeople']>>[number];

const viewable = (m?: string | null) => !!m && (/pdf/i.test(m) || /^image\//i.test(m));

// Resolve a step's attached document refs into displayable docs. Falls back to skipping a doc
// the caller can't read (the api gates docs by audience — members may 403 on admin-only forms).
async function resolveDocs(api: Api, refs?: { documentId: string }[]): Promise<StepDoc[]> {
  const out: StepDoc[] = [];
  for (const ref of refs ?? []) {
    const doc = await safe(api.documents.get(ref.documentId), null as Awaited<ReturnType<Api['documents']['get']>> | null);
    if (doc) out.push({ documentId: doc.id, title: doc.title, mimeType: doc.mimeType ?? undefined, viewable: viewable(doc.mimeType) });
  }
  return out;
}

// Lite flow — steps + titles only (no doc resolution). For the admin list, where we only need
// the title + step count.
function toFlowLite(d: FlowDto): OnboardingFlow {
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

// Full flow — resolves each step's attached documents. For the rendered assignment timeline.
async function toFlowFull(api: Api, d: FlowDto): Promise<OnboardingFlow> {
  const steps = [];
  for (const s of d.steps ?? []) {
    steps.push({
      id: s.id,
      order: s.order,
      title: s.title,
      instructions: s.instructions ?? undefined,
      completion: s.completion,
      documents: await resolveDocs(api, s.documents),
    });
  }
  return { id: d.id, title: d.title, description: d.description ?? undefined, steps };
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
      personFileName: s.personFileName ?? undefined,
      personFileUrl: s.personFileUrl ?? undefined,
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

  // The caller's own assignments — resolve each flow (with docs) once; getFlow is open to members.
  const myDtos = await safe(api.onboarding.myAssignments(), [] as AssignmentDto[]);
  const flowCache = new Map<string, OnboardingFlow>();
  async function flowFor(id: string): Promise<OnboardingFlow> {
    const hit = flowCache.get(id);
    if (hit) return hit;
    const dto = await safe(api.onboarding.getFlow(id), null as FlowDto | null);
    const f: OnboardingFlow = dto ? await toFlowFull(api, dto) : { id, title: 'Onboarding', steps: [] };
    flowCache.set(id, f);
    return f;
  }
  const self: OnboardingPerson = { id: 'self', displayName: email, email };
  const mine: OnboardingAssignment[] = [];
  for (const d of myDtos) mine.push(toAssignment(d, await flowFor(d.flowId), self));

  // Admin cross-person list — join assignments with flow titles + person names (lite flows).
  let inProgress: OnboardingAssignment[] = [];
  if (admin) {
    const [assignments, flows, people] = await Promise.all([
      safe(api.onboarding.listAssignments(), [] as AssignmentDto[]),
      safe(api.onboarding.listFlows(), [] as FlowDto[]),
      safe(api.onboarding.listPeople(), [] as PersonDto[]),
    ]);
    const flowById = new Map(flows.map((f) => [f.id, toFlowLite(f)]));
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
