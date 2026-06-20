import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DocumentStorageAdapter,
  StorageDriver,
  UploadInput,
  UploadResult,
} from './document-storage';

// Azure Blob storage adapter — the Phase 1 default.
//
// Backed by an Azure Storage container (set via env). Configuration:
//
//   AZURE_STORAGE_DOCUMENTS_ACCOUNT     storage account name
//   AZURE_STORAGE_DOCUMENTS_CONTAINER   container (default: skintyee-app-documents)
//   AZURE_STORAGE_DOCUMENTS_SAS         account-level SAS token (write+read+list+delete)
//
// `key` is a `<yyyy/mm/dd>/<uuid>-<safe-filename>` path so blobs are
// easy to bucket-browse in Storage Explorer and avoid collisions.
// `url` is built as `https://{account}.blob.core.windows.net/{container}/{key}?{sas}`
// — SAS is the simplest path for the POC. When we move to managed
// identity, swap this for an MSI-issued user-delegation key.
//
// If the env isn't configured, the adapter falls back to a degraded
// in-memory mode so dev / unit tests don't need real Azure creds.
// Uploads are kept in a Map keyed by `key`; `urlFor` returns a synthetic
// `mem://` URL the controller surfaces as a "no real storage" indicator.

@Injectable()
export class AzureBlobStorageAdapter implements DocumentStorageAdapter {
  readonly driver: StorageDriver = 'blob';
  private readonly log = new Logger(AzureBlobStorageAdapter.name);
  private readonly account = process.env.AZURE_STORAGE_DOCUMENTS_ACCOUNT;
  private readonly container = process.env.AZURE_STORAGE_DOCUMENTS_CONTAINER ?? 'skintyee-app-documents';
  private readonly sas = process.env.AZURE_STORAGE_DOCUMENTS_SAS;
  private readonly inMemory = new Map<string, { bytes: Buffer; mimeType: string; fileName: string }>();
  private readonly hasRealAzure: boolean;

  constructor() {
    this.hasRealAzure = !!(this.account && this.sas);
    if (!this.hasRealAzure) {
      this.log.warn(
        `Azure Blob storage env not set (AZURE_STORAGE_DOCUMENTS_ACCOUNT / _SAS) — running in degraded in-memory mode. Docs will be lost on restart.`
      );
    } else {
      this.log.log(`Azure Blob ready (account=${this.account}, container=${this.container})`);
    }
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const key = this.buildKey(input.fileName);
    if (!this.hasRealAzure) {
      this.inMemory.set(key, { bytes: input.bytes, mimeType: input.mimeType, fileName: input.fileName });
      return { key, url: `mem://${key}`, sizeBytes: input.bytes.length, mimeType: input.mimeType };
    }
    const url = this.publicUrl(key);
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-blob-content-type': input.mimeType,
        'Content-Length': String(input.bytes.length),
      },
      body: input.bytes,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Azure Blob upload failed ${res.status}: ${text}`);
    }
    return { key, url, sizeBytes: input.bytes.length, mimeType: input.mimeType };
  }

  async urlFor(key: string): Promise<string> {
    if (!this.hasRealAzure) {
      return this.inMemory.has(key) ? `mem://${key}` : '';
    }
    // SAS URL is stable for the lifetime of the SAS token. Return it
    // verbatim. When we move to short-lived user-delegation SAS this
    // method regenerates a fresh URL each call.
    return this.publicUrl(key);
  }

  async read(key: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    if (!this.hasRealAzure) {
      const e = this.inMemory.get(key);
      return e ? { bytes: e.bytes, mimeType: e.mimeType } : null;
    }
    const res = await fetch(this.publicUrl(key));
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { bytes: buf, mimeType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }

  async delete(key: string): Promise<void> {
    if (!this.hasRealAzure) {
      this.inMemory.delete(key);
      return;
    }
    const res = await fetch(this.publicUrl(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`Azure Blob delete failed ${res.status}: ${text}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.hasRealAzure) return true; // in-memory mode is always "healthy"
    // Quick container existence check via HEAD on the container endpoint.
    const url = `https://${this.account}.blob.core.windows.net/${this.container}?restype=container&${this.sas}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch (e: any) {
      this.log.warn(`Azure Blob health check failed: ${e?.message ?? e}`);
      return false;
    }
  }

  // ---- helpers ------------------------------------------------------------

  private publicUrl(key: string): string {
    return `https://${this.account}.blob.core.windows.net/${this.container}/${key}?${this.sas}`;
  }

  private buildKey(fileName: string): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    // Strip path separators + collapse unsafe chars; keep extension.
    const safe = fileName.replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    return `${yyyy}/${mm}/${dd}/${randomUUID()}-${safe}`;
  }
}
