import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from './roles';
import { GraphFeedService } from './graph-feed.service';

// Assets → Devices. Real Entra devices via Microsoft Graph /devices
// (+ registeredOwners / registeredUsers for the access list). Admin-only,
// read-only. Needs Device.Read.All on skintyee-app-graph.
//
// IMPORTANT: this only lists devices Entra knows about. On-prem AD computers
// (the OptiPlex / Latitude fleet, etc.) appear here only after Hybrid Entra
// Join syncs them — until then Graph returns just the registered ones. See
// docs/365/entra-connect.md and app/STUBS.md §2cc.
@Controller('devices')
export class DevicesController {
  constructor(private readonly graph: GraphFeedService) {}

  @Get() @Roles('admin') list() {
    return this.graph.listDevices();
  }

  @Get(':id') @Roles('admin') get(@Param('id') id: string) {
    return this.graph.getDevice(id);
  }
}
