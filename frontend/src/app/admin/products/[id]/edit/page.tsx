'use client';

import * as React from 'react';
import ProductEditorForm from '@/components/products/ProductEditorForm';

interface PageProps {
    params: { id: string };
}

/**
 * Admin → Edit Product page.
 *
 * Same Edit Product UI as the supplier route, but with `mode="admin"`
 * which enables the Verified-by-Atlantis status card, Admin Notes
 * textarea, Status dropdown, and the Delete Product action.
 *
 * The admin layout (sidebar) wraps this automatically — the form
 * itself renders only the main content area.
 */
export default function AdminEditProductPage({ params }: PageProps) {
    return (
        <ProductEditorForm
            productId={params.id}
            mode="admin"
            backHref="/admin/products"
        />
    );
}
