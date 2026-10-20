import { BadRequestException, Body, Controller, Get, Param, Post, Query, Request, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../common/prisma.service';
import { MAX_COMMIT_ROWS, MAX_IMPORT_ROWS_TOTAL, SupplierImportService, compactReview, type ImportMode, type ImportRequest } from './supplier-import.service';
import { analyseWorkbook } from './import-analysis';
import { MAX_PDF_BYTES, MAX_PDF_PAGES, analysePdf } from './pdf-import';
import { ImportEnrichmentService, MAX_ENRICH_ITEMS, type EnrichItem } from './import-enrichment.service';
import { ALL_FIELDS, IMPORT_FIELDS, MAX_IMPORT_BYTES, buildTemplate } from './product-import';
import { MOQ_UNITS, TO_EUR, UNIT_TYPES } from './catalog-rules';
import { STAFF_ROLES } from './catalog-scope';

/**
 * Atlantis Catalog import (admin). The same analysis, mapping, review, photo
 * search and batched commit as the supplier import (supplier-catalog
 * controller), with one difference in destination: rows are created under the
 * Atlantis platform account and matched against staff-owned products only —
 * never imported into, or matched against, a supplier's catalog.
 */
@Controller('admin-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class AdminCatalogController {
    constructor(private readonly importer: SupplierImportService, private readonly enrich: ImportEnrichmentService, private readonly prisma: PrismaService) {}

    /** The account that owns Atlantis Catalog products (same lookup as single-product create), and every staff account. */
    private async mode(req: any): Promise<{ owner: string; mode: ImportMode }> {
        const staff = await this.prisma.user.findMany({ where: { role: { in: [...STAFF_ROLES] as any } }, select: { id: true, role: true, email: true } });
        const email = (process.env.PLATFORM_OWNER_EMAIL || 'Info@atlantisfmcg.com').toLowerCase();
        const platform = staff.find((u) => ['OWNER', 'ADMIN'].includes(u.role) && (u.email.toLowerCase() === email || /atlantisfmcg\.com$/i.test(u.email)))
            || staff.find((u) => u.role === 'OWNER');
        const owner = platform?.id || req.user.sub;
        return { owner, mode: { catalog: { ownerIds: staff.map((u) => u.id), actor: { id: req.user.sub, role: req.user.role } } } };
    }

    @Get('import/schema')
    schema() {
        return { fields: IMPORT_FIELDS, allFields: ALL_FIELDS.map((f) => ({ ...f, stored: f.stored !== false })), currencies: Object.keys(TO_EUR), rates: TO_EUR, moqUnits: MOQ_UNITS, unitTypes: UNIT_TYPES, maxRows: MAX_IMPORT_ROWS_TOTAL, commitRows: MAX_COMMIT_ROWS, maxBytes: MAX_IMPORT_BYTES, formats: ['.xlsx', '.xls', '.csv', '.pdf'], pdf: { maxBytes: MAX_PDF_BYTES, maxPages: MAX_PDF_PAGES, ocr: false }, photoLookup: { maxItems: MAX_ENRICH_ITEMS, sources: this.enrich.providers.map((p) => ({ id: p.id, label: p.label, license: p.license })) }, destination: 'atlantis-catalog' };
    }

    @Get('import/template')
    template(@Query('format') format: string, @Query('variant') variant: string, @Res() res: any) {
        const f = format === 'csv' ? 'csv' : 'xlsx';
        const example = variant === 'example';
        res.setHeader('Content-Type', f === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${example ? 'atlantis-product-import-example' : 'atlantis-product-template'}.${f}"`);
        res.send(buildTemplate(f, example ? 'example' : 'blank'));
    }

    @Post('import/analyse')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
    async analyse(@UploadedFile() file: any) {
        if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload.');
        const name = String(file.originalname || 'upload').slice(0, 200);
        const isPdf = file.buffer.slice(0, 1024).indexOf('%PDF-') >= 0;
        if (isPdf || /\.pdf$/i.test(name)) return analysePdf(file.buffer, name);
        try { return analyseWorkbook(file.buffer, name); }
        catch (e: any) { throw new BadRequestException(e?.message || 'Couldn’t read that file.'); }
    }

    @Post('import/validate')
    async validate(@Request() req, @Body() body: ImportRequest) {
        const { owner, mode } = await this.mode(req);
        const { built, ...out } = await this.importer.validate(owner, body, undefined, mode);
        void built;
        return compactReview(out);
    }

    @Post('import/commit')
    @Throttle({ default: { limit: 40, ttl: 60_000 } })
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 10 * 1024 * 1024, files: 300, fieldSize: 8 * 1024 * 1024 } }))
    async commit(@Request() req, @Body() body: any, @UploadedFiles() files: any[] = []) {
        let payload: ImportRequest;
        try { payload = typeof body?.payload === 'string' ? JSON.parse(body.payload) : body; }
        catch { throw new BadRequestException('The import request is malformed.'); }
        const photos = (files || []).filter((f) => f.fieldname === 'photos').map((f) => ({ originalname: String(f.originalname || ''), buffer: f.buffer, mimetype: f.mimetype, size: f.size }));
        const { owner, mode } = await this.mode(req);
        return this.importer.commit(owner, payload, photos, mode);
    }

    @Post('import/photo-lookup')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    photoLookup(@Request() req, @Body() body: { items: EnrichItem[] }) {
        return this.enrich.start(req.user.sub, Array.isArray(body?.items) ? body.items : []);
    }

    @Get('import/photo-lookup/:id')
    @Throttle({ default: { limit: 120, ttl: 60_000 } })
    photoLookupStatus(@Request() req, @Param('id') id: string) {
        return this.enrich.status(req.user.sub, id);
    }
}
