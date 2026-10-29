'use client';

/**
 * Admin → Offers → Special offers (/admin/offers/special): Ali FMCG special offers
 * (backend Promotion: % off the supplier net price, the buyer price follows the
 * markup, times in UTC). OWNER/ADMIN only on the server (admin/promotions).
 */
import PromotionsManager from '@/components/promotions/PromotionsManager';

export default function SpecialOffersPage() {
    return <PromotionsManager mode="admin" />;
}
