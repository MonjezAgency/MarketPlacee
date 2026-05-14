// frontend/src/lib/types.ts

export enum ProductStatus {
    PENDING = 'PENDING',
    PENDING_APPROVAL = 'PENDING_APPROVAL',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    BLOCKED = 'BLOCKED',
    ACTIVE = 'ACTIVE',     // UI-specific state
    INACTIVE = 'INACTIVE', // UI-specific state
}

export interface ProductVariant {
    id?: string;
    name: string;
    value?: string;
    values?: string[]; // Supporting existing JSON structure in some components
    price?: number;
    stock?: number;
}

export interface Product {
    id: string;        // Required
    name: string;      // Required
    price: number;     // Required
    
    // Core Metadata
    ean?: string;
    brand?: string;
    supplierId?: string;
    unit?: string;
    description?: string;
    category?: string;
    categoryId?: string;

    // Media
    image?: string;
    images?: string[];
    /**
     * Optional short product demo videos. Same shape as `images` —
     * each entry is a public URL the PDP can play with a native
     * <video> tag. Capped to clips ≤ 60 s and ≤ 25 MB on upload.
     */
    videos?: string[];

    // Inventory & Status
    stock?: number;
    inStock?: boolean;
    moq?: number;
    moqUnit?: 'PIECE' | 'CASE' | 'PALLET' | 'TRUCK' | string;
    minOrder?: number; // UI Alias for moq
    unitsPerCase?: number;
    casesPerPallet?: number;
    unitsPerPallet?: number;
    palletsPerShipment?: number;
    status?: ProductStatus | string;
    
    // Advanced Data
    weight?: number;
    shelfLife?: string;
    origin?: string;
    /**
     * EXW (Ex Works) — where the goods physically sit today. Required at
     * supplier upload time and surfaced on the PDP next to Country of
     * Origin so buyers can reason about the transport leg.
     */
    exwLocation?: string;
    basePrice?: number | null;
    variants?: ProductVariant[];
    /**
     * Mix-composer pricing — { "Flavour=Diet": 14.5, "Flavour=Regular": 13.2 }.
     * Used when the buyer mixes multiple variants inside one truck/pallet
     * at checkout. Empty / missing keys fall back to the parent price.
     */
    variantPrices?: Record<string, number>;
    /**
     * Mix-composer display metadata + per-variant pack sizes.
     * Shape per signature:
     *   {
     *     image?: string,
     *     label?: string,
     *     unitsPerCase?: number,       // pieces in ONE case of this variant
     *     casesPerPallet?: number,     // cases in ONE pallet of this variant
     *     palletsPerShipment?: number, // pallets in ONE truck of this variant
     *   }
     * Each numeric field falls back to the parent product value when
     * missing, so the supplier only has to override when a variant's
     * packing actually differs (e.g. Pepsi 1L cases are 12-pack, while
     * Pepsi 330ml cases are 24-pack).
     */
    variantMeta?: Record<string, {
        image?: string;
        label?: string;
        unitsPerCase?: number;
        casesPerPallet?: number;
        palletsPerShipment?: number;
    }>;
    adminNotes?: string;
    rating?: number;
    reviews?: any; // Can be a count or an array depending on context
    reviewsCount?: number;
    isNew?: boolean;
    bulkSave?: boolean;
    readyForDispatch?: boolean;
    leadTime?: number;

    // Timestamps
    createdAt?: string;
    updatedAt?: string;

    // Relations (Optional UI data)
    supplier?: {
        name: string;
        companyName?: string;
    };
}

export interface Category {
    id: string;
    name: string;
    image?: string;
    slug?: string;
    productCount?: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    totalPages: number;
}

export interface Filters {
    q?: string;
    category?: string;
    brand?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
}

export const NOTIFICATION_TYPES = {
  NEW_REGISTRATION: 'NEW_REGISTRATION',
  GOOGLE_REGISTRATION: 'GOOGLE_REGISTRATION', 
  NEW_REVIEW: 'NEW_REVIEW',
  NEW_ORDER: 'NEW_ORDER',
  KYC_SUBMITTED: 'KYC_SUBMITTED',
  TEAM_INVITE_FAILED: 'TEAM_INVITE_FAILED',
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
