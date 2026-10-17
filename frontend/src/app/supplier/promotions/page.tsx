'use client';

import PromotionsManager from '@/components/promotions/PromotionsManager';

/** /supplier/promotions — special offers on the supplier's own products (net prices only). */
export default function SupplierPromotionsPage() {
    return <PromotionsManager mode="supplier" />;
}
