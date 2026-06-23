import { Logger, Module } from '@nestjs/common';
import { AzureBlobStorageAdapter } from './azure-blob-storage.adapter';
import { SharePointStorageAdapter } from './sharepoint-storage.adapter';
import { LocalFileStorageAdapter } from './local-file-storage.adapter';
import { DocumentStorageAdapter, StorageDriver } from './document-storage';

// DI token controllers depend on. Bound to a concrete adapter at boot based on
// STORAGE_DRIVER. With no explicit driver: Azure Blob when its env is set,
// otherwise the local-disk adapter (so dev files survive restarts instead of
// the blob adapter's RAM-only degraded mode, which orphaned persisted DB rows).
export const DOCUMENT_STORAGE = Symbol.for('DocumentStorageAdapter');

@Module({
  providers: [
    AzureBlobStorageAdapter,
    SharePointStorageAdapter,
    LocalFileStorageAdapter,
    {
      provide: DOCUMENT_STORAGE,
      inject: [AzureBlobStorageAdapter, SharePointStorageAdapter, LocalFileStorageAdapter],
      useFactory: (
        blob: AzureBlobStorageAdapter,
        sp: SharePointStorageAdapter,
        local: LocalFileStorageAdapter,
      ): DocumentStorageAdapter => {
        const log = new Logger('StorageModule');
        const explicit = process.env.STORAGE_DRIVER as StorageDriver | undefined;
        const azureConfigured = !!(
          process.env.AZURE_STORAGE_DOCUMENTS_ACCOUNT && process.env.AZURE_STORAGE_DOCUMENTS_SAS
        );
        let adapter: DocumentStorageAdapter;
        if (explicit === 'sharepoint') adapter = sp;
        else if (explicit === 'local') adapter = local;
        else if (explicit === 'blob') adapter = blob;
        // No explicit driver: real Azure Blob when configured, else local disk
        // (persists across restarts — avoids the RAM-only "File not available."
        // 404s when DATABASE_URL is set but no Azure storage is).
        else adapter = azureConfigured ? blob : local;
        log.log(`Document storage driver: ${adapter.driver}`);
        return adapter;
      },
    },
  ],
  exports: [DOCUMENT_STORAGE],
})
export class StorageModule {}
