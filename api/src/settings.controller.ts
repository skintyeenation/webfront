import { Body, Controller, Get, Put } from '@nestjs/common';
import { Roles } from './roles';
import { DocumentSettings, NotificationSettings, SettingsService } from './settings.service';

// Admin-only: read + update the global notification settings (per-category
// email toggles + sender/reply-to). Drives the app's System →
// "Configure Notifications" screen.
@Controller('admin/notification-settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  // GET /v1/admin/notification-settings
  @Get() @Roles('admin')
  get(): Promise<NotificationSettings> {
    return this.settings.get();
  }

  // PUT /v1/admin/notification-settings — accepts a partial patch.
  @Put() @Roles('admin')
  update(@Body() body: Partial<NotificationSettings>): Promise<NotificationSettings> {
    return this.settings.update(body ?? {});
  }
}

// Admin-only: read + update document-library settings — currently the list of
// Entra groups whose members can see finance-scoped (payroll/AP) documents.
@Controller('admin/document-settings')
export class DocumentSettingsController {
  constructor(private settings: SettingsService) {}

  // GET /v1/admin/document-settings
  @Get() @Roles('admin')
  get(): Promise<DocumentSettings> {
    return this.settings.getDocumentSettings();
  }

  // PUT /v1/admin/document-settings — accepts a partial patch.
  @Put() @Roles('admin')
  update(@Body() body: Partial<DocumentSettings>): Promise<DocumentSettings> {
    return this.settings.updateDocumentSettings(body ?? {});
  }
}
