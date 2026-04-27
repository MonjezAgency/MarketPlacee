import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EanService } from './ean.service';

import { AiAgentService } from '../ai-agent/ai-agent.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ProductsService {
    constructor(
        private prisma: PrismaService, 
        private eanService: EanService,
        private aiAgent: AiAgentService,
        private notificationsService: NotificationsService,
    ) { }

    async create(createProductDto: CreateProductDto, isAdmin: boolean = false, skipAi: boolean = false) {
        // KYC enforcement: suppliers must be verified or pending approval before listing products
        if (!isAdmin && createProductDto.supplierId) {
            const supplier = await this.prisma.user.findUnique({
                where: { id: createProductDto.supplierId },
                select: { kycStatus: true },
            });
            if (supplier && supplier.kycStatus === 'UNVERIFIED') {
                throw new ForbiddenException('Identity verification required. Please submit your documents before listing products.');
            }
        }

        // Fetch markup setting based on unit
        const unit = createProductDto.unit?.toLowerCase() || 'piece';
        let configKey = 'MARKUP_PERCENTAGE'; // Support legacy/default key

        if (unit.includes('pallet')) configKey = 'MARKUP_PERCENTAGE_PALLET';
        else if (unit.includes('container') || unit.includes('truck')) configKey = 'MARKUP_PERCENTAGE_CONTAINER';
        else configKey = 'MARKUP_PERCENTAGE_PIECE';

        let config = await this.prisma.appConfig.findUnique({
            where: { key: configKey }
        });

        // Fallback to general markup if specific unit markup not found
        if (!config) {
            config = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE' } });
        }

        // Default markups based on unit if nothing is set in DB: piece=10%, pallet=5%, container=2%
        let defaultMarkup = 1.10;
        if (unit.includes('pallet')) defaultMarkup = 1.05;
        else if (unit.includes('container') || unit.includes('truck')) defaultMarkup = 1.02;

        const markupPercentage = config && config.value ? parseFloat(config.value) : defaultMarkup;
        const finalMarkup = isNaN(markupPercentage) ? defaultMarkup : markupPercentage;

        // Fetch EAN images if ean is provided and no images are uploaded
        let productImages = createProductDto.images || [];
        if (!skipAi && createProductDto.ean && productImages.length === 0) {
            const fetchedImages = await this.eanService.fetchImagesByEan(createProductDto.ean, 3);
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

        // Auto-categorize if missing
        let finalCategory = createProductDto.category;
        if (!skipAi && (!finalCategory || finalCategory.toLowerCase() === 'general' || finalCategory.toLowerCase() === 'others')) {
            const categories = await this.prisma.product.findMany({ select: { category: true }, distinct: ['category'] });
            const catList = categories.map(c => c.category).filter(c => c && c !== 'General');
            if (catList.length > 0 && createProductDto.name) {
                const suggested = await this.aiAgent.categorizeProduct(createProductDto.name, createProductDto.description || '', catList);
                if (suggested) finalCategory = suggested;
            }
        }

        try {
            const { id, ...productData } = createProductDto as any;
            const product = await this.prisma.product.create({
                data: {
                    ...productData,
                    category: finalCategory || 'General',
                    adminNotes,
                    status: finalStatus,
                    basePrice: createProductDto.price,
                    price: createProductDto.price * finalMarkup,
                    images: productImages,
                    supplierId: createProductDto.supplierId,
                    unit: createProductDto.unit || 'piece',
                    moq: createProductDto.moq ?? null,
                    unitsPerPallet: createProductDto.unitsPerPallet ?? null,
                    palletsPerShipment: createProductDto.palletsPerShipment ?? null,
                    readyForDispatch: createProductDto.readyForDispatch ?? true,
                    leadTime: createProductDto.leadTime ?? 0,
                    warehouseId: createProductDto.warehouseId || null,
                },
            });

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
        else if (filters?.sort === 'newest') orderBy = { createdAt: 'desc' };

        const page = Math.max(1, parseInt(filters?.page || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(filters?.limit || '24', 10)));
        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            this.prisma.product.findMany({
                where,
                include: {
                    supplier: {
                        select: { id: true, name: true, email: true, companyName: true }
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

    async deleteProduct(id: string) {
        return this.prisma.product.delete({ where: { id } });
    }

    async deleteProducts(ids: string[], supplierId?: string) {
        // 1. First, check if any of these products have orders.
        // If they have orders, we should probably not delete them to keep history.
        const productsWithOrders = await this.prisma.orderItem.findMany({
            where: { productId: { in: ids } },
            select: { productId: true }
        });
        
        const idsWithOrders = new Set(productsWithOrders.map(oi => oi.productId));
        const idsToDelete = ids.filter(id => !idsWithOrders.has(id));

        if (idsToDelete.length === 0 && ids.length > 0) {
            throw new BadRequestException('Cannot delete products that are already part of existing orders.');
        }

        // 2. Clear related records that might not have Cascade Delete set in DB yet
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

    async bulkReject(ids: string[]) {
        const products = await this.prisma.product.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, supplierId: true }
        });

        const result = await this.prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { status: ProductStatus.REJECTED }
        });

        // Notify Suppliers
        for (const p of products) {
            if (p.supplierId) {
                this.notificationsService.notifyUser(
                    p.supplierId,
                    'Product Rejected',
                    `Your product "${p.name}" was rejected in a bulk action.`,
                    'ERROR',
                    { productId: p.id }
                ).catch(() => {});
            }
        }

        return result;
    }

    async update(id: string, data: any) {
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.category !== undefined) updateData.category = data.category;
        if (data.stock !== undefined) updateData.stock = data.stock;
        if (data.images !== undefined) updateData.images = data.images;
        if (data.ean !== undefined) updateData.ean = data.ean;
        if (data.variants !== undefined) updateData.variants = data.variants;
        if (data.unit !== undefined) updateData.unit = data.unit;
        if (data.moq !== undefined) updateData.moq = data.moq;
        if (data.unitsPerPallet !== undefined) updateData.unitsPerPallet = data.unitsPerPallet;
        if (data.palletsPerShipment !== undefined) updateData.palletsPerShipment = data.palletsPerShipment;
        if (data.readyForDispatch !== undefined) updateData.readyForDispatch = data.readyForDispatch;
        if (data.leadTime !== undefined) updateData.leadTime = data.leadTime;
        if (data.warehouseId !== undefined) updateData.warehouseId = data.warehouseId;
        if (data.price !== undefined || data.unit !== undefined) {
            const currentUnit = data.unit || (await this.findOne(id))?.unit || 'piece';
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

            const markup = config?.value ? parseFloat(config.value) : defaultMarkup;
            const priceToUse = data.price !== undefined ? data.price : (await this.findOne(id)).basePrice;

            if (data.price !== undefined) updateData.basePrice = data.price;
            updateData.price = priceToUse * (isNaN(markup) ? defaultMarkup : markup);
        }
        return this.prisma.product.update({ where: { id }, data: updateData });
    }

    async findOne(id: string) {
        return this.prisma.product.findUnique({ where: { id } });
    }

    async findBySupplier(supplierId: string) {
        return this.prisma.product.findMany({ where: { supplierId } });
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

    async findRecommendations(categories: string[], excludeIds: string[], limit: number = 4) {
        // Fetch up to 10 random approved products from these categories, not matching excluded IDs
        let products = await this.prisma.product.findMany({
            where: {
                status: ProductStatus.APPROVED,
                category: {
                    in: categories,
                },
                id: {
                    notIn: excludeIds,
                }
            },
            take: 10,
        });

        // Filter for quality: must have name and at least one real image
        let filtered = products.filter(p => 
            p.name && 
            p.name.trim() !== '' && 
            p.images && 
            p.images.some(img => img && img.trim() !== '')
        );

        if (filtered.length < limit) {
            const fallback = await this.prisma.product.findMany({
                where: {
                    status: ProductStatus.APPROVED,
                    id: { notIn: [...excludeIds, ...filtered.map(p => p.id)] }
                },
                take: limit - filtered.length + 5,
            });
            const fallbackFiltered = fallback.filter(p => 
                p.name && 
                p.name.trim() !== '' && 
                p.images && 
                p.images.some(img => img && img.trim() !== '')
            );
            filtered = [...filtered, ...fallbackFiltered];
        }

        // Shuffle the results and take the requested limit for random variety
        const shuffled = filtered.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, limit);
    }

    async fixupIncompleteProducts() {
        const products = await this.prisma.product.findMany({
            where: { status: ProductStatus.APPROVED }
        });

        let count = 0;
        for (const p of products) {
            const hasRealImage = p.images?.some(img => img && img.trim() !== '');
            const hasName = p.name && p.name.trim() !== '';
            const hasDesc = p.description && p.description.trim() !== '';

            if (!hasRealImage || !hasName || !hasDesc) {
                await this.prisma.product.update({
                    where: { id: p.id },
                    data: {
                        status: ProductStatus.PENDING,
                        adminNotes: `(System Fix) Set to PENDING due to missing content.`
                    }
                });
                count++;
            }
        }
        return { message: `Fixed ${count} products`, count };
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


