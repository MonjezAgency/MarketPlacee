/**
 * Tour definitions. Each step points at a real element marked with
 * `data-tour="<target>"` and reads its text from the productTour dictionary.
 * Server ids must match backend/src/users/product-tours.ts.
 */
export interface TourStep {
    /** Value of the element's `data-tour` attribute. */
    target: string;
    titleKey: string;
    bodyKey: string;
    /** Preferred side for the card: 'side' for vertical navigation, 'below' otherwise. */
    prefer?: 'side' | 'below';
}
export interface TourDef { id: 'supplier-dashboard' | 'buyer-dashboard'; home: string; steps: TourStep[] }

export const SUPPLIER_TOUR: TourDef = {
    id: 'supplier-dashboard',
    home: '/supplier',
    steps: [
        { target: 'supplier-overview', titleKey: 'sup1Title', bodyKey: 'sup1Body' },
        { target: 'supplier-nav-products', titleKey: 'sup2Title', bodyKey: 'sup2Body', prefer: 'side' },
        { target: 'supplier-nav-orders', titleKey: 'sup3Title', bodyKey: 'sup3Body', prefer: 'side' },
        { target: 'supplier-nav-inventory', titleKey: 'sup4Title', bodyKey: 'sup4Body', prefer: 'side' },
        { target: 'supplier-nav-support', titleKey: 'sup5Title', bodyKey: 'sup5Body', prefer: 'side' },
    ],
};

export const BUYER_TOUR: TourDef = {
    id: 'buyer-dashboard',
    home: '/dashboard/customer',
    steps: [
        { target: 'buyer-start-order', titleKey: 'buy1Title', bodyKey: 'buy1Body' },
        { target: 'buyer-nav-orders', titleKey: 'buy2Title', bodyKey: 'buy2Body', prefer: 'side' },
        { target: 'buyer-nav-payments', titleKey: 'buy3Title', bodyKey: 'buy3Body', prefer: 'side' },
        { target: 'buyer-nav-lists', titleKey: 'buy4Title', bodyKey: 'buy4Body', prefer: 'side' },
        { target: 'buyer-nav-support', titleKey: 'buy5Title', bodyKey: 'buy5Body', prefer: 'side' },
    ],
};
