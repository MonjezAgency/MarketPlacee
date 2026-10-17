'use client';

import PromotionsManager from '@/components/promotions/PromotionsManager';

/** /admin/promotions — special offers on any product (net and buyer prices). */
export default function AdminPromotionsPage() {
    return (
        <div className="max-w-[1280px] mx-auto p-4 sm:p-6">
            <PromotionsManager mode="admin" />
        </div>
    );
}
