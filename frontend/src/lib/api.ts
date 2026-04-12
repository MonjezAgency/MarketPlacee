import { Product, ProductStatus, Filters } from '@/lib/types';

// frontend/src/lib/api.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!BASE_URL && typeof window !== 'undefined') {
    console.error(
        "NEXT_PUBLIC_API_URL is not defined in environment variables. " +
        "API calls will fail. Please check your Vercel or local .env configuration."
    );
}

export const apiUrl = BASE_URL || '';

/**
 * Standardized fetch wrapper for the Marketplace platform.
 * - Automatically prepends the base URL.
 * - Enforces credentials: 'include' for httpOnly cookie support.
 * - Adds default JSON headers.
 */
export async function apiFetch(path: string, options: RequestInit = {}) {
    const url = path.startsWith('http') ? path : `${apiUrl}${path}`;
    
    // [FINAL FIX]: Modern headers handling — don't manual set Content-Type for FormData
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    // Standardized headers: JWT is now in HttpOnly cookie

    return fetch(url, {
        ...options,
        credentials: 'include',
        headers,
    });
}

// ─── LEGACY EXPORTS (RE-ADDED TO FIX BUILD FAILURES) ───────────────────────

/**
 * [AUTOSYNC FIX]: getToken stub to unblock build. 
 * Real session management is now handled via apiFetch/httpOnly cookies.
 */
export const getToken = () => undefined;

function mapProduct(item: any): Product {
    return {
        id: item.id,
        name: item.name,
        brand: item.supplier?.companyName || item.supplier?.name || 'Parallel Broker',
        price: item.price,
        basePrice: item.basePrice || undefined,
        supplierId: item.supplierId || undefined,
        unit: item.unit || 'unit',
        minOrder: item.minOrder || 10,
        image: (item.images && item.images.length > 0) ? item.images[0] : '',
        images: item.images || [],
        stock: item.stock || 0,
        inStock: (item.stock ?? 0) > 0,
        category: item.category,
        ean: item.ean,
        rating: item.rating || 0,
        reviews: item.reviewsCount || 0,
        status: item.status || ProductStatus.APPROVED,
    };
}

export async function fetchProductsWithFilters(filters: Filters): Promise<Product[]> {
    try {
        const params = new URLSearchParams({ status: 'APPROVED' });
        if (filters.q) params.set('q', filters.q);
        if (filters.category) params.set('category', filters.category);
        if (filters.brand) params.set('brand', filters.brand);
        if (filters.minPrice) params.set('minPrice', filters.minPrice);
        if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
        if (filters.sort) params.set('sort', filters.sort);

        const res = await apiFetch(`/products?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) return [];
        const json = await res.json();
        const data = Array.isArray(json) ? json : (json.data || []);
        return data.map(mapProduct);
    } catch (error) {
        console.error('Error fetching products with filters:', error);
        return [];
    }
}

export async function fetchProducts(): Promise<Product[]> {
    try {
        const res = await apiFetch(`/products?status=APPROVED`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch products');
        
        const json = await res.json();
        let data: any[] = [];
        if (Array.isArray(json)) data = json;
        else if (json.data && Array.isArray(json.data)) data = json.data;
        else if (json.products && Array.isArray(json.products)) data = json.products;
        
        return data.map(mapProduct);
    } catch (error) {
        console.error('Error fetching products:', error);
        return [];
    }
}

export async function fetchMyProducts(): Promise<Product[]> {
    try {
        const res = await apiFetch(`/products/my-products`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch my products');
        
        const json = await res.json();
        const data = Array.isArray(json) ? json : (json.data || []);
        return data.map(mapProduct);
    } catch (error) {
        console.error('Error fetching my products:', error);
        return [];
    }
}

export async function getHomepageCategories(): Promise<any> {
    try {
        const res = await apiFetch(`/config/homepage-categories`, { cache: 'no-store' });
        if (!res.ok) return [];
        return await res.json();
    } catch (error) {
        console.error('Error fetching homepage categories:', error);
        return [];
    }
}

export async function setHomepageCategories(data: any): Promise<boolean> {
    try {
        const res = await apiFetch(`/admin/config/homepage-categories`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return res.ok;
    } catch (error) {
        console.error('Error setting homepage categories:', error);
        return false;
    }
}

export async function fetchImageByEan(ean: string): Promise<string | null> {
    if (!ean) return null;
    try {
        const res = await apiFetch(`/products/ean/${ean}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return data.imageUrl || null;
    } catch (error) {
        console.error('Error fetching image by EAN:', error);
        return null;
    }
}
