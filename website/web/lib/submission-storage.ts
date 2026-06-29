import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Stores a funding submission into the designed folder structure —
//   <area>/<slug>/submissions/<stamp>_<submitter>/<file>
// — across whichever stores are configured:
//   • local disk      — always (POC store; also powers the submission-status badges)
//   • Azure Blob      — when AZURE_STORAGE_SUBMISSIONS_ACCOUNT + _SAS are set
//   • SharePoint      — mirror, when SHAREPOINT_* (tenant/client/secret/site) are set
// Blob + SharePoint use their REST APIs directly (no SDK dependency), so the build stays
// dependency-free and the cloud writes simply no-op until their env is provided.

export type SubmissionKind = 'paw' | 'dci';
export type FileInput = { name: string; bytes: Buffer; contentType?: string };
export type StoredSubmission = { id: string; key: string; path: string; drivers: string[] };

const safeName = (n: string) => n.replace(/[^a-z0-9._-]+/gi, '_');

export async function storeSubmission(opts: {
  area: string;
  slug: string;
  kind: SubmissionKind;
  project?: string;
  submitter: string;
  files: FileInput[];
  notes?: string;
  id?: string; // client-supplied GUID (shown in the form preview) — falls back to a fresh one
}): Promise<StoredSubmission> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // A submission has no official ID at intake (the PAW # is the form-template number), so we
  // assign a unique GUID, plus a friendly key derived from the application title + who +
  // datetime + a short id. PAW (applications) and DCI (reports) live in separate subfolders.
  const id = opts.id || randomUUID();
  const titleSlug =
    (opts.project || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
    'untitled';
  const key = `${titleSlug}_${safeName(opts.submitter)}_${stamp}_${id.slice(0, 8)}`;
  const rel = `${opts.area}/${opts.slug}/submissions/${opts.kind}/${key}`;
  const notesBody =
    `Submission ID: ${id}\nFrom: ${opts.submitter}\nProgram: ${opts.area}/${opts.slug}\n` +
    `Kind: ${opts.kind.toUpperCase()}\n` +
    (opts.project ? `Title: ${opts.project}\n` : '') +
    (opts.notes ? `\n${opts.notes}\n` : '');
  const drivers = await storeFiles(rel, opts.files, notesBody);
  return { id, key, path: rel, drivers };
}

// Reusable "one structure, three surfaces" writer — writes the given files under `rel`
// to local disk (always) plus Azure Blob and SharePoint when their env is configured.
// Funding submissions and contractor onboarding both build their own `rel` and share this.
export async function storeFiles(rel: string, files: FileInput[], notes?: string): Promise<string[]> {
  const drivers: string[] = [];

  // 1) Local disk — POC store + status reads. Best-effort: the standalone prod container's
  // /app isn't writable by the runtime user, so a failure here must not block the cloud writes.
  try {
    await storeLocal(rel, files, notes);
    drivers.push('local');
  } catch (e) {
    console.error('[store] local write failed (non-fatal):', e);
  }

  // 2) Azure Blob — primary cloud store, when configured.
  if (process.env.AZURE_STORAGE_SUBMISSIONS_ACCOUNT && process.env.AZURE_STORAGE_SUBMISSIONS_SAS) {
    try {
      await storeBlob(rel, files, notes);
      drivers.push('blob');
    } catch (e) {
      console.error('[store] Azure Blob upload failed:', e);
    }
  }

  // 3) SharePoint — mirror of the same structure, when configured.
  if (
    process.env.SHAREPOINT_TENANT_ID &&
    process.env.SHAREPOINT_CLIENT_ID &&
    process.env.SHAREPOINT_CLIENT_SECRET &&
    process.env.SHAREPOINT_SITE_ID
  ) {
    try {
      await storeSharePoint(rel, files, notes);
      drivers.push('sharepoint');
    } catch (e) {
      console.error('[store] SharePoint mirror failed:', e);
    }
  }

  return drivers;
}

async function storeLocal(rel: string, files: FileInput[], notes?: string) {
  const dir = path.join(process.cwd(), 'submissions', rel);
  await mkdir(dir, { recursive: true });
  for (const f of files) await writeFile(path.join(dir, safeName(f.name)), f.bytes);
  if (notes) await writeFile(path.join(dir, '_notes.txt'), notes);
}

async function storeBlob(rel: string, files: FileInput[], notes?: string) {
  const account = process.env.AZURE_STORAGE_SUBMISSIONS_ACCOUNT!;
  const sas = process.env.AZURE_STORAGE_SUBMISSIONS_SAS!.replace(/^\?/, '');
  const container = process.env.AZURE_STORAGE_SUBMISSIONS_CONTAINER || 'funding-submissions';
  const put = async (name: string, bytes: Buffer, type: string) => {
    const url = `https://${account}.blob.core.windows.net/${container}/${rel}/${name}?${sas}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': type },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`blob ${res.status}: ${await res.text()}`);
  };
  for (const f of files) await put(safeName(f.name), f.bytes, f.contentType || 'application/octet-stream');
  if (notes) await put('_notes.txt', Buffer.from(notes), 'text/plain');
}

async function graphToken(): Promise<string> {
  const tenant = process.env.SHAREPOINT_TENANT_ID!;
  const body = new URLSearchParams({
    client_id: process.env.SHAREPOINT_CLIENT_ID!,
    client_secret: process.env.SHAREPOINT_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`graph token ${res.status}`);
  return (await res.json()).access_token as string;
}

async function storeSharePoint(rel: string, files: FileInput[], notes?: string) {
  const site = process.env.SHAREPOINT_SITE_ID!;
  const prefix = process.env.SHAREPOINT_SUBMISSIONS_PREFIX || 'Funding';
  const token = await graphToken();
  const put = async (name: string, bytes: Buffer, type: string) => {
    const itemPath = `${prefix}/${rel}/${name}`.split('/').map(encodeURIComponent).join('/');
    const url = `https://graph.microsoft.com/v1.0/sites/${site}/drive/root:/${itemPath}:/content`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': type },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`graph ${res.status}: ${await res.text()}`);
  };
  for (const f of files) await put(safeName(f.name), f.bytes, f.contentType || 'application/octet-stream');
  if (notes) await put('_notes.txt', Buffer.from(notes), 'text/plain');
}
