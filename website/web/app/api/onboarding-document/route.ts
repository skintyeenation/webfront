import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { storeOnboardingDocument } from '@/lib/onboarding-store';
import { ONBOARDING_DOCUMENTS } from '@/lib/onboarding';

export const runtime = 'nodejs';

// Upload one onboarding document for the signed-in user. Stored under
// onboarding/<user>/<docKey>/ across local + Blob + SharePoint (storeFiles).
export async function POST(req: Request) {
  const session = await getSession();
  const user = session?.user?.email;
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const form = await req.formData();
  const docKey = String(form.get('docKey') || '');
  if (!ONBOARDING_DOCUMENTS.some((d) => d.key === docKey)) {
    return NextResponse.json({ error: 'Unknown document' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const { drivers, path } = await storeOnboardingDocument({
    user,
    docKey,
    submitter: session.user.name || user,
    files: [{ name: file.name, bytes, contentType: file.type }],
  });
  return NextResponse.json({ ok: true, docKey, drivers, path });
}
