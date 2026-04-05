import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EanService } from './ean.service';

@Injectable()
export class ProductsService {
    constructor(private prisma: PrismaService, private eanService: EanService) { }

    async create(createProductDto: CreateProductDto, isAdmin: boolean = false) {
        // KYC enforcement: suppliers must be verified before listing products
        if (!isAdmin && createProductDto.supplierId) {
            const supplier = await this.prisma.user.findUnique({
                where: { id: createProductDto.supplierId },
                select: { kycStatus: true },
            });
            if (supplier && supplier.kycStatus !== 'VERIFIED') {
                throw new ForbiddenException('KYC verification required. Complete your identity verification before listing products.');
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

        // Fetch EAN image if ean is provided and no images are uploaded
        let productImages = createProductDto.images || [];
        if (createProductDto.ean && productImages.length === 0) {
            const fetchedImage = await this.eanService.fetchImageUrlByEan(createProductDto.ean);
            if (fetchedImage) {
                productImages = [fetchedImage];
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

        try {
            return await this.prisma.product.create({
                data: {
                    ...createProductDto,
                    adminNotes,
                    status: finalStatus,
                    basePrice: createProductDto.price,
                    price: createProductDto.price * finalMarkup,
                    images: productImages,
                    supplierId: createProductDto.supplierId,
                    unit: createProductDto.unit || 'piece',
                    moq: createProductDto.moq ?? null,
                    warehouseId: createProductDto.warehouseId || null,
                },
            });
        } catch (error) {
            throw error;
        }
    }

    async findAll(status?: ProductStatus, filters?: { category?: string; brand?: string; minPrice?: string; maxPrice?: string; sort?: string; q?: string; page?: string; limit?: string }) {
        const where: any = {};
        if (status) where.status = status;

        // Text search
        if (filters?.q) {
            where.OR = [
                { name: { contains: filters.q, mode: 'insensitive' } },
                { description: { contains: filters.q, mode: 'insensitive' } },
                { category: { contains: filters.q, mode: 'insensitive' } },
                { brand: { contains: filters.q, mode: 'insensitive' } },
                { ean: { contains: filters.q, mode: 'insensitive' } },
            ];
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

        // Safety: Only apply strict content requirements for the public marketplace (APPROVED).
        if (status === ProductStatus.APPROVED) {
            where.AND = [
                ...(where.AND || []),
                { images: { isEmpty: false } },
                { name: { not: '' } },
                { description: { not: '' } }
            ];
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

        const filtered = status === ProductStatus.APPROVED
            ? products.filter(p => p.name && p.name.trim() !== '' && p.images.some(img => img && img.trim() !== ''))
            : products;

        return {
            data: filtered,
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
            const hasRealImage = product.images?.some(img => img && img.trim() !== '');
            if (!product.description || product.description.trim() === '') errors.push('description');
            if (!hasRealImage) errors.push('images');
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
                await this.prisma.notification.create({
                    data: {
                        userId: product.supplierId,
                        title: 'Product Approval Failed',
                        message: `Your product "${product.name}" could not be approved due to missing information.`,
                        type: 'ERROR',
                        data: { productId: product.id, errors: errors }
                    }
                });

                throw new BadRequestException({
                    message: 'Incomplete product cannot be approved.',
                    errors: errors
                });
            }
        }

        return this.prisma.product.update({
            where: { id },
            data: { status, adminNotes },
        });
    }

    async deleteProduct(id: string) {
        return this.prisma.product.delete({ where: { id } });
    }

    async deleteProducts(ids: string[], supplierId?: string) {
        return this.prisma.product.deleteMany({
            where: {
                id: { in: ids },
                ...(supplierId ? { supplierId } : {})
            }
        });
    }

    async bulkApprove(ids: string[]) {
        return this.prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { status: ProductStatus.APPROVED, adminNotes: '' }
        });
    }

    async bulkReject(ids: string[]) {
        return this.prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { status: ProductStatus.REJECTED }
        });
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
        const products = await this.prisma.product.findMany({
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
        const filtered = products.filter(p => 
            p.name && 
            p.name.trim() !== '' && 
            p.images && 
            p.images.some(img => img && img.trim() !== '')
        );

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
        return this.prisma.product.findMany({
            where: {
                status: ProductStatus.APPROVED,
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { description: { contains: query, mode: 'insensitive' } },
                    { category: { contains: query, mode: 'insensitive' } },
                    { brand: { contains: query, mode: 'insensitive' } },
                    { ean: { contains: query, mode: 'insensitive' } },
                ],
            },
            include: {
                supplier: {
                    select: { id: true, name: true, companyName: true }
                }
            },
            take: 20
        });
    }
}


