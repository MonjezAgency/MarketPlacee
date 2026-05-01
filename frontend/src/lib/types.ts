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

    // Inventory & Status
    stock?: number;
    inStock?: boolean;
    moq?: number;
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
    basePrice?: number | null;
    variants?: ProductVariant[];
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
