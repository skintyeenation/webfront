import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { programSlug } from '@skintyee/models';
import { storeSubmission } from '@/lib/submission-storage';

export const runtime = 'nodejs';

// Per-program funding submission intake. Signed-in members/staff submit a completed PAW +
// supporting documents from a program page or the funding hub. storeSubmission files the
// upload into the designed <area>/<slug>/submissions/… structure across every configured
// store — local disk (POC + status badges), Azure Blob, and a SharePoint mirror — "one
// structure, three surfaces" (docs/funding/PLAN.md §5).
//
// Auth: the site-wide access gate already restricts everything to signed-in Skin Tyee
// accounts; Phase 2 additionally enforces the `isc-programs-and-funding-docs` group from the
// Entra token's group claims.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in with your Skin Tyee account to submit.' }, { status: 401 });
  }

  const form = await req.formData();
  const area = String(form.get('area') || '').trim();
  const programName = String(form.get('programName') || '').trim();
  const acronym = String(form.get('acronym') || '').trim() || undefined;
  const notes = String(form.get('notes') || '').trim();
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);

  if (!area || !programName) {
    return NextResponse.json({ error: 'Missing program.' }, { status: 400 });
  }
  if (!files.length) {
    return NextResponse.json({ error: 'Attach at least one document.' }, { status: 400 });
  }

  const slug = programSlug({ acronym, name: programName });
  const submitter = session.user.email || session.user.name || 'member';
  const fileInputs = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      bytes: Buffer.from(await f.arrayBuffer()),
      contentType: f.type || undefined,
    })),
  );

  const result = await storeSubmission({ area, slug, submitter, files: fileInputs, notes });

  return NextResponse.json({
    ok: true,
    program: programName,
    path: result.path,
    drivers: result.drivers,
    files: fileInputs.map((f) => f.name),
  });
}
