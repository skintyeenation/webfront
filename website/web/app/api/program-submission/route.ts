import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { auth } from '@/auth';
import { programSlug } from '@skintyee/models';

export const runtime = 'nodejs';

// Per-program funding submission intake (Phase 1b). Signed-in members/staff submit a
// completed PAW application + supporting documents from a program page. The upload is
// filed into the SAME <area>/<slug>/ structure used by the repo doc folders and
// (Phase 2) the SharePoint library — "one structure, three surfaces" (docs/funding/PLAN.md §5).
//
// PHASE 2: swap the local-filesystem write below for a Microsoft Graph upload into the
// matching SharePoint library path (Funding/<area>/<slug>/submissions/…), and enforce the
// `isc-programs-and-funding-docs` group from the Entra token's group claims. For now the
// site-wide access gate already restricts everything to signed-in Skin Tyee accounts.
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

  // Mirror the repo / SharePoint structure: <area>/<slug>/submissions/<stamp>_<submitter>/
  const slug = programSlug({ acronym, name: programName });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const submitter = (session.user.email || session.user.name || 'member').replace(/[^a-z0-9@._-]+/gi, '_');
  const rel = `${area}/${slug}/submissions/${stamp}_${submitter}`;
  const destDir = path.join(process.cwd(), 'submissions', rel);
  await mkdir(destDir, { recursive: true });

  const saved: string[] = [];
  for (const file of files) {
    const safe = file.name.replace(/[^a-z0-9._-]+/gi, '_');
    await writeFile(path.join(destDir, safe), Buffer.from(await file.arrayBuffer()));
    saved.push(safe);
  }
  if (notes) {
    await writeFile(
      path.join(destDir, '_notes.txt'),
      `From: ${submitter}\nProgram: ${programName} (${area}/${slug})\n\n${notes}\n`,
    );
  }

  return NextResponse.json({ ok: true, program: programName, path: rel, files: saved });
}
