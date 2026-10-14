import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ProductsService } from './products.service';
import { SupplierImportService, type ImportRequest } from './supplier-import.service';
import { ImageLookupService } from './image-lookup.service';
import { SupplierOverviewService } from './supplier-overview.service';
import { IMPORT_FIELDS, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, buildTemplate, matchHeaders, parseSpreadsheet } from './product-import';
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
    ) {}

    @Get('overview')
    overview(@Request() req, @Query('from') from?: string, @Query('to') to?: string) {
        return this.overviewSvc.overview(req.user.sub, from, to);
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
        return { fields: IMPORT_FIELDS, currencies: Object.keys(TO_EUR), rates: TO_EUR, moqUnits: MOQ_UNITS, unitTypes: UNIT_TYPES, maxRows: MAX_IMPORT_ROWS, maxBytes: MAX_IMPORT_BYTES, formats: ['.xlsx', '.csv'] };
    }

    @Get('import/template')
    template(@Query('format') format: string, @Res() res: any) {
        const f = format === 'csv' ? 'csv' : 'xlsx';
        const buf = buildTemplate(f);
        res.setHeader('Content-Type', f === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="atlantis-product-template.${f}"`);
        res.send(buf);
    }

    /** Read the file and propose a column mapping. Nothing is saved. */
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
        return out;
    }

    @Post('import/commit')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    commit(@Request() req, @Body() body: ImportRequest) {
        return this.importer.commit(req.user.sub, body);
    }

    // ─── Barcode image lookup ────────────────────────────────────────

    @Post('image-lookup')
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    lookup(@Body() body: { ean: string; name?: string; brand?: string }) {
        return this.images.lookup(String(body?.ean || ''), body?.name, body?.brand);
    }

    /** Copy an accepted candidate into Atlantis storage; returns the stored URL. */
    @Post('image-lookup/accept')
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    accept(@Body() body: { url: string }) {
        return this.images.accept(String(body?.url || ''));
    }
}
