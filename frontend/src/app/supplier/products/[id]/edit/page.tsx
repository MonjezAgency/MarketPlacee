'use client';

import * as React from 'react';
import ProductEditorForm from '@/components/products/ProductEditorForm';

interface PageProps {
    params: { id: string };
}

/**
 * Supplier → Edit Product page.
 *
 * Renders the shared editor in `supplier` mode — no Verified badge,
 * no Admin Notes, no Status dropdown, no Delete Product. Suppliers
 * delete products from the table row menu (with a separate confirm).
 *
 * The supplier layout (sidebar) wraps this automatically.
 */
export default function SupplierEditProductPage({ params }: PageProps) {
    return (
        <ProductEditorForm
            productId={params.id}
            mode="supplier"
            backHref="/supplier/products"
        />
    );
}
