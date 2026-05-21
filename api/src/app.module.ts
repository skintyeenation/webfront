import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DataService } from './data.service';
import { RolesGuard } from './roles';
import { CONTROLLERS } from './controllers';

@Module({
  controllers: CONTROLLERS,
  providers: [
    DataService,
    // Role guard runs on every route; handlers without @Roles are public.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
