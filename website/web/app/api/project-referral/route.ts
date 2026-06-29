import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

// Project-referral intake from the Projects-page CTA. Records the referral; a notification
// email to referrals@skintyee.ca is a follow-up (needs site mail config). POC stores to a
// local referrals/ directory (gitignored).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}) as Record<string, unknown>);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  const organization = String(b.organization || '').trim();
  const details = String(b.details || '').trim();

  if (!name || !email || !details) {
    return NextResponse.json({ error: 'Name, email, and details are required.' }, { status: 400 });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const who = email.replace(/[^a-z0-9@._-]+/gi, '_');
  const dir = path.join(process.cwd(), 'referrals');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${stamp}_${who}.json`),
    JSON.stringify({ name, email, organization, details, at: new Date().toISOString() }, null, 2),
  );

  return NextResponse.json({ ok: true });
}
