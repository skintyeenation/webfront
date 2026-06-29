import { getSession } from '@/lib/session';
import { resolveRole } from '@/lib/api';

export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Worker upload — the signed-in caller uploads their own file for a step in their own assignment.
// Forwards the multipart `file` to the api/ me-upload endpoint (which re-checks ownership via
// x-upn), so a worker can't push files to someone else's assignment.
export async function POST(req: Request) {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return Response.json({ error: 'Sign in required' }, { status: 401 });

  const form = await req.formData();
  const assignmentId = String(form.get('assignmentId') || '');
  const stepId = String(form.get('stepId') || '');
  const file = form.get('file');
  if (!assignmentId || !stepId || !(file instanceof File)) {
    return Response.json({ error: 'assignmentId, stepId and file are required' }, { status: 400 });
  }

  const role = await resolveRole(email);
  const fd = new FormData();
  fd.append('file', file, file.name);
  const upstream = await fetch(
    `${API_URL}/v1/onboarding/assignments/${encodeURIComponent(assignmentId)}/steps/${encodeURIComponent(stepId)}/me-upload`,
    { method: 'POST', headers: { 'x-role': role, 'x-upn': email }, body: fd },
  );
  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    return Response.json({ error: `Upload failed (${upstream.status})`, detail: body.slice(0, 200) }, { status: upstream.status });
  }
  return Response.json({ ok: true });
}
