import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentStorageAdapter,
  StorageDriver,
  UploadInput,
  UploadResult,
} from './document-storage';

// SharePoint adapter — off by default in Phase 1 (STORAGE_DRIVER=blob).
// Wired in early so the SharePoint provisioning script can flip the
// switch without code changes.
//
// Targets the `skintyee-app-forms` M365 group's Documents library via
// Microsoft Graph application permissions:
//
//   SHAREPOINT_FORMS_GROUP_ID    Entra group object id
//   SHAREPOINT_FORMS_DRIVE_NAME  driveItem folder name (default: 'Forms')
//
// Uses the same `skintyee-app-graph` app credentials already in place
// for the directory + meetings reads. Required Graph permissions
// (application, granted via scripts/setup-app-forms-sharepoint.sh):
//
//   - Sites.Selected — scoped to the new SharePoint site
//   - Group.Read.All — for the group→drive lookup
//
// Implementation status: stub. Methods throw when actually invoked
// so we don't ship broken behaviour; routing in DocumentsModule
// guards against picking this driver until the script has been run
// + Graph permissions granted.

@Injectable()
export class SharePointStorageAdapter implements DocumentStorageAdapter {
  readonly driver: StorageDriver = 'sharepoint';
  private readonly log = new Logger(SharePointStorageAdapter.name);
  private readonly groupId = process.env.SHAREPOINT_FORMS_GROUP_ID;
  private readonly driveName = process.env.SHAREPOINT_FORMS_DRIVE_NAME ?? 'Forms';

  constructor() {
    if (!this.groupId) {
      this.log.warn(
        'SharePoint storage selected but SHAREPOINT_FORMS_GROUP_ID not set. ' +
        'Run scripts/setup-app-forms-sharepoint.sh first, or fall back to STORAGE_DRIVER=blob.'
      );
    }
  }

  async upload(_input: UploadInput): Promise<UploadResult> {
    // Outline of what this needs to do once enabled:
    //   1. Resolve site + drive via /groups/{groupId}/drive
    //   2. PUT /drives/{driveId}/root:/{driveName}/{key}:/content
    //   3. Return { key: driveItem.id, url: driveItem.webUrl }
    throw new Error('SharePoint adapter not yet implemented — set STORAGE_DRIVER=blob');
  }

  async urlFor(_key: string): Promise<string> {
    throw new Error('SharePoint adapter not yet implemented — set STORAGE_DRIVER=blob');
  }

  async read(_key: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    // Would GET /drives/{driveId}/items/{key}/content. Stubbed for now.
    return null;
  }

  async delete(_key: string): Promise<void> {
    throw new Error('SharePoint adapter not yet implemented — set STORAGE_DRIVER=blob');
  }

  async isHealthy(): Promise<boolean> {
    // Until upload/urlFor are real, report unhealthy when this driver
    // is the active one. Lets /v1/health surface "switch the driver"
    // instead of silently broken.
    return false;
  }
}
