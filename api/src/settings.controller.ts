import { Body, Controller, Get, Put } from '@nestjs/common';
import { Roles } from './roles';
import { NotificationSettings, SettingsService } from './settings.service';

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
