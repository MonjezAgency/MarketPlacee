import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Request, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { ALL_FIELDS, IMPORT_FIELDS, MAX_IMPORT_BYTES, buildTemplate, matchHeaders, parseSpreadsheet } from './product-import';
import { SupplierUpdatesService, type UpdateRequest } from './supplier-updates.service';
import { ProductsService } from './products.service';
import { MOQ_UNITS, TO_EUR, UNIT_TYPES } from './catalog-rules';
import { STAFF_ROLES, isStaffRole } from './catalog-scope';

/**
 * Ali FMCG Catalog import (admin). The same analysis, mapping, review, photo
 * search and batched commit as the supplier import (supplier-catalog
 * controller), with one difference in destination: rows are created under the
 * Ali FMCG platform account and matched against staff-owned products only —
 * never imported into, or matched against, a supplier's catalog.
 */
@Controller('admin-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class AdminCatalogController {
    constructor(private readonly importer: SupplierImportService, private readonly enrich: ImportEnrichmentService, private readonly prisma: PrismaService, private readonly updates: SupplierUpdatesService, private readonly products: ProductsService) {}

    /** The account that owns Ali FMCG Catalog products (same lookup as single-product create), and every staff account. */
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

    // ─── Price & stock updates of existing Ali FMCG Catalog products (the supplier tool, catalog owners) ───

    private async staffIds(): Promise<string[]> {
        return (await this.prisma.user.findMany({ where: { role: { in: [...STAFF_ROLES] as any } }, select: { id: true } })).map((u) => u.id);
    }

    /** One-sheet read for the update file. Nothing is saved. */
    @Post('import/parse')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
    parse(@UploadedFile() file: any) {
        if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload.');
        try {
            const sheet = parseSpreadsheet(file.buffer, file.originalname || 'upload');
            return { fileName: file.originalname, ...sheet, matches: matchHeaders(sheet.headers) };
        } catch (e: any) { throw new BadRequestException(e?.message || 'Couldn’t read that file.'); }
    }

    @Get('updates/template')
    async updatesTemplate(@Res() res: any, @Query('blank') blank?: string) {
        const isBlank = blank === '1' || blank === 'true';
        const buf = await this.updates.template(await this.staffIds(), isBlank);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${isBlank ? 'atlantis-price-update-template' : 'atlantis-catalog-prices'}.xlsx"`);
        res.send(buf);
    }

    @Post('updates/preview')
    async updatesPreview(@Body() body: UpdateRequest) {
        return this.updates.preview(await this.staffIds(), body);
    }

    @Post('updates/commit')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async updatesCommit(@Body() body: UpdateRequest) {
        return this.updates.commit(await this.staffIds(), body);
    }

    /**
     * Update the net price of ONE Ali FMCG Catalog product. The price is the
     * listing's own price per case in the listing currency (supplierPrice /
     * supplierCurrency → basePrice in EUR); the buyer price follows through the
     * markup on save. Same rules as a supplier changing their price
     * (ProductsService.supplierUpdate). Supplier products are refused.
     */
    @Patch('products/:id/price')
    async updatePrice(@Param('id') id: string, @Body() body: { price?: unknown; currency?: unknown; basis?: unknown }, @Request() req: any) {
        const p = await this.prisma.product.findUnique({ where: { id }, select: { id: true, supplierId: true, unitsPerCase: true, supplierCurrency: true, supplier: { select: { role: true } } } });
        if (!p) throw new NotFoundException('Product not found');
        if (!isStaffRole(p.supplier?.role)) throw new ForbiddenException({ code: 'SUPPLIER_OWNED', message: 'This product belongs to a supplier; only the supplier sets its price.' });
        const currency = String(body?.currency || p.supplierCurrency || 'EUR').toUpperCase();
        if (!TO_EUR[currency]) throw new BadRequestException({ code: 'CURRENCY', message: `Currency “${currency}” isn’t supported. Use one of ${Object.keys(TO_EUR).join(', ')}.` });
        const basis = body?.basis === 'piece' ? 'piece' : body?.basis === 'case' || body?.basis === undefined ? 'case' : null;
        if (!basis) throw new BadRequestException({ code: 'BASIS', message: 'The price must be per case or per piece.' });
        const n = typeof body?.price === 'number' ? body.price : Number(String(body?.price ?? '').trim().replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new BadRequestException({ code: 'PRICE', message: 'Enter a price above 0.' });
        let perCase = n;
        if (basis === 'piece') {
            if (!p.unitsPerCase || p.unitsPerCase <= 0) throw new BadRequestException({ code: 'NO_PACK', message: 'Pieces per case isn’t set on this product, so a piece price can’t be converted. Enter the case price, or set pieces per case first.' });
            perCase = n * p.unitsPerCase;
        }
        const saved: any = await this.products.supplierUpdate(id, p.supplierId, { supplierCurrency: currency, supplierPrice: Math.round(perCase * 10000) / 10000, changeReason: `Price updated by Ali FMCG (${String(req.user?.role || 'staff').toLowerCase()})` }, {});
        return { id: saved.id, status: saved.status, supplierCurrency: saved.supplierCurrency, supplierPrice: saved.supplierPrice, basePrice: saved.basePrice, buyerPrice: (await this.prisma.product.findUnique({ where: { id }, select: { price: true } }))?.price ?? null, unitsPerCase: p.unitsPerCase };
    }
}
