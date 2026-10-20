'use client';

import ProductsWorkspace from '@/components/admin/ProductsWorkspace';

/** Products → Atlantis Catalog: products Atlantis lists itself (owned by staff accounts). */
export default function AtlantisCatalogPage() {
    return <ProductsWorkspace scope="catalog" />;
}
