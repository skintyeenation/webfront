import { Logger, Module } from '@nestjs/common';
import { AzureBlobStorageAdapter } from './azure-blob-storage.adapter';
import { SharePointStorageAdapter } from './sharepoint-storage.adapter';
import { DocumentStorageAdapter, StorageDriver } from './document-storage';

// DI token controllers depend on. Bound to a concrete adapter at boot
// based on STORAGE_DRIVER. Defaults to 'blob' so the POC works without
// any extra setup.
export const DOCUMENT_STORAGE = Symbol.for('DocumentStorageAdapter');

@Module({
  providers: [
    AzureBlobStorageAdapter,
    SharePointStorageAdapter,
    {
      provide: DOCUMENT_STORAGE,
      inject: [AzureBlobStorageAdapter, SharePointStorageAdapter],
      useFactory: (blob: AzureBlobStorageAdapter, sp: SharePointStorageAdapter): DocumentStorageAdapter => {
        const driver = (process.env.STORAGE_DRIVER ?? 'blob') as StorageDriver;
        const log = new Logger('StorageModule');
        const adapter = driver === 'sharepoint' ? sp : blob;
        log.log(`Document storage driver: ${adapter.driver}`);
        return adapter;
      },
    },
  ],
  exports: [DOCUMENT_STORAGE],
})
export class StorageModule {}
