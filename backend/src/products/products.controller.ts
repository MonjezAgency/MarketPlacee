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
    ForbiddenException,
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

    /**
     * Inventory dashboard for the supplier. Per product:
     *   • total stock     — current Product.stock (what they can still sell)
     *   • reserved units  — sum of OrderItem.quantity for orders still
     *                       in PENDING / PROCESSING / SHIPPED (decremented
     *                       from stock at order time but not yet
     *                       finally delivered or cancelled)
     *   • sold units      — sum of OrderItem.quantity for DELIVERED orders
     *   • cancelled units — sum of OrderItem.quantity for CANCELLED orders
     *                       (these were restored back to stock)
     * The supplier reads this to know "how many am I committed to ship
     * vs how many have already shipped vs how many are still on the
     * shelf for new orders".
     */
    @Get('inventory')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER)
    async getInventory(@Request() req) {
        return this.productsService.getInventoryForSupplier(req.user.sub);
    }

    /**
     * Set the stock count for one variant of a configurable product
     * (e.g. "Size=Large|Flavour=Vanilla" → 12). Supplier can hit it
     * from the inventory page's inline +/- controls.
     *
     * Ownership check: the supplier must own the product. Admins
     * and owners bypass — they can rebalance any catalog row during
     * triage.
     */
    @Patch(':id/variant-stock')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER)
    async setVariantStock(
        @Param('id') id: string,
        @Body() body: { signature: string; stock: number },
        @Request() req,
    ) {
        const isStaff = ['ADMIN', 'OWNER'].includes((req.user?.role || '').toUpperCase());
        if (!isStaff) {
            const product = await this.productsService.findOne(id);
            if (!product || product.supplierId !== req.user.sub) {
                throw new ForbiddenException('You can only manage stock on your own products.');
            }
        }
        return this.productsService.setVariantStock(id, body?.signature, body?.stock);
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
            // Surface low-confidence candidates so the UI can offer a
            // manual-pick fallback when nothing clears the strict bar.
            ...(result.rejected_candidates && result.rejected_candidates.length > 0
                ? { rejected_candidates: result.rejected_candidates }
                : {}),
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
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    async approve(@Param('id') id: string) {
        return this.productsService.updateStatus(id, ProductStatus.APPROVED);
    }

    @Patch(':id/reject')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    async reject(@Param('id') id: string, @Body('reason') reason?: string) {
        // Operator request: admin types a reason → it lands on
        // adminNotes so the supplier reads "why" on their product
        // row. Once REJECTED, the supplier can't edit the product
        // anymore — they have to create a fresh listing avoiding
        // the same mistakes.
        const text = (reason || '').trim();
        return this.productsService.updateStatus(
            id,
            ProductStatus.REJECTED,
            text || 'Rejected by admin. No specific reason provided — please create a fresh listing avoiding the gaps noted on our review queue.',
        );
    }

    /**
     * Admin sends a comment to the supplier on a submitted product
     * ("photo blurry — re-upload", "EXW missing", etc). Flips the
     * status to NEEDS_CHANGES and stores the message on adminNotes.
     * The supplier sees a yellow callout on their /supplier/products
     * row + an in-app notification + an email.
     */
    @Patch(':id/comment')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    async comment(@Param('id') id: string, @Body() body: { message: string }) {
        return this.productsService.adminComment(id, body?.message || '');
    }

    /**
     * Supplier marks a NEEDS_CHANGES product as fixed and pushes
     * it back into the admin review queue. The endpoint also
     * re-runs the required-fields gate so a supplier can't bypass
     * the validation by simply clicking Resend.
     */
    @Patch(':id/resend')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER)
    async resend(@Param('id') id: string, @Request() req: any) {
        return this.productsService.resendForReview(id, req.user.sub, (req.user.role || '').toUpperCase());
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
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER, Role.MODERATOR, Role.EDITOR)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
    async uploadImage(@UploadedFile() file: any) {
        if (!file) throw new BadRequestException('No file uploaded');
        if (!file.mimetype?.startsWith('image/')) {
            throw new BadRequestException('Only image files are allowed');
        }
        try {
            const url = await this.storageService.uploadProductImage(
                file.buffer,
                file.originalname,
                file.mimetype
            );
            return { url };
        } catch (e: any) {
            throw new BadRequestException(e?.message || 'Image upload failed');
        }
    }

    /**
     * Upload a short product demo video. Operator rule: 60 seconds
     * max, 25 MB max, MP4 / WebM / MOV only. We can't measure
     * duration server-side without ffmpeg, so the frontend enforces
     * the 60s cap via HTMLVideoElement.duration before submitting;
     * here we enforce mime + size as a server-side safety net.
     */
    @Post('upload-video')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN)
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
        }),
    )
    async uploadVideo(@UploadedFile() file: any) {
        if (!file) throw new BadRequestException('No file uploaded');
        const allowedMimes = [
            'video/mp4',
            'video/webm',
            'video/quicktime', // .mov
            'video/x-quicktime',
        ];
        if (!allowedMimes.includes(file.mimetype)) {
            throw new BadRequestException(
                `Unsupported video format (${file.mimetype}). Use MP4, WebM, or MOV.`,
            );
        }
        const url = await this.storageService.uploadProductVideo(
            file.buffer,
            file.originalname,
            file.mimetype,
        );
        return { url };
    }

    /**
     * Parse the uploaded Excel WITHOUT persisting. Returns an inspection
     * payload the frontend can show to the admin BEFORE committing —
     * helpful for catching gotchas like supplier files where prices look
     * integer ("14") but the cell actually stores a decimal ("13.55"
     * formatted to 0 decimals). The user reported wasted afternoons
     * chasing "wrong stored prices" that turned out to be hidden cell
     * formatting on the source sheet.
     *
     * Response shape (truncated):
     *   { rowCount, currency, rate, samples: [{ name, ean, raw_cell,
     *     parsed_price, after_rate, would_store_basePrice }, ...] }
     */
    @Post('bulk-upload-preview')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
    async bulkUploadPreview(
        @UploadedFile() file: any,
        @Body('currency') currency: string,
    ) {
        if (!file) throw new BadRequestException('File is required');
        const TO_EUR: Record<string, number> = {
            EUR: 1, USD: 0.926, GBP: 1.162, EGP: 0.018,
            AED: 0.252, SAR: 0.247, KWD: 3.240, QAR: 0.253,
            TRY: 0.027, INR: 0.011,
        };
        const rate = TO_EUR[currency] ?? 1;
        const report = await this.excelService.processProductsExcel(file.buffer, CreateProductDto);
        const samples = report.results.slice(0, 50).map(r => {
            const d = r.data as any;
            return {
                row_index: report.results.indexOf(r),
                name: d?.name?.slice(0, 60) || null,
                ean: d?.ean ?? null,
                raw_cell: d?.__rawPriceCell ?? null,
                parsed_price: d?.price ?? null,
                after_rate: typeof d?.price === 'number' ? +(d.price * rate).toFixed(4) : null,
                would_store_basePrice: typeof d?.price === 'number' ? +(d.price * rate).toFixed(4) : null,
                pcs_per_case: d?.unitsPerCase ?? null,
                cases_per_pallet: d?.casesPerPallet ?? null,
                pallets_per_truck: d?.palletsPerShipment ?? null,
                moq: d?.moq ?? null,
                moqUnit: d?.moqUnit ?? null,
                row_errors: r.errors || [],
                row_success: r.success,
            };
        });
        return {
            currency: currency || '<empty>',
            rate,
            rowCount: report.results.length,
            successCount: report.successCount,
            errorCount: report.errorCount,
            samples,
        };
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
            // Convert supplier prices to EUR — the platform's base currency
            // (DEFAULT_CURRENCY=eur, Romanian market).
            // Each value = how many EUR you get for 1 unit of that currency.
            // EUR stays as-is (rate = 1). Other currencies are approximate mid-market
            // rates; they can be updated via env or admin settings later.
            const TO_EUR: Record<string, number> = {
                EUR: 1,       // stays as-is
                USD: 0.926,   // 1 USD ≈ 0.926 EUR
                GBP: 1.162,   // 1 GBP ≈ 1.162 EUR
                EGP: 0.018,   // 1 EGP ≈ 0.018 EUR
                AED: 0.252,   // 1 AED ≈ 0.252 EUR
                SAR: 0.247,   // 1 SAR ≈ 0.247 EUR
                KWD: 3.240,   // 1 KWD ≈ 3.240 EUR
                QAR: 0.253,   // 1 QAR ≈ 0.253 EUR
                TRY: 0.027,   // 1 TRY ≈ 0.027 EUR
                INR: 0.011,   // 1 INR ≈ 0.011 EUR
            };
            const rate = TO_EUR[currency] ?? 1;

            // Header diagnostic. Per-row trace happens later in the batch
            // loop so we can match each row's stored basePrice back to the
            // sheet value if a price-drift bug surfaces.
            this.logger.log(
                `[BulkUpload] currency tag="${currency || '<empty>'}" → rate=${rate} ` +
                `(EUR=${TO_EUR.EUR}). ${report.results.length} rows in file. ` +
                `Per-row price trace below.`
            );

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
                    const priceInBase = dto.price ? (dto.price * rate) : 0;

                    // PER-ROW PRICE TRACE. The user reports prices being
                    // stored as different ratios of the sheet value (14 →
                    // 13.55, 17 → 17.36 etc.). This log line captures the
                    // full chain so the next upload either confirms the
                    // fix or pinpoints the next bug:
                    //   raw Excel cell → parsed dto.price → × rate → basePrice
                    const rawCell = (dto as any).__rawPriceCell;
                    this.logger.log(
                        `[BulkUpload row] name="${(dto as any).name?.slice(0, 40) || '?'}" ` +
                        `raw_cell="${rawCell !== undefined ? String(rawCell) : '?'}" ` +
                        `→ parsed=${dto.price} × rate=${rate} (currency="${currency || '<empty>'}") ` +
                        `→ priceInBase=${priceInBase} (this becomes basePrice in DB)`
                    );
                    // Strip the diagnostic tag before it reaches Prisma — it
                    // isn't a Product field and would error on persist.
                    delete (dto as any).__rawPriceCell;

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
    async update(@Param('id') id: string, @Body() updateProductDto: any, @Request() req) {
        // ── Supplier required-fields gate ─────────────────────────
        // Operator rule: a supplier can't save partial product data.
        // Every required Atlantis field must be present in the
        // post-update state, otherwise we reject the PATCH and the
        // supplier sees the exact list of missing fields.
        //
        // Admins bypass this gate — they edit during review and may
        // legitimately leave a field blank while triaging.
        const isAdmin = ['ADMIN', 'OWNER'].includes((req.user?.role || '').toUpperCase());
        if (!isAdmin) {
            const missing = await this.productsService.validateSupplierEdit(
                id,
                updateProductDto,
            );
            if (missing.length > 0) {
                throw new BadRequestException(
                    `Fill in every required field before saving. Missing: ${missing.join(', ')}.`,
                );
            }
        }

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
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    async rejectBulk(@Body() body: { ids: string[]; reason?: string }) {
        if (!body.ids || !body.ids.length) return { message: 'No IDs provided' };
        const reason = (body.reason || '').trim();
        await this.productsService.bulkReject(body.ids, reason || undefined);
        return { message: 'Products rejected', count: body.ids.length };
    }

    /**
     * Admin tool: re-convert existing products from a wrongly-assumed
     * source currency to the platform base. Two modes:
     *
     *   direction = 'multiply' (default — legacy)
     *     Multiplies basePrice and price by the EGP-per-source-unit rate.
     *     Use when prices were uploaded as EUR/USD but never converted at all.
     *
     *   direction = 'divide' (new — bulk-upload bug recovery)
     *     Divides basePrice and price by the rate. Use to UNDO the pre-fix-2
     *     bulk-upload bug where EUR prices were multiplied by 52.8 because
     *     the controller did `price / (1/52.8)` instead of `price * 1`.
     *     A €0.87 product stored as €45.94 → divide by 52.8 → back to €0.87.
     *
     * Body: { fromCurrency: 'EUR', supplierId?: string, dryRun?: boolean, direction?: 'multiply' | 'divide' }
     */
    @Post('admin/fix-currency')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async fixCurrency(@Body() body: { fromCurrency: string; supplierId?: string; dryRun?: boolean; direction?: 'multiply' | 'divide' }) {
        const fromCurrency = (body?.fromCurrency || '').toUpperCase();
        const RATES: Record<string, number> = {
            EGP: 1, USD: 48.5, EUR: 52.8, GBP: 61.4,
            AED: 13.2, SAR: 12.9, KWD: 158.0, QAR: 13.3,
            TRY: 1.49, INR: 0.583,
        };
        const rate = RATES[fromCurrency];
        if (!rate) {
            return { error: `Unsupported source currency: ${fromCurrency}` };
        }
        if (rate === 1) {
            return { error: 'Source currency is already at base rate — nothing to convert' };
        }

        const direction = body.direction === 'divide' ? 'divide' : 'multiply';
        // multiply: stored value × rate (legacy use case)
        // divide:   stored value ÷ rate (bulk-upload bug recovery)
        const multiplier = direction === 'divide' ? 1 / rate : rate;

        return this.productsService.fixProductCurrency(multiplier, body.supplierId, !!body.dryRun);
    }

    /**
     * Recompute customer-facing price for every product (or per-supplier)
     * using the CURRENT markup config. Use after fixing a corrupt markup
     * value to repair the catalog without re-uploading.
     *
     * Body: { dryRun?: boolean; supplierId?: string }
     */
    @Post('admin/recompute-prices')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async recomputePrices(@Body() body: { dryRun?: boolean; supplierId?: string }) {
        return this.productsService.recomputePricesFromMarkup({
            dryRun: !!body?.dryRun,
            supplierId: body?.supplierId,
        });
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



