import { readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { storeFiles, type FileInput } from './submission-storage';
import {
  computeOnboardingStatus,
  onboardingUserKey,
  type OnboardingStatus,
} from './onboarding';

// Server-only onboarding store. Mirrors the funding-submission layout under
//   submissions/onboarding/<user>/<doc>/<stamp>/<files>
// and writes to the same local + Blob + SharePoint surfaces via storeFiles. Approval is set
// out-of-band (no WordPress approval) — represented by an `_approved` marker the website reads.

const ONBOARDING_ROOT = ['onboarding'];

function userDir(idOrEmail: string) {
  return path.join(process.cwd(), 'submissions', ...ONBOARDING_ROOT, onboardingUserKey(idOrEmail));
}

export interface OnboardingState {
  status: OnboardingStatus;
  uploaded: string[];
  approved: boolean;
}

// Read a user's onboarding state: which document folders exist + whether they've been approved.
export async function getOnboardingState(idOrEmail: string | undefined | null): Promise<OnboardingState> {
  if (!idOrEmail) return { status: 'not-started', uploaded: [], approved: false };
  const dir = userDir(idOrEmail);

  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return { status: 'not-started', uploaded: [], approved: false };
  }

  const approved = await access(path.join(dir, '_approved'))
    .then(() => true)
    .catch(() => false);
  const uploaded = entries.filter((e) => !e.startsWith('_') && !e.startsWith('.'));
  return { status: computeOnboardingStatus(uploaded, approved), uploaded, approved };
}

// Store an uploaded onboarding document for a user under its document folder.
export async function storeOnboardingDocument(opts: {
  user: string;
  docKey: string;
  submitter: string;
  files: FileInput[];
}): Promise<{ drivers: string[]; path: string }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rel = `onboarding/${onboardingUserKey(opts.user)}/${opts.docKey}/${stamp}`;
  const notes = `Onboarding document: ${opts.docKey}\nFrom: ${opts.submitter}\nUser: ${opts.user}\n`;
  const drivers = await storeFiles(rel, opts.files, notes);
  return { drivers, path: rel };
}
