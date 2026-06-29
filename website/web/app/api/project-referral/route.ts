import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

// Project-referral intake from the Projects-page CTA. Records the referral + any attached
// PDFs. A notification email to referrals@skintyee.ca is a follow-up (needs site mail
// config). POC stores each referral to its own folder under referrals/ (gitignored).
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const name = String(form.get('name') || '').trim();
  const email = String(form.get('email') || '').trim();
  const phone = String(form.get('phone') || '').trim();
  const organization = String(form.get('organization') || '').trim();
  const category = String(form.get('category') || '').trim();
  const details = String(form.get('details') || '').trim();
  const files = form
    .getAll('files')
    .filter((f): f is File => f instanceof File && f.size > 0)
    .filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

  if (!name || !email || !details) {
    return NextResponse.json({ error: 'Name, email, and details are required.' }, { status: 400 });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const who = email.replace(/[^a-z0-9@._-]+/gi, '_');
  const dir = path.join(process.cwd(), 'referrals', `${stamp}_${who}`);
  await mkdir(dir, { recursive: true });

  const saved: string[] = [];
  for (const file of files) {
    const safe = file.name.replace(/[^a-z0-9._-]+/gi, '_');
    await writeFile(path.join(dir, safe), Buffer.from(await file.arrayBuffer()));
    saved.push(safe);
  }
  await writeFile(
    path.join(dir, 'referral.json'),
    JSON.stringify(
      { name, email, phone, organization, category, details, files: saved, at: new Date().toISOString() },
      null,
      2,
    ),
  );

  return NextResponse.json({ ok: true, files: saved });
}
