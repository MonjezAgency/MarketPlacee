import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../common/prisma.service';
import { ProductsService } from './products.service';
import { resolveBrand, searchBrands, tidyBrand } from './brand-catalog';
import { resolveOrigin } from './country-canon';

/**
 * Brand and country-of-origin helpers for the supplier workspace (same
 * conventions as SupplierCatalogController: SUPPLIER only, scoped to the
 * caller's id from the JWT). Read-only.
 */
@Controller('supplier-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPPLIER)
export class CatalogFieldsController {
    constructor(private readonly products: ProductsService, private readonly prisma: PrismaService) {}

    /**
     * Canonical brands matching `q` (case, accents, spaces and punctuation
     * ignored): prefix matches first, then word matches, then "contains", ties
     * by usage. Brands on live listings plus the supplier's own. `similar`
     * lists close spellings when nothing matches exactly — suggestions only.
     */
    @Get('brands')
    async brands(@Request() req, @Query('q') q?: string, @Query('limit') limit?: string) {
        const cat = await this.products.brandCatalogFor(req.user.sub);
        const n = Math.min(20, Math.max(1, Number(limit) || 20));
        return searchBrands(cat, String(q ?? '').slice(0, 80), n);
    }

    /**
     * Read-only review list: the supplier's own products whose brand isn't
     * written with its canonical spelling, or whose origin isn't a recognised
     * country. Nothing is rewritten; the supplier fixes them in the editor.
     */
    @Get('catalog-quality')
    async catalogQuality(@Request() req) {
        const supplierId = req.user.sub;
        const [cat, rows] = await Promise.all([
            this.products.brandCatalogFor(supplierId),
            this.prisma.product.findMany({ where: { supplierId }, select: { id: true, name: true, brand: true, origin: true, status: true }, orderBy: { updatedAt: 'desc' }, take: 5000 }),
        ]);
        const items: any[] = [];
        let brandIssues = 0, originIssues = 0;
        for (const p of rows) {
            const item: any = { id: p.id, name: p.name, status: p.status };
            if (p.brand && tidyBrand(p.brand)) {
                const r = resolveBrand(cat, p.brand);
                if (r.kind === 'known' && r.name !== p.brand) { item.brand = { value: p.brand, canonical: r.name }; brandIssues++; }
            }
            if (p.origin && p.origin.trim()) {
                const r = resolveOrigin(p.origin);
                if (r.kind === 'country' && r.name !== p.origin) { item.origin = { value: p.origin, problem: 'spelling', suggestion: r.name }; originIssues++; }
                else if (r.kind === 'suggest') { item.origin = { value: p.origin, problem: 'not_a_country', suggestion: r.name }; originIssues++; }
                else if (r.kind === 'ambiguous') { item.origin = { value: p.origin, problem: 'ambiguous', options: r.options.map((o) => o.name) }; originIssues++; }
                else if (r.kind === 'unknown') { item.origin = { value: p.origin, problem: 'unknown' }; originIssues++; }
            }
            if (item.brand || item.origin) items.push(item);
        }
        return { checked: rows.length, brandIssues, originIssues, items: items.slice(0, 500), truncated: items.length > 500 };
    }
}
