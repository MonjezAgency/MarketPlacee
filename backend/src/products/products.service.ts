import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EanService } from './ean.service';
import { translateProduct } from '../common/translator';

import { AiAgentService } from '../ai-agent/ai-agent.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ProductsService {
    private readonly logger = new Logger(ProductsService.name);
    constructor(
        private prisma: PrismaService,
        private eanService: EanService,
        private aiAgent: AiAgentService,
        private notificationsService: NotificationsService,
        private emailService: EmailService,
    ) { }

    private extractCategoryFromName(name: string, currentCategory?: string): string {
        const unitKeywords = ['CARTON', 'PALLET', 'UNIT', 'CASE', 'BOX', 'PACK', 'KG', 'GRAM', 'LITER', 'PCS', 'PIECES', 'PIECE'];
        const cat = currentCategory?.toUpperCase() || '';

        // Only attempt to fix if category is missing, generic, or a unit
        if (!cat || cat === 'GENERAL' || cat === 'OTHERS' || unitKeywords.includes(cat)) {
            const n = name.toLowerCase();
            
            // Beverages
            if (n.includes('pepsi') || n.includes('cola') || n.includes('fanta') || n.includes('sprite') || n.includes('soda')) return 'Soft Drinks';
            if (n.includes('red bull') || n.includes('monster') || n.includes('energy drink') || n.includes('v-energy')) return 'Energy Drinks';
            if (n.includes('water') || n.includes('evian') || n.includes('aquafina')) return 'Beverages';
            if (n.includes('coffee') || n.includes('nescafe') || n.includes('tea') || n.includes('lipton')) return 'Coffee & Tea';
            if (n.includes('juice') || n.includes('frootz')) return 'Juice & Nectars';
            
            // Personal Care & Beauty
            if (n.includes('shampoo') || n.includes('conditioner') || n.includes('hair')) return 'Hair Care';
            if (n.includes('cream') || n.includes('lotion') || n.includes('nivea') || n.includes('dove')) return 'Skincare';
            if (n.includes('makeup') || n.includes('lipstick') || n.includes('mascara')) return 'Beauty & Makeup';
            if (n.includes('perfume') || n.includes('fragrance') || n.includes('scent')) return 'Fragrances & Perfumes';
            
            // Snacks & Food
            if (n.includes('chocolate') || n.includes('ferrero') || n.includes('nutella') || n.includes('kinder')) return 'Chocolates & Sweets';
            if (n.includes('biscuit') || n.includes('cookie') || n.includes('oreo')) return 'Snacks & Biscuits';
            if (n.includes('pasta') || n.includes('rice') || n.includes('flour')) return 'Pantry & Grains';
            
            // Home & Cleaning
            if (n.includes('detergent') || n.includes('ariel') || n.includes('persil') || n.includes('laundry')) return 'Laundry & Detergents';
            if (n.includes('soap') || n.includes('dettol') || n.includes('cleaning')) return 'Household & Cleaning';

            // If it was a unit, return a better default
            if (unitKeywords.includes(cat)) return 'General Distribution';
        }

        return currentCategory || 'General';
    }

    /**
     * Pull a brand out of a free-form product name when the supplier
     * didn't fill the brand field. First tries a known-brand list; if
     * nothing matches, falls back to the first capitalised token ≥3
     * chars that isn't a number or weight token. Mirrors the same
     * heuristic in ExcelService.enrichFromName so single creates and
     * bulk uploads behave identically.
     */
    private extractBrandFromName(name: string): string | null {
        if (!name) return null;
        const KNOWN = [
            'Nestle', 'Nestlé', 'Pepsi', 'Coca-Cola', 'Coca Cola', 'Red Bull',
            'KitKat', 'Kit Kat', 'Tena', 'Pampers', 'Always',
            'P&G', 'Procter', 'Unilever', 'Mars', 'Ferrero', 'Kellogg',
            'Haribo', 'Storck', 'Bahlsen', 'Lindt', 'Cadbury', 'Hershey',
            'Trolli', 'Nesquik', 'Lipton', 'Ahmad', 'Twinings',
            "Lay's", 'Pringles', 'Doritos', "Tony's Chocolonely",
            'Ritter Sport', 'Milka', 'Toblerone',
            'Swiffer', 'Ariel', 'Tide', 'Persil', 'Comfort',
            'Lavazza', 'Nescafé', 'Nescafe', 'Heinz', 'Barilla',
            'Evian', 'Tabasco', 'Domestos', 'Flash', 'Fairy', 'Tork',
            'Dettol', 'Dove', 'Colgate', 'Head & Shoulders', 'Gillette',
            'Navigator', 'Post-it', 'BIC', '3M', 'Ansell', 'Portwest',
            'Centrum', 'Glucerna', 'Abbott',
        ];
        const lower = name.toLowerCase();
        for (const b of KNOWN) {
            const re = new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (re.test(name) || lower.includes(b.toLowerCase())) return b;
        }
        const firstWord = name.split(/\s+/)[0];
        if (
            firstWord &&
            firstWord.length >= 3 &&
            /^[A-Z]/.test(firstWord) &&
            !/^\d/.test(firstWord) &&
            !/^(case|pack|carton|box|pallet|piece|unit)$/i.test(firstWord)
        ) {
            return firstWord;
        }
        return null;
    }

    /**
     * Pull a weight / size token out of a free-form product name.
     * Returns the raw token (e.g. "250g", "237ml", "1.5L") rather
     * than a numeric kg value so the DB string column stays
     * lossless — the frontend renders it as-is.
     */
    private extractWeightFromName(name: string): string | null {
        if (!name) return null;
        const match = name.match(/(\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g|oz|lb|cl))\b/i);
        if (!match) return null;
        return match[1].replace(/\s+/g, '').toLowerCase();
    }

    async getAppConfigs() {
        return this.prisma.appConfig.findMany();
    }

    async getDistinctCategories() {
        const categories = await this.prisma.product.findMany({ select: { category: true }, distinct: ['category'] });
        return categories.map(c => c.category).filter(c => c && c !== 'General');
    }

    async getUserKycStatus(userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: { kycStatus: true }
        });
    }

    async create(createProductDto: CreateProductDto, isAdmin: boolean = false, skipAi: boolean = false, options?: { preFetchedConfigs?: any[], preFetchedCategories?: string[], supplierKycStatus?: string }) {
        // KYC enforcement DISABLED — operator decision to let
        // suppliers list products immediately without an identity-
        // verification gate. The KYC module + AI checks + admin
        // review tab all stay in place; only the listing-block is
        // suppressed. To re-enable, restore the block below:
        //
        // if (!isAdmin && createProductDto.supplierId) {
        //     const kycStatus = options?.supplierKycStatus || (await this.prisma.user.findUnique({
        //         where: { id: createProductDto.supplierId },
        //         select: { kycStatus: true },
        //     }))?.kycStatus;
        //     if (kycStatus === 'UNVERIFIED') {
        //         throw new ForbiddenException('Identity verification required. Please submit your documents before listing products.');
        //     }
        // }

        // Fetch markup setting based on unit
        const unit = createProductDto.unit?.toLowerCase() || 'piece';
        let configKey = 'MARKUP_PERCENTAGE'; // Support legacy/default key

        if (unit.includes('pallet')) configKey = 'MARKUP_PERCENTAGE_PALLET';
        else if (unit.includes('container') || unit.includes('truck')) configKey = 'MARKUP_PERCENTAGE_CONTAINER';
        else configKey = 'MARKUP_PERCENTAGE_PIECE';

        let config = options?.preFetchedConfigs?.find(c => c.key === configKey);

        // Fallback to general markup if specific unit markup not found
        if (!config && options?.preFetchedConfigs) {
            config = options.preFetchedConfigs.find(c => c.key === 'MARKUP_PERCENTAGE');
        }

        // If not pre-fetched, fetch from DB
        if (!config && !options?.preFetchedConfigs) {
            config = await this.prisma.appConfig.findUnique({
                where: { key: configKey }
            });
            if (!config) {
                config = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE' } });
            }
        }

        // Default markups based on unit if nothing is set in DB: piece=10%, pallet=5%, container=2%
        let defaultMarkup = 1.10;
        if (unit.includes('pallet')) defaultMarkup = 1.05;
        else if (unit.includes('container') || unit.includes('truck')) defaultMarkup = 1.02;

        const markupPercentage = config && config.value ? parseFloat(config.value) : defaultMarkup;
        let finalMarkup = isNaN(markupPercentage) ? defaultMarkup : markupPercentage;

        // Sanity-check the markup multiplier. A markup MUST be >= 1.0
        // (1.0 = no markup, 1.05 = +5%, 1.50 = +50%). If we read a value
        // below 1.0 from AppConfig, it's almost certainly a misconfiguration
        // — common examples: someone wrote "0.019" (the EUR/EGP exchange
        // rate) into MARKUP_PERCENTAGE_PIECE, or wrote "5" intending "5%".
        // Without this guard a 16€ supplier price gets stored as 0.30€
        // instead of 16.50€. Fall back to the unit-aware default so the
        // catalog stays sane, and log loudly so the admin can fix the config.
        if (!isFinite(finalMarkup) || finalMarkup < 1.0) {
            this.logger.warn(
                `Suspect markup value ${finalMarkup} read from AppConfig key ` +
                `"${configKey}" — must be >= 1.0. Falling back to default ` +
                `${defaultMarkup}. Check the OWNER → markup settings; the ` +
                `field expects a multiplier like 1.05 (= +5%), not a ` +
                `percentage or an exchange rate.`
            );
            finalMarkup = defaultMarkup;
        }

        // Fetch EAN images if ean is provided and no images are uploaded.
        // Pass product name so the Google/Bing fallback can use it as a smarter query.
        let productImages = createProductDto.images || [];
        if (!skipAi && createProductDto.ean && productImages.length === 0) {
            const fetchedImages = await this.eanService.fetchImagesByEan(
                createProductDto.ean,
                3,
                createProductDto.name,
            );
            if (fetchedImages && fetchedImages.length > 0) {
                productImages = fetchedImages;
            }
        }

        const hasRealImage = productImages.some(img => img && img.trim() !== '');
        const isMissingInfo = !createProductDto.name || createProductDto.name.trim() === '' || !createProductDto.description || createProductDto.description.trim() === '' || !hasRealImage;
        let finalStatus = isAdmin ? ProductStatus.APPROVED : ProductStatus.PENDING;
        let adminNotes = createProductDto.adminNotes || null;

        if (isMissingInfo) {
            finalStatus = ProductStatus.PENDING;
            const missing = [];
            if (!createProductDto.name || createProductDto.name.trim() === '') missing.push('Title');
            if (!createProductDto.description || createProductDto.description.trim() === '') missing.push('Description');
            if (!hasRealImage) missing.push('Image');
            
            const msg = `System Warning: Product incomplete. Missing: ${missing.join(', ')}. Please update before approval.`;
            adminNotes = adminNotes ? `${adminNotes} | ${msg}` : msg;
        }

        // Auto-categorize if missing or incorrect (unit-based)
        let finalCategory = this.extractCategoryFromName(createProductDto.name, createProductDto.category);
        
        if (!skipAi && (!finalCategory || finalCategory.toLowerCase() === 'general' || finalCategory.toLowerCase() === 'others')) {
            let catList = options?.preFetchedCategories;
            if (!catList) {
                const categories = await this.prisma.product.findMany({ select: { category: true }, distinct: ['category'] });
                catList = categories.map(c => c.category).filter(c => c && c !== 'General');
            }
            if (catList && catList.length > 0 && createProductDto.name) {
                const suggested = await this.aiAgent.categorizeProduct(createProductDto.name, createProductDto.description || '', catList);
                if (suggested) finalCategory = suggested;
            }
        }

        // Auto-extract brand + weight from the product name when the
        // caller didn't supply them. Mirrors the Excel parser's
        // enrichFromName so single-product creates (supplier form,
        // admin form) get the same intelligent fill-in:
        //
        //   "Pepsi Diet 150ml" → brand "Pepsi", weight "150ml"
        //   "Lavazza Crema 250g" → brand "Lavazza", weight "250g"
        //
        // Operator-requested: the supplier shouldn't have to retype
        // weight + brand if both are already in the name string.
        const dtoMutable = createProductDto as any;
        if (dtoMutable.name) {
            if (!dtoMutable.brand) {
                const extracted = this.extractBrandFromName(dtoMutable.name);
                if (extracted) dtoMutable.brand = extracted;
            }
            if (!dtoMutable.weight) {
                const extracted = this.extractWeightFromName(dtoMutable.name);
                if (extracted) dtoMutable.weight = extracted;
            }
        }

        try {
            const dto = createProductDto as any;
            const productData: any = {
                // Explicit whitelist of all valid Product model fields
                // (prevents unknown-field Prisma errors when the DTO has extra properties)
                name: dto.name,
                description: dto.description || '',
                brand: dto.brand || null,
                ean: dto.ean || null,
                stock: dto.stock ?? 0,
                category: finalCategory || 'General',
                adminNotes,
                status: finalStatus,
                basePrice: dto.price,
                price: dto.price * finalMarkup,
                images: productImages,
                videos: Array.isArray(dto.videos) ? dto.videos.filter((v: any) => typeof v === 'string' && v.trim()) : [],
                supplierId: dto.supplierId,
                unit: dto.unit || 'piece',
                moq: dto.moq ?? null,
                moqUnit: dto.moqUnit ? String(dto.moqUnit).toUpperCase() : 'PIECE',
                unitsPerCase: dto.unitsPerCase ?? null,
                casesPerPallet: dto.casesPerPallet ?? null,
                unitsPerPallet: dto.unitsPerPallet ?? null,
                palletsPerShipment: dto.palletsPerShipment ?? null,
                shelfLife: dto.shelfLife || null,
                weight: dto.weight || null,         // stored as String? in schema
                origin: dto.origin || null,         // stored as String? in schema
                readyForDispatch: dto.readyForDispatch ?? true,
                leadTime: dto.leadTime ?? 0,
                warehouseId: dto.warehouseId || null,
            };
            const product = await (this.prisma.product.create as any)({
                data: productData,
            });

            // Automatic Translation — SKIPPED in bulk uploads (skipAi=true)
            // because translateProduct makes 6 sequential HTTP calls to Google
            // Translate per product (3 langs × 2 fields), turning a 50-row
            // Excel into 300 sequential HTTP calls → request times out.
            // Translation can be backfilled later by a cron/admin action.
            if (!skipAi) try {
                const translations = await translateProduct({
                    name: product.name,
                    description: product.description || ''
                });
                const variants = (product.variants as any[]) || [];
                // Check if already exists to avoid duplicates
                const transIndex = variants.findIndex(v => v.name === '__translations');
                const transObj = { name: '__translations', values: [JSON.stringify(translations)] };
                if (transIndex > -1) variants[transIndex] = transObj;
                else variants.push(transObj);

                await this.prisma.product.update({
                    where: { id: product.id },
                    data: { variants }
                });
            } catch (err) {
                this.logger.error(`Auto-translation failed for product ${product.id}: ${err.message}`);
            }

            // Notify Admins if created by supplier
            if (!isAdmin && product.supplierId && !skipAi) {
                this.notificationsService.notifyAdmins(
                    'New Product Submitted',
                    `New product "${product.name}" from supplier ID: ${product.supplierId} is waiting for review.`,
                    'INFO',
                    { productId: product.id }
                ).catch(() => {});
            }

            return product;
        } catch (error) {
            throw error;
        }
    }

    async findAll(status?: ProductStatus, filters?: { category?: string; brand?: string; minPrice?: string; maxPrice?: string; sort?: string; q?: string; page?: string; limit?: string }) {
        const where: any = {};
        if (status) {
            // Robust case-insensitive status handling
            const statusUpper = status.toString().toUpperCase();
            where.status = statusUpper as ProductStatus;
        }

        // Text search (Tokenized for better eCommerce exact/partial matching)
        if (filters?.q) {
            const terms = filters.q.trim().split(/\s+/).filter(t => t.length > 0);
            if (terms.length > 0) {
                where.AND = terms.map(term => ({
                    OR: [
                        { name: { contains: term, mode: 'insensitive' } },
                        { description: { contains: term, mode: 'insensitive' } },
                        { category: { contains: term, mode: 'insensitive' } },
                        { brand: { contains: term, mode: 'insensitive' } },
                        { ean: { contains: term, mode: 'insensitive' } },
                    ]
                }));
            }
        }

        // Category filter
        if (filters?.category) where.category = { contains: filters.category, mode: 'insensitive' };

        // Brand filter
        if (filters?.brand) where.brand = { contains: filters.brand, mode: 'insensitive' };

        // Price range
        if (filters?.minPrice || filters?.maxPrice) {
            where.price = {};
            if (filters.minPrice) where.price.gte = parseFloat(filters.minPrice);
            if (filters.maxPrice) where.price.lte = parseFloat(filters.maxPrice);
        }

        // Safety: Only apply minimal requirements for the public marketplace (APPROVED).
        if (status && status.toString().toUpperCase() === 'APPROVED') {
            // Remove all names/description checks to trust Admin approval absolutely
            // where.AND = [...];
        }

        // Sort order
        let orderBy: any = { createdAt: 'desc' };
        if (filters?.sort === 'price_asc') orderBy = { price: 'asc' };
        else if (filters?.sort === 'price_desc') orderBy = { price: 'desc' };
        else if (filters?.sort === 'name_asc') orderBy = { name: 'asc' };
        else if (filters?.sort === 'popular') orderBy = [
            { rating: 'desc' },
            { reviewsCount: 'desc' }
        ];
        else if (filters?.sort === 'newest') orderBy = { createdAt: 'desc' };

        const page = Math.max(1, parseInt(filters?.page || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(filters?.limit || '24', 10)));
        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            this.prisma.product.findMany({
                where,
                include: {
                    supplier: {
                        select: { id: true, name: true, email: true, companyName: true, role: true }
                    }
                },
                orderBy,
                skip,
                take: limit,
            }),
            this.prisma.product.count({ where }),
        ]);

        return {
            data: products,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findAllAdmin() {
        return this.prisma.product.findMany({
            include: {
                supplier: {
                    select: { id: true, name: true, email: true, companyName: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Returns products with a recent price change for the live ticker.
     * Each item includes: name, ean, brand, image, current price (EGP base),
     * previous price (EGP base), and the delta. The frontend converts to the
     * user's display currency.
     */
    async findRecentPriceChanges(limit: number = 30) {
        const products = await this.prisma.product.findMany({
            where: {
                status: 'APPROVED',
                previousPrice: { not: null },
                priceChangedAt: { not: null },
            },
            select: {
                id: true,
                name: true,
                ean: true,
                brand: true,
                images: true,
                price: true,
                previousPrice: true,
                priceChangedAt: true,
                supplier: { select: { name: true, companyName: true } },
            },
            orderBy: { priceChangedAt: 'desc' },
            take: limit,
        });

        return products.map(p => ({
            id: p.id,
            name: p.name,
            ean: p.ean,
            brand: p.brand || p.supplier?.companyName || p.supplier?.name || null,
            image: p.images?.[0] || null,
            price: p.price,
            previousPrice: p.previousPrice,
            delta: p.price - (p.previousPrice ?? p.price),
            changedAt: p.priceChangedAt,
        }));
    }

    /**
     * Required-fields gate. Supplier products MUST have every one of
     * these populated before the row reaches admin review (operator
     * decision). Description is the only free pass.
     *
     * Returns the list of missing field labels — empty array means
     * the row is good to submit.
     */
    /**
     * Public wrapper around requiredSupplierFieldsMissing. Loads the
     * existing product, merges the PATCH payload on top, and runs the
     * supplier-required-fields gate against the merged state. Used by
     * the controller to reject a supplier edit BEFORE we persist a
     * partial product. Admin edits don't go through this — they're
     * allowed to triage with missing fields.
     */
    async validateSupplierEdit(id: string, patch: any): Promise<string[]> {
        const existing = await this.findOne(id);
        if (!existing) return [];
        const merged = { ...existing, ...patch } as any;
        // The supplier form sends pricePerPiece × unitsPerCase as
        // `price` on save, so price = 0 is a real signal here.
        return this.requiredSupplierFieldsMissing(merged);
    }

    private requiredSupplierFieldsMissing(p: any): string[] {
        const miss: string[] = [];
        if (!p.name || String(p.name).trim().length < 2)            miss.push('Name');
        if (!p.price || Number(p.price) <= 0)                       miss.push('Price');
        if (p.stock == null || Number(p.stock) <= 0)                miss.push('Stock');
        if (!p.category || String(p.category).trim() === '')        miss.push('Category');
        if (!p.brand || String(p.brand).trim() === '')              miss.push('Brand');
        if (!p.ean || String(p.ean).trim() === '')                  miss.push('EAN');
        if (!p.weight || String(p.weight).trim() === '')            miss.push('Weight');
        if (!p.origin || String(p.origin).trim() === '')            miss.push('Country of Origin');
        if (!p.exwLocation || String(p.exwLocation).trim() === '')  miss.push('EXW location');
        if (!p.shelfLife || String(p.shelfLife).trim() === '')      miss.push('BBD / Shelf life');
        if (!p.unitsPerCase || Number(p.unitsPerCase) <= 0)         miss.push('Units per case');
        if (!p.casesPerPallet || Number(p.casesPerPallet) <= 0)     miss.push('Cases per pallet');
        if (!p.palletsPerShipment || Number(p.palletsPerShipment) <= 0) miss.push('Pallets per truck');
        if (!p.moq || Number(p.moq) <= 0)                           miss.push('MOQ');
        if (!Array.isArray(p.images) || p.images.length === 0)      miss.push('At least one product image');
        // Description is intentionally OPTIONAL per operator decision.
        return miss;
    }

    /**
     * Admin sends a comment on a supplier product → status flips
     * to NEEDS_CHANGES, supplier gets notified, the message is
     * stored on adminNotes for the supplier UI to display.
     */
    async adminComment(productId: string, message: string) {
        const text = (message || '').trim();
        if (!text) throw new BadRequestException('Comment message is required.');
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            include: { supplier: { select: { id: true, email: true, name: true, role: true } } },
        });
        if (!product) throw new NotFoundException('Product not found');

        const updated = await this.prisma.product.update({
            where: { id: productId },
            data: {
                status: ProductStatus.NEEDS_CHANGES,
                adminNotes: text,
            },
        });

        // Notify the supplier in-app + by email so they don't miss the comment.
        if (product.supplierId) {
            this.notificationsService.notifyUser(
                product.supplierId,
                'Atlantis sent you a comment on a product',
                `Your product "${product.name}" needs changes before it can be approved.\n\nReason: ${text}\n\nFix the row in your inventory and click "Resend for Review".`,
                'WARNING',
                { productId: product.id, type: 'PRODUCT_NEEDS_CHANGES' },
            ).catch(() => {});
        }
        if ((product as any).supplier?.email) {
            this.emailService.sendMail(
                (product as any).supplier.email,
                `Atlantis · "${product.name}" needs changes`,
                `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#0F172A;">
                    <h2 style="margin:0 0 12px;">A change is needed on "${product.name}"</h2>
                    <p style="color:#475569;line-height:1.6;">Hi ${(product as any).supplier.name || 'there'},</p>
                    <p style="color:#475569;line-height:1.6;">Our team reviewed your product submission and left the following note:</p>
                    <div style="border-left:4px solid #F59E0B;background:#FFFBEB;padding:16px 20px;margin:16px 0;border-radius:0 10px 10px 0;color:#0F172A;font-size:14px;line-height:1.6;">${text.replace(/\n/g, '<br/>')}</div>
                    <p style="color:#475569;line-height:1.6;">Open your inventory, fix the row, then click <strong>Resend for Review</strong> to push it back to us.</p>
                    <p style="color:#94A3B8;font-size:12px;margin-top:32px;">— The Atlantis team</p>
                </div>`,
            ).catch(() => {});
        }

        return updated;
    }

    /**
     * Supplier resends a NEEDS_CHANGES product back for review.
     * Re-runs the required-fields gate — supplier can't bypass
     * by clicking Resend on a row that's still missing data.
     */
    async resendForReview(productId: string, requesterId: string, requesterRole: string) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new NotFoundException('Product not found');

        const isStaff = ['ADMIN', 'OWNER', 'MODERATOR'].includes(requesterRole);
        if (!isStaff && product.supplierId !== requesterId) {
            throw new ForbiddenException('You can only resend your own products.');
        }
        const missing = this.requiredSupplierFieldsMissing(product);
        if (missing.length > 0) {
            throw new BadRequestException(
                `Cannot resend yet — these fields are still missing: ${missing.join(', ')}.`,
            );
        }
        const updated = await this.prisma.product.update({
            where: { id: productId },
            data: {
                status: ProductStatus.PENDING,
                adminNotes: null, // clear the prior comment so the next reviewer sees a fresh slate
            },
        });
        this.notificationsService.notifyAdmins(
            'Product resent for review',
            `Supplier resubmitted "${product.name}" after addressing the requested changes.`,
            'INFO',
            { productId: product.id },
        ).catch(() => {});
        return updated;
    }

    async updateStatus(id: string, status: ProductStatus, adminNotes?: string) {
        if (status === ProductStatus.APPROVED) {
            const product = await this.findOne(id);
            if (!product) throw new BadRequestException('Product not found');

            const errors = [];
            // Relaxed validation: Allow Admin to approve even with thin content.
            if (!product.name || product.name.trim() === '') errors.push('name');
            if (!product.price || product.price <= 0) errors.push('price');
            if (!product.category || product.category.trim() === '') errors.push('category');

            if (errors.length > 0) {
                const missingFieldsMsg = `Validation failed: missing ${errors.join(', ')}`;
                // Update product to PENDING and append the notes
                await this.prisma.product.update({
                    where: { id },
                    data: {
                        status: ProductStatus.PENDING,
                        adminNotes: adminNotes ? `${adminNotes} | ${missingFieldsMsg}` : missingFieldsMsg
                    }
                });

                // Create a notification for the supplier
                await this.notificationsService.notifyUser(
                    product.supplierId,
                    'Product Approval Failed',
                    `Your product "${product.name}" could not be approved due to missing information.`,
                    'ERROR',
                    { productId: product.id, errors: errors }
                ).catch(() => {});

                throw new BadRequestException({
                    message: 'Incomplete product cannot be approved.',
                    errors: errors
                });
            }
        }

        const updated = await this.prisma.product.update({
            where: { id },
            data: { status, adminNotes },
        });

        // Notify Supplier on status change
        if (updated.supplierId) {
            const title = status === ProductStatus.APPROVED ? 'Product Approved' : 'Product Status Updated';
            const message = status === ProductStatus.APPROVED 
                ? `Your product "${updated.name}" has been approved and is now live on the marketplace!`
                : `Your product "${updated.name}" status has been updated to ${status}.`;
            
            this.notificationsService.notifyUser(
                updated.supplierId,
                title,
                message,
                status === ProductStatus.APPROVED ? 'SUCCESS' : 'INFO',
                { productId: updated.id }
            ).catch(() => {});
        }

        return updated;
    }

    /**
     * Hard-delete a single product. The OrderItem.product FK is now SET NULL
     * on cascade (migration 20260509_orderitem_product_setnull), so existing
     * orders preserve their quantity + price + productNameSnapshot — only
     * the live link to the Product row drops. Admin can delete any product
     * after confirmation regardless of order history.
     */
    async deleteProduct(id: string) {
        // Snapshot product names onto OrderItems first so order history
        // shows "KitKat 40g (deleted)" rather than just a blank cell.
        const product = await this.prisma.product.findUnique({
            where: { id },
            select: { name: true },
        });
        if (product?.name) {
            await this.prisma.orderItem.updateMany({
                where: { productId: id, productNameSnapshot: null },
                data: { productNameSnapshot: product.name },
            });
        }
        // Clean dependent rows that DON'T have cascade set in the schema.
        await this.prisma.$transaction([
            this.prisma.productPlacement.deleteMany({ where: { productId: id } }),
            this.prisma.tieredPrice.deleteMany({ where: { productId: id } }),
            this.prisma.review.deleteMany({ where: { productId: id } }),
            this.prisma.wishlistItem.deleteMany({ where: { productId: id } }),
        ]);
        return this.prisma.product.delete({ where: { id } });
    }

    async deleteProducts(ids: string[], supplierId?: string) {
        // Snapshot names for any OrderItems still linked to these products
        // so order history doesn't lose context after deletion.
        const products = await this.prisma.product.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
        });
        for (const p of products) {
            if (p.name) {
                await this.prisma.orderItem.updateMany({
                    where: { productId: p.id, productNameSnapshot: null },
                    data: { productNameSnapshot: p.name },
                });
            }
        }

        // Clean related rows — OrderItem.productId will SET NULL via the
        // schema-level cascade rule, so we don't touch OrderItem here.
        const idsToDelete = ids;
        await this.prisma.$transaction([
            this.prisma.productPlacement.deleteMany({ where: { productId: { in: idsToDelete } } }),
            this.prisma.tieredPrice.deleteMany({ where: { productId: { in: idsToDelete } } }),
            this.prisma.review.deleteMany({ where: { productId: { in: idsToDelete } } }),
            this.prisma.wishlistItem.deleteMany({ where: { productId: { in: idsToDelete } } }),
            this.prisma.product.deleteMany({
                where: {
                    id: { in: idsToDelete },
                    ...(supplierId ? { supplierId } : {})
                }
            })
        ]);

        return { 
            deletedCount: idsToDelete.length, 
            skippedCount: ids.length - idsToDelete.length,
            message: idsToDelete.length === ids.length 
                ? 'All selected products deleted' 
                : `Deleted ${idsToDelete.length} products. Skipped ${ids.length - idsToDelete.length} products due to existing orders.`
        };
    }

    /**
     * Multiplies basePrice and price of every (or per-supplier) product
     * by the given EGP-per-source-unit rate. Used to repair data uploaded
     * without selecting the correct source currency. Returns counts only;
     * pass dryRun:true to preview without writing.
     */
    async fixProductCurrency(multiplier: number, supplierId?: string, dryRun = false) {
        const where: any = {};
        if (supplierId) where.supplierId = supplierId;

        const affected = await this.prisma.product.findMany({
            where,
            select: { id: true, name: true, basePrice: true, price: true, supplierId: true }
        });

        if (dryRun) {
            return {
                dryRun: true,
                count: affected.length,
                multiplier,
                sample: affected.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.name,
                    currentBasePrice: p.basePrice,
                    newBasePrice: (p.basePrice ?? 0) * multiplier,
                    currentPrice: p.price,
                    newPrice: (p.price ?? 0) * multiplier,
                })),
            };
        }

        // Update in batches to avoid massive single transactions
        let updated = 0;
        for (const p of affected) {
            await this.prisma.product.update({
                where: { id: p.id },
                data: {
                    basePrice: (p.basePrice ?? 0) * multiplier,
                    price: (p.price ?? 0) * multiplier,
                },
            });
            updated++;
        }

        return {
            dryRun: false,
            count: updated,
            multiplier,
            supplierId: supplierId || 'all',
        };
    }

    /**
     * Recompute every product's customer-facing `price` from its `basePrice`
     * using the CURRENT (sanity-checked) markup config. Use this to recover
     * a catalog where products were saved with a corrupt markup multiplier
     * (e.g. 0.019 — the bug from the May 2026 incident). After this runs,
     * every product's price === basePrice × correct-tier-markup.
     *
     * Returns counts; pass dryRun:true to preview.
     */
    async recomputePricesFromMarkup(opts: { dryRun?: boolean; supplierId?: string } = {}) {
        const { dryRun = false, supplierId } = opts;

        // Pull current markups (already sanity-clamped >= 1.0 by the
        // AppConfig service guard).
        const piece = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_PIECE' } });
        const pallet = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_PALLET' } });
        const container = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_CONTAINER' } });
        const safe = (raw: string | undefined, fallback: number) => {
            const v = raw ? parseFloat(raw) : NaN;
            return !isFinite(v) || isNaN(v) || v < 1.0 ? fallback : v;
        };
        const markups = {
            piece: safe(piece?.value, 1.10),
            pallet: safe(pallet?.value, 1.05),
            container: safe(container?.value, 1.02),
        };

        const where: any = { basePrice: { not: null, gt: 0 } };
        if (supplierId) where.supplierId = supplierId;

        const products = await this.prisma.product.findMany({
            where,
            select: { id: true, name: true, basePrice: true, price: true, unit: true },
        });

        const pickMarkup = (unit: string | null) => {
            const u = (unit || 'piece').toLowerCase();
            if (u.includes('pallet')) return markups.pallet;
            if (u.includes('container') || u.includes('truck')) return markups.container;
            return markups.piece;
        };

        if (dryRun) {
            return {
                dryRun: true,
                count: products.length,
                markups,
                sample: products.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.name,
                    unit: p.unit,
                    basePrice: p.basePrice,
                    currentPrice: p.price,
                    newPrice: (p.basePrice ?? 0) * pickMarkup(p.unit),
                    markupApplied: pickMarkup(p.unit),
                })),
            };
        }

        let updated = 0;
        for (const p of products) {
            const newPrice = (p.basePrice ?? 0) * pickMarkup(p.unit);
            await this.prisma.product.update({
                where: { id: p.id },
                data: { price: newPrice },
            });
            updated++;
        }
        return { dryRun: false, count: updated, markups };
    }

    async bulkApprove(ids: string[]) {
        const products = await this.prisma.product.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, supplierId: true }
        });

        const result = await this.prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { status: ProductStatus.APPROVED, adminNotes: '' }
        });

        // Notify Suppliers
        for (const p of products) {
            if (p.supplierId) {
                this.notificationsService.notifyUser(
                    p.supplierId,
                    'Product Approved',
                    `Your product "${p.name}" was approved in a bulk action and is now live!`,
                    'SUCCESS',
                    { productId: p.id }
                ).catch(() => {});
            }
        }

        return result;
    }

    async bulkReject(ids: string[], reason?: string) {
        const products = await this.prisma.product.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, supplierId: true }
        });

        const explanation = (reason || '').trim()
            || 'Rejected in a bulk action. No specific reason was provided.';

        const result = await this.prisma.product.updateMany({
            where: { id: { in: ids } },
            data: {
                status: ProductStatus.REJECTED,
                adminNotes: explanation,
            },
        });

        // Notify Suppliers
        for (const p of products) {
            if (p.supplierId) {
                this.notificationsService.notifyUser(
                    p.supplierId,
                    'Product Rejected',
                    `Your product "${p.name}" was rejected. Reason: ${explanation}`,
                    'ERROR',
                    { productId: p.id, reason: explanation }
                ).catch(() => {});
            }
        }

        return result;
    }

    async update(id: string, data: any) {
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        
        // Re-categorize if name or category is updated
        if (data.category !== undefined || data.name !== undefined) {
            const currentName = data.name !== undefined ? data.name : (await this.findOne(id))?.name;
            const currentCategory = data.category !== undefined ? data.category : (await this.findOne(id))?.category;
            updateData.category = this.extractCategoryFromName(currentName || '', currentCategory);
        }
        if (data.stock !== undefined) updateData.stock = data.stock;
        if (data.images !== undefined) updateData.images = data.images;
        if (data.videos !== undefined) {
            updateData.videos = Array.isArray(data.videos)
                ? data.videos.filter((v: any) => typeof v === 'string' && v.trim())
                : [];
        }
        if (data.ean !== undefined) updateData.ean = data.ean;
        if (data.variants !== undefined) updateData.variants = data.variants;
        // Mix-composer pricing + metadata. Both are JSON maps keyed by
        // variant signature; we accept them verbatim and let the
        // schema enforce shape. Setting null clears the map.
        if (data.variantPrices !== undefined) updateData.variantPrices = data.variantPrices;
        if (data.variantMeta !== undefined) updateData.variantMeta = data.variantMeta;
        if (data.unit !== undefined) updateData.unit = data.unit;
        if (data.moq !== undefined) updateData.moq = data.moq;
        if (data.moqUnit !== undefined) {
            const u = String(data.moqUnit).toUpperCase();
            updateData.moqUnit = ['PIECE', 'CASE', 'PALLET', 'TRUCK'].includes(u) ? u : 'PIECE';
        }
        if (data.unitsPerCase !== undefined) updateData.unitsPerCase = data.unitsPerCase;
        if (data.casesPerPallet !== undefined) updateData.casesPerPallet = data.casesPerPallet;
        if (data.unitsPerPallet !== undefined) updateData.unitsPerPallet = data.unitsPerPallet;
        if (data.palletsPerShipment !== undefined) updateData.palletsPerShipment = data.palletsPerShipment;
        // Product details (these were silently dropped before — admin edits to
        // brand/origin/shelfLife/weight didn't persist)
        if (data.brand !== undefined) updateData.brand = data.brand;
        if (data.origin !== undefined) updateData.origin = data.origin;
        if (data.shelfLife !== undefined) updateData.shelfLife = data.shelfLife;
        if (data.weight !== undefined) updateData.weight = data.weight;
        if (data.adminNotes !== undefined) updateData.adminNotes = data.adminNotes;
        if (data.readyForDispatch !== undefined) updateData.readyForDispatch = data.readyForDispatch;
        if (data.leadTime !== undefined) updateData.leadTime = data.leadTime;
        if (data.warehouseId !== undefined) updateData.warehouseId = data.warehouseId;
        if (data.price !== undefined || data.unit !== undefined) {
            const existing = await this.findOne(id);

            // STABILITY GUARD: if the caller sent `data.price` but it equals
            // the existing basePrice (round-trip from a non-edit save in the
            // admin form), don't recompute. The user's complaint was prices
            // drifting after every Save Changes click — that happened
            // because we re-ran basePrice × markup on every save, so
            // floating-point or markup-config jitter accumulated. Now we
            // only touch price when basePrice actually changed.
            const noRealPriceChange =
                data.price !== undefined &&
                existing &&
                existing.basePrice !== null && existing.basePrice !== undefined &&
                Number(data.price) === Number(existing.basePrice);

            if (noRealPriceChange && data.unit === undefined) {
                // No work to do — skip the markup branch entirely.
            } else {
                const currentUnit = data.unit || existing?.unit || 'piece';
                const unitLower = currentUnit.toLowerCase();

                let configKey = 'MARKUP_PERCENTAGE';
                if (unitLower.includes('pallet')) configKey = 'MARKUP_PERCENTAGE_PALLET';
                else if (unitLower.includes('container') || unitLower.includes('truck')) configKey = 'MARKUP_PERCENTAGE_CONTAINER';
                else configKey = 'MARKUP_PERCENTAGE_PIECE';

                let config = await this.prisma.appConfig.findUnique({ where: { key: configKey } });
                if (!config) config = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE' } });

                let defaultMarkup = 1.10;
                if (unitLower.includes('pallet')) defaultMarkup = 1.05;
                else if (unitLower.includes('container') || unitLower.includes('truck')) defaultMarkup = 1.02;

                const markupRaw = config?.value ? parseFloat(config.value) : defaultMarkup;
                let markup = !isFinite(markupRaw) || isNaN(markupRaw) || markupRaw < 1.0
                    ? defaultMarkup
                    : markupRaw;
                if (markup !== markupRaw && isFinite(markupRaw)) {
                    this.logger.warn(
                        `Update path: suspect markup ${markupRaw} for "${configKey}" — ` +
                        `using default ${defaultMarkup} so price stays sane.`
                    );
                }
                const priceToUse = data.price !== undefined ? data.price : existing.basePrice;

                if (data.price !== undefined) updateData.basePrice = data.price;
                const newPrice = priceToUse * markup;

            // Track price change for the ticker — only when the customer-facing
                // price actually moved by more than 1% (avoid noise from markup
                // recomputation rounding)
                if (existing && existing.price && Math.abs(newPrice - existing.price) / existing.price > 0.01) {
                    updateData.previousPrice = existing.price;
                    updateData.priceChangedAt = new Date();
                }
                updateData.price = newPrice;
            } // close else (real price/unit change)
        }

        const updated = await this.prisma.product.update({ where: { id }, data: updateData });

        // Update translations if name or description changed
        if (data.name !== undefined || data.description !== undefined) {
            try {
                const translations = await translateProduct({ 
                    name: updated.name, 
                    description: updated.description || '' 
                });
                const variants = (updated.variants as any[]) || [];
                const transIndex = variants.findIndex(v => v.name === '__translations');
                const transObj = { name: '__translations', values: [JSON.stringify(translations)] };
                if (transIndex > -1) variants[transIndex] = transObj;
                else variants.push(transObj);

                return this.prisma.product.update({
                    where: { id },
                    data: { variants }
                });
            } catch (err) {
                this.logger.error(`Auto-translation update failed for product ${id}: ${err.message}`);
            }
        }

        return updated;
    }

    async findOne(id: string) {
        const product = await this.prisma.product.findUnique({ where: { id } });
        if (!product) return null;
        // Surface any APPROVED active wholesale offer with a promo
        // discount so the PDP can paint a "-15% OFF" badge and apply
        // the reduced price. Picks the deepest discount and only the
        // ones that haven't expired. Adds `activeOffer` to the product
        // object — read-only, never persisted back.
        try {
            const now = new Date();
            const offers = await this.prisma.offer.findMany({
                where: {
                    productId: id,
                    status: 'APPROVED' as any,
                    discountPercent: { not: null },
                    OR: [{ validUntil: null }, { validUntil: { gte: now } }],
                },
                orderBy: { discountPercent: 'desc' },
                take: 1,
            });
            const top = offers[0];
            if (top && Number(top.discountPercent || 0) > 0) {
                (product as any).activeOffer = {
                    id: top.id,
                    discountPercent: top.discountPercent,
                    variantDiscounts: top.variantDiscounts,
                    validUntil: top.validUntil,
                };
            }
        } catch {
            // Non-fatal — if the offers table is missing or query fails,
            // PDP simply shows the product without a discount badge.
        }
        return product;
    }

    async findBySupplier(supplierId: string) {
        return this.prisma.product.findMany({ where: { supplierId } });
    }

    /**
     * Build the supplier inventory breakdown for every product they own.
     * Returns one row per product with the four buckets the supplier
     * page expects: in-stock / reserved / sold / cancelled. Computed by
     * joining Product → OrderItem.order.status so we get a fresh tally
     * on every page load (no caching — the table is small).
     */
    async getInventoryForSupplier(supplierId: string) {
        const products = await this.prisma.product.findMany({
            // Operator rule: only APPROVED listings show on the inventory
            // dashboard. PENDING / REJECTED / NEEDS_CHANGES rows live on
            // /supplier/products where the supplier handles them — there's
            // no warehouse number to manage until Atlantis says yes.
            where: { supplierId, status: 'APPROVED' },
            select: {
                id: true,
                name: true,
                images: true,
                stock: true,
                basePrice: true,
                price: true,
                ean: true,
                category: true,
                unit: true,
                unitsPerCase: true,
                casesPerPallet: true,
                palletsPerShipment: true,
                status: true,
                exwLocation: true,
                variants: true,
                variantStock: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        if (products.length === 0) return [];

        // Aggregate quantities per (productId, orderStatus) in one go.
        const aggregates = await this.prisma.orderItem.groupBy({
            by: ['productId'],
            where: { productId: { in: products.map((p) => p.id) } },
            _sum: { quantity: true },
        });
        // We need a separate group-by per status bucket to compute
        // reserved vs sold vs cancelled. Run the three queries in
        // parallel — each is just a fast aggregate against an indexed
        // foreign key, so the round-trip cost is small.
        const [reserved, sold, cancelled] = await Promise.all([
            this.prisma.orderItem.groupBy({
                by: ['productId'],
                where: {
                    productId: { in: products.map((p) => p.id) },
                    order: { status: { in: ['PENDING', 'PROCESSING', 'SHIPPED'] } },
                },
                _sum: { quantity: true },
            }),
            this.prisma.orderItem.groupBy({
                by: ['productId'],
                where: {
                    productId: { in: products.map((p) => p.id) },
                    order: { status: 'DELIVERED' },
                },
                _sum: { quantity: true },
            }),
            this.prisma.orderItem.groupBy({
                by: ['productId'],
                where: {
                    productId: { in: products.map((p) => p.id) },
                    order: { status: 'CANCELLED' },
                },
                _sum: { quantity: true },
            }),
        ]);

        const indexBy = (rows: any[]) => {
            const map: Record<string, number> = {};
            for (const r of rows) {
                if (r.productId) map[r.productId] = Number(r._sum?.quantity || 0);
            }
            return map;
        };
        const totalOrdered = indexBy(aggregates);
        const reservedMap = indexBy(reserved);
        const soldMap = indexBy(sold);
        const cancelledMap = indexBy(cancelled);

        return products.map((p) => {
            // ── Variant breakdown ─────────────────────────────────
            // Compute the cartesian product of the supplier's variant
            // groups so the inventory page can render every possible
            // combination, even ones the supplier hasn't given a
            // stock number to yet. Empty groups or admin-meta entries
            // (name starts with "__") are skipped.
            //
            // For each combination we look up the saved count in
            // variantStock (key = "Group1=Val1|Group2=Val2", groups
            // sorted) and fall back to 0 when missing. This keeps the
            // UI deterministic regardless of how the supplier seeded
            // the map.
            const rawVariants = Array.isArray(p.variants) ? (p.variants as any[]) : [];
            const groups = rawVariants
                .filter((v) => v && typeof v === 'object' && !String(v.name || '').startsWith('__'))
                .map((v) => ({
                    name: String(v.name || ''),
                    values: Array.isArray(v.values)
                        ? v.values.map((x: any) => String(x))
                        : v.value
                          ? [String(v.value)]
                          : [],
                }))
                .filter((g) => g.name && g.values.length > 0);

            const variantStockMap: Record<string, number> =
                p.variantStock && typeof p.variantStock === 'object'
                    ? (p.variantStock as Record<string, number>)
                    : {};

            // Cartesian helper — { Size: [S,M], Flavour: [V,C] }
            //   → [ {Size:S,Flavour:V}, {Size:S,Flavour:C}, {Size:M,Flavour:V}, ... ]
            const cartesian = (gs: { name: string; values: string[] }[]): Array<Record<string, string>> => {
                if (gs.length === 0) return [];
                let acc: Array<Record<string, string>> = [{}];
                for (const g of gs) {
                    const next: Array<Record<string, string>> = [];
                    for (const a of acc) {
                        for (const v of g.values) {
                            next.push({ ...a, [g.name]: v });
                        }
                    }
                    acc = next;
                }
                return acc;
            };

            const sigOf = (combo: Record<string, string>): string =>
                Object.keys(combo)
                    .sort()
                    .map((k) => `${k}=${combo[k]}`)
                    .join('|');

            const combos = cartesian(groups);
            const variantBreakdown = combos.map((c) => ({
                signature: sigOf(c),
                picks: c,
                stock: Number(variantStockMap[sigOf(c)] ?? 0),
            }));

            // ── Stock per tier breakdown ─────────────────────────
            // Operator request: "the supplier should know stock in
            // Trucks / Pallets / Cases — not just a number". Stock is
            // stored as cases on the platform (the canonical unit).
            // We derive the larger tiers by dividing through the pack
            // sizes the supplier configured on the product. floor()
            // because a partial pallet doesn't count as one until
            // it's filled. Cases stays as the raw number.
            const cpp = Number(p.casesPerPallet) || 0;
            const pps = Number(p.palletsPerShipment) || 0;
            const stockCases = Number(p.stock) || 0;
            const stockPallets = cpp > 0 ? Math.floor(stockCases / cpp) : 0;
            const stockTrucks = (cpp > 0 && pps > 0)
                ? Math.floor(stockCases / (cpp * pps))
                : 0;

            return {
                id: p.id,
                name: p.name,
                image: p.images?.[0] || null,
                ean: p.ean,
                category: p.category,
                unit: p.unit,
                status: p.status,
                exwLocation: p.exwLocation,
                unitsPerCase: p.unitsPerCase,
                casesPerPallet: p.casesPerPallet,
                palletsPerShipment: (p as any).palletsPerShipment ?? null,
                // Pricing — surface supplier's raw case price, not the
                // marked-up customer price. Consistent with /my-products.
                price: p.basePrice ?? p.price,
                // Stock buckets
                stock: p.stock,                            // still available to sell (cases)
                stockPallets,                              // derived: floor(cases ÷ casesPerPallet)
                stockTrucks,                               // derived: floor(cases ÷ (casesPerPallet × palletsPerTruck))
                reserved: reservedMap[p.id] || 0,           // committed to ship
                sold: soldMap[p.id] || 0,                   // delivered to customers
                cancelled: cancelledMap[p.id] || 0,         // returned to stock
                totalOrdered: totalOrdered[p.id] || 0,      // gross lifetime orders
                // Per-variant rows — empty array when the product
                // isn't configurable. Frontend uses this to expand
                // a row into one inline sub-row per combination.
                variantBreakdown,
                hasVariants: variantBreakdown.length > 0,
            };
        });
    }

    /**
     * Set the stock count for a specific variant combination on a
     * product. Supplier-scoped — the controller enforces ownership.
     *   • signature  — "Group1=Val1|Group2=Val2" (sorted)
     *   • newStock   — integer ≥ 0, clamped against int max
     * Returns the freshly-saved variantStock map so the UI can swap
     * its local optimistic value for the canonical one.
     */
    async setVariantStock(productId: string, signature: string, newStock: number) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: { variantStock: true },
        });
        if (!product) throw new NotFoundException('Product not found');

        const current: Record<string, number> =
            product.variantStock && typeof product.variantStock === 'object'
                ? ({ ...(product.variantStock as any) } as Record<string, number>)
                : {};
        const sig = String(signature || '').trim();
        if (!sig) throw new BadRequestException('Variant signature is required');
        const safeStock = Math.max(0, Math.min(2_000_000_000, Math.floor(Number(newStock) || 0)));
        current[sig] = safeStock;

        await this.prisma.product.update({
            where: { id: productId },
            data: { variantStock: current as any },
        });
        return { variantStock: current };
    }

    async rateProduct(id: string, newRating: number) {
        const product = await this.findOne(id);
        if (!product) throw new BadRequestException('Product not found');

        const currentCount = product.reviewsCount || 0;
        const currentRating = product.rating || 0;
        const newCount = currentCount + 1;

        const updatedRating = ((currentRating * currentCount) + newRating) / newCount;

        return this.prisma.product.update({
            where: { id },
            data: {
                rating: updatedRating,
                reviewsCount: newCount
            }
        });
    }

    async findRecommendations(
        categories: string[],
        excludeIds: string[],
        limit: number = 10,
        supplierIds: string[] = [],
    ) {
        const hasImage = (p: any) =>
            !!p?.name?.trim() && Array.isArray(p?.images) && p.images.some((img: any) => img && String(img).trim() !== '');

        // Operator rule: cart suggestions should mix two motives —
        //   half from the same CATEGORY (so the buyer rounds out the
        //     order with related items)
        //   half from the same SUPPLIER (so they consolidate one
        //     supplier's shipment instead of a multi-origin order)
        // We split the requested `limit` 50/50 and dedupe in the final pass.
        const halfCat = Math.ceil(limit / 2);
        const halfSup = limit - halfCat;

        // ── (a) Same-category bucket ───────────────────────────────
        const sameCategory = categories.length > 0
            ? await this.prisma.product.findMany({
                where: {
                    status: ProductStatus.APPROVED,
                    category: { in: categories },
                    id: { notIn: excludeIds },
                },
                take: halfCat * 3,
            })
            : [];

        // ── (b) Same-supplier bucket ───────────────────────────────
        const sameSupplier = supplierIds.length > 0
            ? await this.prisma.product.findMany({
                where: {
                    status: ProductStatus.APPROVED,
                    supplierId: { in: supplierIds },
                    id: { notIn: excludeIds },
                },
                take: halfSup * 3,
            })
            : [];

        // Shuffle each bucket independently and pick the target slice.
        const shuffle = <T,>(arr: T[]) => arr.slice().sort(() => 0.5 - Math.random());
        const pickedCat = shuffle(sameCategory.filter(hasImage)).slice(0, halfCat);
        const pickedSup = shuffle(sameSupplier.filter(hasImage)).slice(0, halfSup);

        // Merge + dedupe by id (a product can match both buckets).
        const merged: any[] = [];
        const seen = new Set<string>();
        for (const p of [...pickedSup, ...pickedCat]) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            merged.push(p);
        }

        // ── (c) Fallback if we still don't have enough — pull random
        //        approved products to fill the remaining slots.
        if (merged.length < limit) {
            const fillerIds = [...excludeIds, ...merged.map(p => p.id)];
            const filler = await this.prisma.product.findMany({
                where: {
                    status: ProductStatus.APPROVED,
                    id: { notIn: fillerIds },
                },
                take: (limit - merged.length) * 3,
            });
            for (const p of shuffle(filler.filter(hasImage))) {
                if (merged.length >= limit) break;
                if (seen.has(p.id)) continue;
                seen.add(p.id);
                merged.push(p);
            }
        }

        return merged.slice(0, limit);
    }

    async fixupIncompleteProducts() {
        const products = await this.prisma.product.findMany({});

        let count = 0;
        let catFixCount = 0;
        for (const p of products) {
            let needsUpdate = false;
            const updateData: any = {};

            const hasRealImage = p.images?.some(img => img && img.trim() !== '');
            const hasName = p.name && p.name.trim() !== '';
            const hasDesc = p.description && p.description.trim() !== '';

            if (p.status === ProductStatus.APPROVED && (!hasRealImage || !hasName || !hasDesc)) {
                updateData.status = ProductStatus.PENDING;
                updateData.adminNotes = `(System Fix) Set to PENDING due to missing content.`;
                needsUpdate = true;
                count++;
            }

            // Fix categories
            const newCat = this.extractCategoryFromName(p.name, p.category);
            if (newCat !== p.category) {
                updateData.category = newCat;
                needsUpdate = true;
                catFixCount++;
            }

            if (needsUpdate) {
                await this.prisma.product.update({
                    where: { id: p.id },
                    data: updateData
                });
            }
        }
        return { message: `Fixed ${count} products content and ${catFixCount} categories`, count, catFixCount };
    }

    async search(query: string) {
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        let whereCondition: any = { status: ProductStatus.APPROVED };
        
        if (terms.length > 0) {
            whereCondition.AND = terms.map(term => ({
                OR: [
                    { name: { contains: term, mode: 'insensitive' } },
                    { description: { contains: term, mode: 'insensitive' } },
                    { category: { contains: term, mode: 'insensitive' } },
                    { brand: { contains: term, mode: 'insensitive' } },
                    { ean: { contains: term, mode: 'insensitive' } },
                ]
            }));
        }

        return this.prisma.product.findMany({
            where: whereCondition,
            include: {
                supplier: {
                    select: { id: true, name: true, companyName: true }
                }
            },
            take: 8 // Autocomplete should return 8 suggestions max
        });
    }
}


