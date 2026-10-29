'use client';

import ProductsWorkspace from '@/components/admin/ProductsWorkspace';

/** Products → Ali FMCG Catalog: products Ali FMCG lists itself (owned by staff accounts). */
export default function AtlantisCatalogPage() {
    return <ProductsWorkspace scope="catalog" />;
}
