import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, callerRole, audiencesVisibleTo, canSeeAudience, DocumentAudience } from './roles';
import { DocumentsService } from './documents.service';
import { TAG_CATEGORIES } from './documents.seed';

// ---- /v1/documents --------------------------------------------------------
//
// Admin uploads / edits / deletes; everyone signed in (or public) lists and
// reads — filtered by the document's audience tier vs the caller's role.
// See docs/features/documents-and-onboarding.md for the full plan.

const VALID_AUDIENCES: DocumentAudience[] = ['admin', 'staff', 'band_member', 'public'];

function readCallerUpn(req: any): string {
  return (req.headers['x-upn'] as string | undefined) || 'unknown';
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  // GET /v1/documents — list visible documents.
  // Audience filter applied server-side based on x-role; admin sees all.
  // Query params: ?tag=<tagId>&search=<title-substring>
  @Get() async list(
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Req() req?: any,
  ) {
    const role = callerRole(req);
    return this.docs.list({
      audiences: audiencesVisibleTo(role),
      tagId: tag,
      search,
    });
  }

  // GET /v1/documents/:id — single doc (refreshes URL on read).
  @Get(':id') async getOne(@Param('id') id: string, @Req() req: any) {
    const row = await this.docs.get(id);
    if (!row) throw new NotFoundException();
    const role = callerRole(req);
    if (!canSeeAudience(role, row.audience as DocumentAudience)) {
      throw new ForbiddenException('Not visible to your role.');
    }
    return row;
  }

  // POST /v1/documents — admin upload OR link-only doc.
  // Multipart: a `file` field is optional; `payload` JSON field carries
  // title/description/audience/tagIds/linkUrl/companyId.
  @Post()
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @UploadedFile() file: any,
    @Body() body: any,
    @Req() req: any,
  ) {
    // Multipart bodies arrive as strings — clients send the metadata as
    // a JSON string in a `payload` field alongside the file part.
    const payload = body.payload ? JSON.parse(body.payload) : body;
    const audience = payload.audience ?? 'staff';
    if (!VALID_AUDIENCES.includes(audience)) {
      throw new BadRequestException(`audience must be one of ${VALID_AUDIENCES.join(', ')}`);
    }
    if (!payload.title || typeof payload.title !== 'string') {
      throw new BadRequestException('title is required');
    }
    if (!file && !payload.linkUrl) {
      throw new BadRequestException('Provide a file, a linkUrl, or both.');
    }
    return this.docs.create({
      title: payload.title.trim(),
      description: payload.description?.trim() || undefined,
      linkUrl: payload.linkUrl?.trim() || undefined,
      audience,
      companyId: payload.companyId || undefined,
      tagIds: Array.isArray(payload.tagIds) ? payload.tagIds : [],
      createdBy: readCallerUpn(req),
      file: file ? {
        fileName: file.originalname,
        mimeType: file.mimetype,
        bytes: file.buffer,
      } : undefined,
    });
  }

  // PATCH /v1/documents/:id — metadata-only edit (title, audience, tags,
  // linkUrl). Replacing the underlying file is a separate upload + new
  // document for Phase 1; versioning lands in a later phase.
  @Patch(':id') @Roles('admin') async update(@Param('id') id: string, @Body() body: any) {
    if (body.audience && !VALID_AUDIENCES.includes(body.audience)) {
      throw new BadRequestException(`audience must be one of ${VALID_AUDIENCES.join(', ')}`);
    }
    const updated = await this.docs.update(id, {
      title: body.title,
      description: body.description,
      linkUrl: body.linkUrl,
      audience: body.audience,
      companyId: body.companyId,
      tagIds: body.tagIds,
    });
    if (!updated) throw new NotFoundException();
    return updated;
  }

  // DELETE /v1/documents/:id — drops the file from storage + the row.
  @Delete(':id') @Roles('admin') @HttpCode(204) async remove(@Param('id') id: string) {
    const ok = await this.docs.remove(id);
    if (!ok) throw new NotFoundException();
  }
}

// ---- /v1/document-tags ----------------------------------------------------

@Controller('document-tags')
export class DocumentTagsController {
  constructor(private readonly docs: DocumentsService) {}

  // GET /v1/document-tags — full catalog + category labels.
  // Anyone signed in can read; admin uses for the Tag Manager UI, members
  // use for the filter chips on the Browse screen.
  @Get() async list() {
    return {
      categories: TAG_CATEGORIES,
      tags: await this.docs.listTags(),
    };
  }

  // POST /v1/document-tags — admin add.
  @Post() @Roles('admin') async create(@Body() body: any) {
    if (!body.category || !body.slug || !body.displayName) {
      throw new BadRequestException('category, slug, displayName required');
    }
    if (!['gov', 'gov_sector', 'department'].includes(body.category)) {
      throw new BadRequestException('Unknown category');
    }
    try {
      return await this.docs.createTag({
        category: body.category,
        slug: body.slug,
        displayName: body.displayName,
      });
    } catch (e: any) {
      throw new ConflictException(e?.message ?? 'Could not create tag.');
    }
  }

  // PATCH /v1/document-tags/:id — rename / re-slug. Category is immutable
  // (would shuffle the filter UI and orphan existing assignments).
  @Patch(':id') @Roles('admin') async update(@Param('id') id: string, @Body() body: any) {
    return this.docs.updateTag(id, {
      slug: body.slug,
      displayName: body.displayName,
    });
  }

  // DELETE /v1/document-tags/:id — 409 if any document carries this tag.
  @Delete(':id') @Roles('admin') async remove(@Param('id') id: string) {
    const r = await this.docs.deleteTag(id);
    if (r.deleted === false) {
      throw new ConflictException({
        message: 'Tag is in use; can\'t delete.',
        usedBy: r.usedBy,
      });
    }
    return { deleted: true };
  }
}
