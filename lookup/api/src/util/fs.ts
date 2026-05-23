import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function writeOut(path: string, body: string | Uint8Array): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, body);
}
