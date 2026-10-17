import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Request, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ProductsService } from './products.service';
import { MAX_COMMIT_ROWS, MAX_IMPORT_ROWS_TOTAL, SupplierImportService, compactReview, type ImportRequest } from './supplier-import.service';
import { analyseWorkbook } from './import-analysis';
import { MAX_PDF_BYTES, MAX_PDF_PAGES, analysePdf } from './pdf-import';
import { ImportEnrichmentService, MAX_ENRICH_ITEMS, type EnrichItem } from './import-enrichment.service';
import { ImageLookupService } from './image-lookup.service';
import { SupplierUpdatesService, type UpdateRequest } from './supplier-updates.service';
import { SupplierOverviewService } from './supplier-overview.service';
import { ALL_FIELDS, IMPORT_FIELDS, MAX_IMPORT_BYTES, buildTemplate, matchHeaders, parseSpreadsheet } from './product-import';
import { TO_EUR, MOQ_UNITS, UNIT_TYPES, suggestedCurrency } from './catalog-rules';
import { PrismaService } from '../common/prisma.service';

/**
 * Supplier workspace API. Every route is SUPPLIER-only and scoped to the
 * caller's own id from the JWT — no supplier id is ever read from the request.
 */
@Controller('supplier-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPPLIER)
export class SupplierCatalogController {
    constructor(
        private readonly products: ProductsService,
        private readonly importer: SupplierImportService,
        private readonly images: ImageLookupService,
        private readonly overviewSvc: SupplierOverviewService,
        private readonly prisma: PrismaService,
        private readonly updates: SupplierUpdatesService,
        private readonly enrich: ImportEnrichmentService,
    ) {}

    /** ?range=3d|7d|30d|12m|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&tz=<IANA> — boundaries are resolved on the server (report-range.ts). */
    @Get('overview')
    overview(@Request() req, @Query('range') range?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('tz') tz?: string) {
        return this.overviewSvc.overview(req.user.sub, { range, from, to, tz });
    }

    /** Navigation badges: products needing the supplier (draft / rejected / needs changes) and orders awaiting their confirmation. */
    @Get('attention')
    attention(@Request() req) {
        return this.overviewSvc.attention(req.user.sub);
    }

    @Get('products')
    list(@Request() req, @Query() q: any) {
        return this.products.findMine(req.user.sub, q);
    }

    @Get('products/:id')
    one(@Request() req, @Param('id') id: string) {
        return this.products.findMineOne(id, req.user.sub);
    }

    @Get('products/:id/history')
    async history(@Request() req, @Param('id') id: string) {
        await this.products.findMineOne(id, req.user.sub); // ownership
        return this.products.changeLog(id);
    }

    /** Supplier preferences: default price currency (suggested from country until set). */
    @Get('preferences')
    async preferences(@Request() req) {
        const u: any = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { defaultCurrency: true, country: true } });
        const suggested = suggestedCurrency(u?.country);
        return { defaultCurrency: u?.defaultCurrency || null, suggestedCurrency: suggested, effectiveCurrency: u?.defaultCurrency || suggested, country: u?.country || null, currencies: Object.keys(TO_EUR), rates: TO_EUR };
    }

    @Patch('preferences')
    async setPreferences(@Request() req, @Body() body: { defaultCurrency?: string | null }) {
        const cur = body?.defaultCurrency ? String(body.defaultCurrency).toUpperCase() : null;
        if (cur && !TO_EUR[cur]) throw new BadRequestException(`Currency “${body.defaultCurrency}” isn’t supported.`);
        await this.prisma.user.update({ where: { id: req.user.sub }, data: { defaultCurrency: cur } as any });
        return this.preferences(req);
    }

    @Get('reputation')
    reputation(@Request() req) {
        return this.products.supplierReputation(req.user.sub);
    }

    // ─── Bulk import ─────────────────────────────────────────────────

    @Get('import/schema')
    schema() {
        return { fields: IMPORT_FIELDS, allFields: ALL_FIELDS.map((f) => ({ ...f, stored: f.stored !== false })), currencies: Object.keys(TO_EUR), rates: TO_EUR, moqUnits: MOQ_UNITS, unitTypes: UNIT_TYPES, maxRows: MAX_IMPORT_ROWS_TOTAL, commitRows: MAX_COMMIT_ROWS, maxBytes: MAX_IMPORT_BYTES, formats: ['.xlsx', '.xls', '.csv', '.pdf'], pdf: { maxBytes: MAX_PDF_BYTES, maxPages: MAX_PDF_PAGES, ocr: false }, photoLookup: { maxItems: MAX_ENRICH_ITEMS, sources: this.enrich.providers.map((p) => ({ id: p.id, label: p.label, license: p.license })) } };
    }

    @Get('import/template')
    template(@Query('format') format: string, @Query('variant') variant: string, @Res() res: any) {
        const f = format === 'csv' ? 'csv' : 'xlsx';
        const example = variant === 'example';
        const buf = buildTemplate(f, example ? 'example' : 'blank');
        res.setHeader('Content-Type', f === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${example ? 'atlantis-product-import-example' : 'atlantis-product-template'}.${f}"`);
        res.send(buf);
    }

    /**
     * Read the file and propose a mapping, with the evidence for each column.
     * Nothing is saved. For .xlsx the browser sends a copy without picture
     * bytes (it keeps the pictures) so large offers stay within upload limits;
     * the picture positions are still read from the copy.
     */
    @Post('import/analyse')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
    async analyse(@UploadedFile() file: any) {
        if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload.');
        const name = String(file.originalname || 'upload').slice(0, 200);
        // PDFs are recognised by their content, not the name or the browser's type.
        const isPdf = file.buffer.slice(0, 1024).indexOf('%PDF-') >= 0;
        if (isPdf || /\.pdf$/i.test(name)) return analysePdf(file.buffer, name);
        try {
            return analyseWorkbook(file.buffer, String(file.originalname || 'upload').slice(0, 200));
        } catch (e: any) {
            throw new BadRequestException(e?.message || 'Couldn’t read that file.');
        }
    }

    /** Plain one-sheet read (used by the price & stock update file). Nothing is saved. */
    @Post('import/parse')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
    parse(@UploadedFile() file: any) {
        if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload.');
        try {
            const sheet = parseSpreadsheet(file.buffer, file.originalname || 'upload');
            return { fileName: file.originalname, ...sheet, matches: matchHeaders(sheet.headers) };
        } catch (e: any) {
            throw new BadRequestException(e?.message || 'Couldn’t read that file.');
        }
    }

    @Post('import/validate')
    async validate(@Request() req, @Body() body: ImportRequest) {
        const { built, ...out } = await this.importer.validate(req.user.sub, body);
        void built;
        return compactReview(out);
    }

    /** One batch of rows (multipart: "payload" JSON + the batch's pictures as "photos", named by their path in the file). */
    @Post('import/commit')
    @Throttle({ default: { limit: 40, ttl: 60_000 } })
    // A batch carries at most 60 rows' photos (up to 5 each); the browser batches by count and size.
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 10 * 1024 * 1024, files: 300, fieldSize: 8 * 1024 * 1024 } }))
    commit(@Request() req, @Body() body: any, @UploadedFiles() files: any[] = []) {
        let payload: ImportRequest;
        try { payload = typeof body?.payload === 'string' ? JSON.parse(body.payload) : body; }
        catch { throw new BadRequestException('The import request is malformed.'); }
        const photos = (files || []).filter((f) => f.fieldname === 'photos').map((f) => ({ originalname: String(f.originalname || ''), buffer: f.buffer, mimetype: f.mimetype, size: f.size }));
        return this.importer.commit(req.user.sub, payload, photos);
    }

    // ─── Bulk price & stock updates (existing products only) ─────────

    @Get('updates/template')
    async updatesTemplate(@Request() req, @Res() res: any, @Query('blank') blank?: string) {
        const isBlank = blank === '1' || blank === 'true';
        const buf = await this.updates.template(req.user.sub, isBlank);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${isBlank ? 'atlantis-price-update-template' : 'atlantis-my-catalog-prices'}.xlsx"`);
        res.send(buf);
    }

    @Post('updates/preview')
    updatesPreview(@Request() req, @Body() body: UpdateRequest) {
        return this.updates.preview(req.user.sub, body);
    }

    @Post('updates/commit')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    updatesCommit(@Request() req, @Body() body: UpdateRequest) {
        return this.updates.commit(req.user.sub, body);
    }

    // ─── Barcode image lookup ────────────────────────────────────────

    /**
     * Lookup uses the barcode SAVED on the supplier's own product (productId),
     * so the photo is tied to what buyers will see; an unsaved barcode is refused.
     */
    @Post('image-lookup')
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    async lookup(@Request() req, @Body() body: { productId?: string; ean?: string; name?: string; brand?: string; weight?: string }) {
        let ean = String(body?.ean || '');
        if (body?.productId) {
            const p: any = await this.prisma.product.findFirst({ where: { id: String(body.productId), supplierId: req.user.sub }, select: { ean: true } });
            if (!p) throw new NotFoundException('Product not found.');
            if (!p.ean) throw new BadRequestException('To find images using a barcode, enter the product’s EAN/barcode and save the product first.');
            if (ean && ean.replace(/\D/g, '') !== String(p.ean).replace(/\D/g, '')) throw new BadRequestException('You changed the barcode. Save the product first, then search with the new barcode.');
            ean = p.ean;
        }
        return this.images.lookup(ean, body?.name, body?.brand, ((u: any, i: any) => this.enrich.queue.fetch(String(u), i)) as typeof fetch, body?.weight);
    }

    /**
     * Find photos by barcode for import rows without one (optional, read-only).
     * Starts a background search; poll its status. Nothing is stored.
     */
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

    /** Copy an accepted candidate into Atlantis storage; returns the stored URL. */
    @Post('image-lookup/accept')
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    accept(@Body() body: { url: string }) {
        return this.images.accept(String(body?.url || ''));
    }
}
