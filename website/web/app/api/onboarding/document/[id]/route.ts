import { getSession } from '@/lib/session';
import { resolveRole } from '@/lib/api';

export const runtime = 'nodejs';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Stream an onboarding step's attached document through the api/ as the signed-in caller
// (x-role + x-upn). `?download=1` forces an attachment download; otherwise inline (view).
// The api enforces document audience — a caller without access gets the api's own status.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return new Response('Unauthorized', { status: 401 });

  const role = await resolveRole(email);
  const download = new URL(req.url).searchParams.get('download') === '1' ? '1' : '0';
  const upstream = await fetch(
    `${API_URL}/v1/documents/${encodeURIComponent(params.id)}/pdf?download=${download}`,
    { headers: { 'x-role': role, 'x-upn': email }, cache: 'no-store' },
  );
  if (!upstream.ok || !upstream.body) return new Response('Document not available', { status: upstream.status || 502 });

  const headers = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const cd = upstream.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd);
  return new Response(upstream.body, { status: 200, headers });
}
