'use client';

import ProductEditor from '@/components/supplier/ProductEditor';

/**
 * Supplier → Edit product. Uses the supplier editor (draft / review / live
 * rules); the admin keeps the shared ProductEditorForm on its own pages.
 */
export default function SupplierEditProductPage({ params }: { params: { id: string } }) {
    return <ProductEditor productId={params.id} />;
}
