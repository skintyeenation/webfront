// Storage adapter contract for the Documents library. See
// docs/features/documents-and-onboarding.md for design rationale.
//
// The adapter abstracts where a document's bytes actually live.
// Phase 1 ships two implementations:
//   - AzureBlobStorageAdapter (default, set via STORAGE_DRIVER=blob)
//   - SharePointStorageAdapter (off by default; STORAGE_DRIVER=sharepoint)
//
// Controllers depend on this interface, not the concrete class — the
// concrete is bound in DocumentsModule via a factory provider that
// reads STORAGE_DRIVER at boot.

export type StorageDriver = 'blob' | 'sharepoint';

export interface UploadInput {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

export interface UploadResult {
  /** Adapter-internal handle. Used on subsequent urlFor / delete calls. */
  key: string;
  /** Canonical URL the client uses to view or download. Adapter-specific
   *  lifetime — Blob is presigned with 30-min TTL; SharePoint webUrl is
   *  long-lived. Callers should re-resolve via `urlFor()` for short-TTL
   *  drivers when serving detail reads. */
  url: string;
  sizeBytes?: number;
  mimeType?: string;
}

export interface DocumentStorageAdapter {
  readonly driver: StorageDriver;

  /** Upload bytes; return the key + a freshly-issued URL. */
  upload(input: UploadInput): Promise<UploadResult>;

  /** (Re-)issue a download URL for an existing key. Idempotent. */
  urlFor(key: string): Promise<string>;

  /** Delete by key. Idempotent — no error if already gone. */
  delete(key: string): Promise<void>;

  /** Sanity check the adapter can talk to its backend. Used by the
   *  /v1/health surface. Adapter-specific — Blob checks container
   *  existence; SharePoint pings the drive root. */
  isHealthy(): Promise<boolean>;
}
