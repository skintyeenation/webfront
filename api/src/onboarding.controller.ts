import {
  BadRequestException,
  Body, Controller, Delete, ForbiddenException, Get,
  HttpCode, NotFoundException, Param, Patch, Post, Query, Req,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, callerRole } from './roles';
import { OnboardingService, StepCompletion } from './onboarding.service';

function readCallerUpn(req: any): string {
  return (req.headers['x-upn'] as string | undefined) || 'unknown';
}

// ---- /v1/onboarding/* -----------------------------------------------------
//
// Admin-only design + approvals; PUBLIC tokenised endpoints under
// /public/:token/* let a person view + upload to their assignment
// without authenticating.
//
// See docs/features/documents-and-onboarding.md for the full plan +
// visual conventions (borrowed from Timesheets).

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // ---- Flows -------------------------------------------------------------

  @Get('flows') @Roles('admin') async listFlows() { return this.svc.listFlows(); }

  @Get('flows/:id') @Roles('admin') async getFlow(@Param('id') id: string) {
    const r = await this.svc.getFlow(id);
    if (!r) throw new NotFoundException();
    return r;
  }

  @Post('flows') @Roles('admin') async createFlow(@Body() b: any, @Req() req: any) {
    if (!b.title) throw new BadRequestException('title required');
    return this.svc.createFlow({
      title: b.title.trim(),
      description: b.description?.trim() || undefined,
      companyId: b.companyId || undefined,
      createdBy: readCallerUpn(req),
    });
  }

  @Patch('flows/:id') @Roles('admin') async updateFlow(@Param('id') id: string, @Body() b: any) {
    const r = await this.svc.updateFlow(id, {
      title: b.title,
      description: b.description,
      active: b.active,
      companyId: b.companyId,
    });
    if (!r) throw new NotFoundException();
    return r;
  }

  @Delete('flows/:id') @Roles('admin') @HttpCode(204) async deleteFlow(@Param('id') id: string) {
    await this.svc.deleteFlow(id);
  }

  // ---- Steps -------------------------------------------------------------

  @Post('flows/:id/steps') @Roles('admin') async addStep(@Param('id') flowId: string, @Body() b: any) {
    if (!b.title) throw new BadRequestException('title required');
    const r = await this.svc.addStep(flowId, {
      title: b.title.trim(),
      instructions: b.instructions?.trim() || undefined,
      completion: b.completion as StepCompletion | undefined,
    });
    if (!r) throw new NotFoundException('Flow not found');
    return r;
  }

  @Patch('steps/:id') @Roles('admin') async updateStep(@Param('id') id: string, @Body() b: any) {
    const r = await this.svc.updateStep(id, {
      title: b.title,
      instructions: b.instructions,
      completion: b.completion,
      order: b.order,
    });
    if (!r) throw new NotFoundException();
    return r;
  }

  @Delete('steps/:id') @Roles('admin') @HttpCode(204) async deleteStep(@Param('id') id: string) {
    await this.svc.deleteStep(id);
  }

  @Post('steps/:id/documents') @Roles('admin') async attachDocument(@Param('id') stepId: string, @Body() b: any) {
    if (!b.documentId) throw new BadRequestException('documentId required');
    await this.svc.attachDocument(stepId, b.documentId, !!b.personUploadAllowed);
    return { attached: true };
  }
  @Delete('step-documents/:id') @Roles('admin') @HttpCode(204) async detachDocument(@Param('id') id: string) {
    await this.svc.detachDocument(id);
  }
  @Post('steps/:id/links') @Roles('admin') async addLink(@Param('id') stepId: string, @Body() b: any) {
    if (!b.url) throw new BadRequestException('url required');
    await this.svc.addLink(stepId, b.label || b.url, b.url);
    return { added: true };
  }
  @Delete('step-links/:id') @Roles('admin') @HttpCode(204) async removeLink(@Param('id') id: string) {
    await this.svc.removeLink(id);
  }

  // ---- People ------------------------------------------------------------

  @Get('people') @Roles('admin') async listPeople() { return this.svc.listPeople(); }

  @Patch('people/:id') @Roles('admin') async updatePerson(@Param('id') id: string, @Body() b: any) {
    const r = await this.svc.updatePerson(id, {
      displayName: b.displayName,
      email: b.email,
      phone: b.phone,
      companyId: b.companyId,
      bandMemberId: b.bandMemberId,
      timesheetsEnabled: b.timesheetsEnabled,
    });
    if (!r) throw new NotFoundException();
    return r;
  }
  @Delete('people/:id') @Roles('admin') @HttpCode(204) async deletePerson(@Param('id') id: string) {
    await this.svc.deletePerson(id);
  }

  @Post('people') @Roles('admin') async createPerson(@Body() b: any) {
    // displayName is required when there's no band-member link; the
    // linked path pulls displayName from the BandMember row, so a
    // bandMemberId payload alone is enough.
    if (!b.bandMemberId && !b.displayName) {
      throw new BadRequestException('displayName or bandMemberId required');
    }
    return this.svc.createPerson({
      displayName: b.displayName?.trim() || '',
      email: b.email?.trim() || undefined,
      phone: b.phone?.trim() || undefined,
      companyId: b.companyId || undefined,
      bandMemberId: b.bandMemberId || undefined,
      timesheetsEnabled: !!b.timesheetsEnabled,
    });
  }

  // ---- Assignments -------------------------------------------------------

  @Get('assignments') @Roles('admin') async listAssignments(
    @Query('flowId') flowId?: string,
    @Query('personId') personId?: string,
  ) {
    return this.svc.listAssignments({ flowId, personId });
  }

  @Get('assignments/:id') @Roles('admin') async getAssignment(@Param('id') id: string) {
    const r = await this.svc.getAssignment(id);
    if (!r) throw new NotFoundException();
    return r;
  }

  @Post('assignments') @Roles('admin') async createAssignment(@Body() b: any) {
    if (!b.flowId || !b.personId) {
      throw new BadRequestException('flowId + personId required');
    }
    return this.svc.createAssignment(b.flowId, b.personId);
  }

  @Post('assignments/:id/rotate-token') @Roles('admin') async rotateToken(@Param('id') id: string) {
    const tok = await this.svc.rotateToken(id);
    if (!tok) throw new NotFoundException();
    return { publicToken: tok };
  }

  // Admin actions on a single step state — Approve / Reject / Reset.
  @Post('assignments/:id/steps/:stepId/complete') @Roles('admin') async approve(
    @Param('id') id: string, @Param('stepId') stepId: string,
    @Body() b: any, @Req() req: any,
  ) {
    const r = await this.svc.markStepComplete(id, stepId, readCallerUpn(req), b.notes);
    if (!r) throw new NotFoundException();
    return r;
  }
  @Post('assignments/:id/steps/:stepId/reject') @Roles('admin') async reject(
    @Param('id') id: string, @Param('stepId') stepId: string,
    @Body() b: any, @Req() req: any,
  ) {
    const r = await this.svc.rejectStep(id, stepId, readCallerUpn(req), b.notes);
    if (!r) throw new NotFoundException();
    return r;
  }
  @Post('assignments/:id/steps/:stepId/reset') @Roles('admin') async reset(
    @Param('id') id: string, @Param('stepId') stepId: string,
  ) {
    const r = await this.svc.resetStep(id, stepId);
    if (!r) throw new NotFoundException();
    return r;
  }

  // Admin-side upload (admin uploading on behalf of the person, e.g.
  // receiving a paper form). Goes through the same path as the public
  // tokenised upload below.
  @Post('assignments/:id/steps/:stepId/upload')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file'))
  async adminUpload(
    @Param('id') id: string, @Param('stepId') stepId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('file required');
    const r = await this.svc.personUpload(id, stepId, {
      fileName: file.originalname, mimeType: file.mimetype, bytes: file.buffer,
    });
    if (!r) throw new NotFoundException();
    return r;
  }
}

// ---- Public tokenised endpoints ------------------------------------------
//
// No @Roles decorator → guarded path bypassed → anyone with the URL can
// hit these. The token IS the secret (treat like a long-lived bearer).
// Rotate via POST /onboarding/assignments/:id/rotate-token.

@Controller('onboarding/public')
export class OnboardingPublicController {
  constructor(private readonly svc: OnboardingService) {}

  @Get(':token') async view(@Param('token') token: string) {
    const r = await this.svc.getAssignmentByToken(token);
    if (!r) throw new NotFoundException();
    return r;
  }

  @Post(':token/steps/:stepId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('token') token: string, @Param('stepId') stepId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('file required');
    const a = await this.svc.getAssignmentByToken(token);
    if (!a) throw new NotFoundException('Invalid token');
    const r = await this.svc.personUpload(a.id, stepId, {
      fileName: file.originalname, mimeType: file.mimetype, bytes: file.buffer,
    });
    if (!r) throw new NotFoundException();
    return r;
  }
}
