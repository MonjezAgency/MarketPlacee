import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    Logger
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PolicyGuard } from '../auth/policy.guard';
import { Roles } from '../auth/roles.decorator';
import { CheckOwnership } from '../auth/check-ownership.decorator';
import { Role, ProductStatus } from '@prisma/client';
import { ProductDto } from '../common/dtos/base.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { plainToInstance } from 'class-transformer';
import { ExcelService } from '../admin/excel.service';
import { EanService } from './ean.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('products')
export class ProductsController {
    constructor(
        private readonly productsService: ProductsService,
        private readonly excelService: ExcelService,
        private readonly eanService: EanService,
        private readonly storageService: SupabaseStorageService,
        private readonly aiAgent: AiAgentService,
        private readonly notificationsService: NotificationsService
    ) { }

    private readonly logger = new Logger(ProductsController.name);

    @Get()
    async findAll(@Request() req) {
        const { status, category, brand, minPrice, maxPrice, sort, q, limit, page } = req.query;
        const products = await this.productsService.findAll(status, { 
            category, brand, minPrice, maxPrice, sort, q, limit, page 
        });
        return products;
    }

    @Get('search')
    async search(@Query('q') q: string) {
        if (!q) return [];
        return this.productsService.search(q);
    }

    @Get('my-products')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER)
    async findMyProducts(@Request() req) {
        const products = await this.productsService.findBySupplier(req.user.sub);
        // Map basePrice → price so suppliers see their original price, not the markup
        return products.map(p => ({
            ...p,
            price: p.basePrice ?? p.price,
        }));
    }

    // ─── Static routes MUST come before :id param routes ───────────────────

    @Get('admin/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async findAllAdmin() {
        return this.productsService.findAllAdmin();
    }

    @Get('cart/recommendations')
    async getRecommendations(@Request() req) {
        const categories = req.query.categories ? req.query.categories.split(',').filter(Boolean) : [];
        const excludeIds = req.query.excludeIds ? req.query.excludeIds.split(',').filter(Boolean) : [];

        const recommendations = await this.productsService.findRecommendations(categories, excludeIds);
        return plainToInstance(ProductDto, recommendations);
    }

    @Get('ean/:ean')
    async findImagesByEan(
        @Param('ean') ean: string,
        @Query('limit') limit?: string,
        @Query('name') name?: string,
    ) {
        const images = await this.eanService.fetchImagesByEan(ean, limit ? parseInt(limit) : 3, name);
        return { imageUrls: images };
    }

    /**
     * Structured EAN lookup with AI validation + caching.
     * Matches the user-facing spec exactly:
     *   POST /products/ean-lookup  { ean, title?, image_count?, brand? }
     *   →  { ean, title, images, cached, confidence_score, matched, source, reason? }
     *
     * The endpoint is public (no auth) to support the AddProductDrawer / bulk
     * upload preview flows where the user is creating a product before it's
     * persisted. Throttling is handled at the OpenRouter layer.
     */
    @Post('ean-lookup')
    async lookupEan(@Body() body: { ean: string; title?: string; image_count?: number; brand?: string; refresh?: boolean }) {
        const result = await this.eanService.fetchProductByEan(
            String(body.ean || '').trim(),
            body.title,
            body.image_count || 3,
            { brand: body.brand, skipCache: !!body.refresh },
        );
        return {
            ean: result.ean,
            title: result.title,
            images: result.images,
            cached: result.cached === true,
            confidence_score: result.confidence_score ?? 0,
            matched: result.matched,
            source: result.source,
            ...(result.reason ? { reason: result.reason } : {}),
        };
    }

    /** Public endpoint — products that recently changed price, for the live header ticker */
    @Get('price-ticker')
    async getPriceTicker(@Query('limit') limit?: string) {
        return this.productsService.findRecentPriceChanges(limit ? parseInt(limit) : 30);
    }

    // ─── Parameterized :id routes ──────────────────────────────────────────

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const product = await this.productsService.findOne(id);
        return plainToInstance(ProductDto, product);
    }

    @Get(':id/similar')
    async getSimilar(@Param('id') id: string) {
        const product = await this.productsService.findOne(id);
        if (!product) return [];
        const recs = await this.productsService.findRecommendations(
            [product.category],
            [id],
            6,
        );
        return plainToInstance(ProductDto, recs);
    }

    @Patch(':id/approve')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async approve(@Param('id') id: string) {
        return this.productsService.updateStatus(id, ProductStatus.APPROVED);
    }

    @Patch(':id/reject')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async reject(@Param('id') id: string) {
        return this.productsService.updateStatus(id, ProductStatus.REJECTED);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN)
    async create(@Body() createProductDto: any, @Request() req) {
        const isAdmin = req.user.role === Role.ADMIN;
        const supplierId = isAdmin ? (createProductDto.supplierId || req.user.sub) : req.user.sub;

        // AI Auto-Categorization
        if (!createProductDto.category || createProductDto.category === 'General') {
            const categories = ['Food & Beverages', 'Personal Care', 'Household', 'Packaging'];
            const autoCat = await this.aiAgent.categorizeProduct(
                createProductDto.name, 
                createProductDto.description || '', 
                categories
            );
            if (autoCat) createProductDto.category = autoCat;
            else if (!createProductDto.category) createProductDto.category = 'General';
        }

        const product = await this.productsService.create({
            ...createProductDto,
            supplierId,
        }, isAdmin);

        return plainToInstance(ProductDto, product);
    }

    @Post('upload-image')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN)
    @UseInterceptors(FileInterceptor('file'))
    async uploadImage(@UploadedFile() file: any) {
        if (!file) throw new BadRequestException('No file uploaded');
        const url = await this.storageService.uploadProductImage(
            file.buffer,
            file.originalname,
            file.mimetype
        );
        return { url };
    }

    @Post('bulk-upload')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
    async bulkUpload(@UploadedFile() file: any, @Body('currency') currency: string, @Request() req) {
        this.logger.log(`[BulkUpload] User=${req.user?.sub} role=${req.user?.role} file=${file ? file.originalname : 'MISSING'}`);
        try {
            if (!file) throw new Error('File is required');

            const isAdmin = req.user.role === Role.ADMIN;
            const report = await this.excelService.processProductsExcel(file.buffer, CreateProductDto);

            // PRE-FETCH FOR PERFORMANCE
            const [configs, categories, user] = await Promise.all([
                this.productsService.getAppConfigs(),
                this.productsService.getDistinctCategories(),
                isAdmin ? null : this.productsService.getUserKycStatus(req.user.sub)
            ]);

            const createdProducts: any[] = [];
            const EGP_RATES: Record<string, number> = {
                EGP: 1, USD: 1 / 48.5, EUR: 1 / 52.8, GBP: 1 / 61.4,
                AED: 1 / 13.2, SAR: 1 / 12.9, KWD: 1 / 158.0, QAR: 1 / 13.3,
                TRY: 1 / 1.49, INR: 1 / 0.583,
            };
            const rate = EGP_RATES[currency] ?? 1;

            // Default image-count when fetching by EAN. Configurable via
            // BULK_UPLOAD_EAN_IMAGE_COUNT in admin settings (defaults to 3).
            const eanImageCountConfig = configs.find((c: any) => c.key === 'BULK_UPLOAD_EAN_IMAGE_COUNT');
            const eanImageCount = eanImageCountConfig?.value ? Math.max(1, Math.min(parseInt(eanImageCountConfig.value, 10) || 3, 10)) : 3;

            // Parallel batches — sequential awaits on N rows used to take
            // forever for big files. We run rows in batches of 10 in parallel.
            const successResults = report.results.filter(r => r.success && r.data);
            const BATCH_SIZE = 10;
            for (let batchStart = 0; batchStart < successResults.length; batchStart += BATCH_SIZE) {
                const batch = successResults.slice(batchStart, batchStart + BATCH_SIZE);
                await Promise.all(batch.map(async (result) => {
                    const dto = result.data as CreateProductDto;
                    const supplierId = isAdmin ? (dto.supplierId || req.user.sub) : req.user.sub;
                    const priceInBase = dto.price ? (dto.price / rate) : 0;

                    // ── EAN-based image fetch ────────────────────────────
                    // If no images provided in the row AND we have an EAN,
                    // fetch product photos from Open Food Facts → UPCItemDB
                    // → BarcodeSpider chain. White background is best-effort.
                    if ((!dto.images || dto.images.length === 0) && (dto as any).ean) {
                        try {
                            const fetched = await this.eanService.fetchImagesByEan(
                                String((dto as any).ean),
                                eanImageCount,
                                (dto as any).name,
                            );
                            if (fetched.length > 0) (dto as any).images = fetched;
                        } catch (_e) { /* non-fatal */ }
                    }

                    try {
                        const product = await this.productsService.create({
                            ...dto,
                            price: priceInBase,
                            supplierId,
                        }, isAdmin, true, {
                            preFetchedConfigs: configs,
                            preFetchedCategories: categories,
                            supplierKycStatus: isAdmin ? undefined : user?.kycStatus
                        }); // skipAi=true → no per-row Google Translate calls
                        createdProducts.push(product);
                        (result as any).message = 'Created successfully';
                    } catch (e) {
                        result.success = false;
                        result.errors = result.errors || [];
                        const errorMsg = e.response?.message || e.message || 'Unknown database error';
                        result.errors.push(Array.isArray(errorMsg) ? errorMsg.join(', ') : errorMsg);
                        report.successCount--;
                        report.errorCount++;
                    }
                }));
            }

            // Notify Admins ONCE after bulk upload if products were created by a supplier
            if (!isAdmin && createdProducts.length > 0) {
                this.notificationsService.notifyAdmins(
                    'Bulk Products Uploaded',
                    `${createdProducts.length} new products submitted by supplier: ${req.user.name || req.user.sub}`,
                    'INFO',
                    { count: createdProducts.length }
                ).catch(() => {});
            }

            return { 
                ...report, 
                createdCount: createdProducts.length,
                success: createdProducts.length > 0 
            };
        } catch (error) {
            this.logger.error(`[BulkUpload] Error: ${error?.message}`);
            return { totalRows: 0, successCount: 0, errorCount: 0, createdCount: 0, results: [], error: error.message || 'Unknown error processing file' };
        }
    }

    @Patch(':id/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async updateStatus(
        @Param('id') id: string,
        @Body() body: { status: ProductStatus; adminNotes?: string }
    ) {
        return this.productsService.updateStatus(id, body.status, body.adminNotes);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard, PolicyGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN)
    @CheckOwnership('PRODUCT')
    async update(@Param('id') id: string, @Body() updateProductDto: any) {
        // AI Auto-Categorization on update if name changed and category is missing/General
        if (updateProductDto.name && (!updateProductDto.category || updateProductDto.category === 'General')) {
            const categories = ['Food & Beverages', 'Personal Care', 'Household', 'Packaging'];
            const autoCat = await this.aiAgent.categorizeProduct(
                updateProductDto.name, 
                updateProductDto.description || '', 
                categories
            );
            if (autoCat) updateProductDto.category = autoCat;
        }
        return this.productsService.update(id, updateProductDto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async remove(@Param('id') id: string) {
        await this.productsService.deleteProduct(id);
        return { message: 'Product deleted' };
    }

    @Post('bulk-delete')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPPLIER)
    async removeBulk(@Body() body: { ids: string[] }, @Request() req) {
        if (!body.ids || !body.ids.length) return { message: 'No IDs provided' };
        const isAdmin = req.user.role === Role.ADMIN;
        const supplierId = isAdmin ? undefined : req.user.sub;
        await this.productsService.deleteProducts(body.ids, supplierId);
        return { message: 'Products deleted', count: body.ids.length };
    }

    @Post('bulk-approve')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async approveBulk(@Body() body: { ids: string[] }) {
        if (!body.ids || !body.ids.length) return { message: 'No IDs provided' };
        await this.productsService.bulkApprove(body.ids);
        return { message: 'Products approved', count: body.ids.length };
    }

    @Post('bulk-reject')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async rejectBulk(@Body() body: { ids: string[] }) {
        if (!body.ids || !body.ids.length) return { message: 'No IDs provided' };
        await this.productsService.bulkReject(body.ids);
        return { message: 'Products rejected', count: body.ids.length };
    }

    /**
     * Admin tool: re-convert existing products from a wrongly-assumed
     * source currency to the EGP base. Use when products were bulk-uploaded
     * without selecting the correct currency (so values were stored as EGP
     * but were really EUR/USD/etc.). Multiplies basePrice and price by the
     * EGP-per-source-unit rate.
     *
     * Body: { fromCurrency: 'EUR', supplierId?: string, dryRun?: boolean }
     */
    @Post('admin/fix-currency')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async fixCurrency(@Body() body: { fromCurrency: string; supplierId?: string; dryRun?: boolean }) {
        const fromCurrency = (body?.fromCurrency || '').toUpperCase();
        const RATES: Record<string, number> = {
            EGP: 1, USD: 48.5, EUR: 52.8, GBP: 61.4,
            AED: 13.2, SAR: 12.9, KWD: 158.0, QAR: 13.3,
            TRY: 1.49, INR: 0.583,
        };
        const multiplier = RATES[fromCurrency];
        if (!multiplier) {
            return { error: `Unsupported source currency: ${fromCurrency}` };
        }
        if (multiplier === 1) {
            return { error: 'Source currency is already EGP — nothing to convert' };
        }

        return this.productsService.fixProductCurrency(multiplier, body.supplierId, !!body.dryRun);
    }

    @Post(':id/rate')
    @UseGuards(JwtAuthGuard)
    async rateProduct(@Param('id') id: string, @Body() body: { rating: number }) {
        if (body.rating === undefined || body.rating < 1 || body.rating > 5) {
            throw new BadRequestException('Rating must be between 1 and 5');
        }
        return this.productsService.rateProduct(id, body.rating);
    }

    @Get('dev/fixup')
    async fixup() {
        return this.productsService.fixupIncompleteProducts();
    }
}



