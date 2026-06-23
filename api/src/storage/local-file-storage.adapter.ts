import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  DocumentStorageAdapter,
  StorageDriver,
  UploadInput,
  UploadResult,
} from './document-storage';

// Local-filesystem storage adapter.
//
// Persists document bytes to disk so they survive api/ restarts. This is the
// default in dev when no cloud storage (Azure Blob / SharePoint) is wired up —
// the Azure Blob adapter's degraded fallback keeps bytes in RAM and loses them
// on every restart, which orphans the *persisted* Postgres document rows and
// surfaces as "File not available." 404s on GET /documents/:id/pdf.
//
// Root dir via STORAGE_LOCAL_DIR (default <cwd>/.storage/documents). A sidecar
// `<key>.meta.json` records the mime type so read() can report it.
//
// NOTE: a container filesystem is durable only for that container's lifetime —
// fine for dev, and survives in-process restarts in prod, but NOT a substitute
// for Azure Blob across deploys / scaling. Configure STORAGE_DRIVER=blob +
// AZURE_STORAGE_DOCUMENTS_ACCOUNT/_SAS for durable prod storage.
@Injectable()
export class LocalFileStorageAdapter implements DocumentStorageAdapter {
  readonly driver: StorageDriver = 'local';
  private readonly log = new Logger(LocalFileStorageAdapter.name);
  private readonly root = process.env.STORAGE_LOCAL_DIR
    ? path.resolve(process.env.STORAGE_LOCAL_DIR)
    : path.join(process.cwd(), '.storage', 'documents');

  constructor() {
    this.log.log(`Local file storage at ${this.root} (bytes persist across restarts).`);
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const key = this.buildKey(input.fileName);
    const abs = path.join(this.root, key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, input.bytes);
    await fs.writeFile(
      `${abs}.meta.json`,
      JSON.stringify({ mimeType: input.mimeType, fileName: input.fileName }),
    );
    return { key, url: `local://${key}`, sizeBytes: input.bytes.length, mimeType: input.mimeType };
  }

  // Non-HTTP sentinel — the /pdf endpoint streams bytes via read(), not a URL.
  async urlFor(key: string): Promise<string> {
    const abs = this.safeAbs(key);
    if (!abs) return '';
    try {
      await fs.access(abs);
      return `local://${key}`;
    } catch {
      return '';
    }
  }

  async read(key: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const abs = this.safeAbs(key);
    if (!abs) return null;
    try {
      const bytes = await fs.readFile(abs);
      let mimeType = 'application/octet-stream';
      try {
        const meta = JSON.parse(await fs.readFile(`${abs}.meta.json`, 'utf8'));
        if (typeof meta?.mimeType === 'string') mimeType = meta.mimeType;
      } catch {
        /* no sidecar — fall back to octet-stream */
      }
      return { bytes, mimeType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const abs = this.safeAbs(key);
    if (!abs) return;
    await fs.rm(abs, { force: true });
    await fs.rm(`${abs}.meta.json`, { force: true });
  }

  async isHealthy(): Promise<boolean> {
    try {
      await fs.mkdir(this.root, { recursive: true });
      return true;
    } catch (e: any) {
      this.log.warn(`Local storage health check failed: ${e?.message ?? e}`);
      return false;
    }
  }

  // ---- helpers ------------------------------------------------------------

  // Resolve a key to an absolute path, refusing anything that escapes the
  // storage root (path-traversal guard).
  private safeAbs(key: string): string | null {
    const abs = path.resolve(this.root, key);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) return null;
    return abs;
  }

  private buildKey(fileName: string): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const safe = fileName.replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    return `${yyyy}/${mm}/${dd}/${randomUUID()}-${safe}`;
  }
}
