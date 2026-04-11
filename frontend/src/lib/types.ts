// frontend/src/lib/types.ts

export enum ProductStatus {
    PENDING = 'PENDING',
    PENDING_APPROVAL = 'PENDING_APPROVAL', // Frontend usage/fallback
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    BLOCKED = 'BLOCKED',    // For restricted items
}

export interface Product {
    id: string;
    name: string;
    brand: string;
    price: number;
    basePrice?: number | null;
    supplierId?: string;    // MUST be optional per refactor requirement
    unit: string;
    minOrder: number;
    image: string;
    images: string[];
    stock: number;
    inStock: boolean;
    category: string;
    ean?: string;
    rating: number;
    reviews: number;
    status: ProductStatus;
    
    // Additional optional fields from refactor recommendation
    categoryId?: string;
    createdAt?: string;
    description?: string;
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
