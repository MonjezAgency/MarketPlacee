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
    BadRequestException
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

@Controller('products')
export class ProductsController {
    constructor(
        private readonly productsService: ProductsService,
        private readonly excelService: ExcelService,
        private readonly eanService: EanService
    ) { }

    @Get()
    async findAll(@Request() req) {
        const { status, category, brand, minPrice, maxPrice, sort, q } = req.query;
        const products = await this.productsService.findAll(status, { category, brand, minPrice, maxPrice, sort, q });
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
    async findImageByEan(@Param('ean') ean: string) {
        const imageUrl = await this.eanService.fetchImageUrlByEan(ean);
        return { imageUrl };
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

        const product = await this.productsService.create({
            ...createProductDto,
            supplierId,
        }, isAdmin);

        return plainToInstance(ProductDto, product);
    }

    @Post('bulk-upload')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER, Role.ADMIN)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
    async bulkUpload(@UploadedFile() file: any, @Request() req) {
        console.log('[BulkUpload] === METHOD CALLED ===');
        console.log('[BulkUpload] File:', file ? { name: file.originalname, size: file.size, mimetype: file.mimetype } : 'NO FILE');
        console.log('[BulkUpload] User:', req.user?.sub, req.user?.role);
        try {
            if (!file) throw new Error('File is required');

            const isAdmin = req.user.role === Role.ADMIN;
            const report = await this.excelService.processProductsExcel(file.buffer, CreateProductDto);

            const createdProducts = [];
            for (const result of report.results) {
                if (result.success && result.data) {
                    const dto = result.data as CreateProductDto;
                    const supplierId = isAdmin ? (dto.supplierId || req.user.sub) : req.user.sub;

                    if (!dto.name || dto.name.trim() === '' || !dto.description || dto.description.trim() === '') {
                        dto.adminNotes = (dto.adminNotes ? dto.adminNotes + ' | ' : '') + 'Warning: Missing title or description.';
                    }

                    try {
                        const product = await this.productsService.create({
                            ...dto,
                            supplierId,
                        }, isAdmin);
                        createdProducts.push(product);
                    } catch (e) {
                        result.success = false;
                        result.errors = result.errors || [];
                        result.errors.push(`Failed to create product via DB: ${e.message}`);
                        report.successCount--;
                        report.errorCount++;
                    }
                }
            }

            return { ...report, createdCount: createdProducts.length };
        } catch (error) {
            console.error('[BulkUpload] Error:', error);
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



