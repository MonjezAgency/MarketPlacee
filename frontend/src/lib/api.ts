import { Product, ProductStatus, Filters } from '@/lib/types';

// frontend/src/lib/api.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!BASE_URL && typeof window !== 'undefined') {
    console.warn(
        '[API] NEXT_PUBLIC_API_URL is not set. ' +
        'API calls will fail. Please check your Vercel or local .env configuration.'
    );
}

export const apiUrl = BASE_URL || '';

/**
 * Standardized fetch wrapper for the Marketplace platform.
 *
 * In the browser: routes through /api/proxy/[path] (Next.js server-side route)
 * which reads the httpOnly `token` cookie and forwards it to Railway.
 * This solves the cross-domain cookie problem where Vercel-scoped cookies
 * are not sent by the browser on cross-origin requests to Railway.
 *
 * On the server (SSR/RSC): calls the Railway backend directly.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    // Absolute URLs (e.g. health checks) are passed through as-is
    if (path.startsWith('http')) {
        return fetch(path, { ...options, credentials: 'include' });
    }

    const isClient = typeof window !== 'undefined';

    // In the browser, route through the authenticated Next.js proxy so the
    // Vercel-domain httpOnly cookie gets forwarded to the Railway backend.
    const url = isClient
        ? `/api/proxy${path.startsWith('/') ? path : `/${path}`}`
        : `${apiUrl}${path}`;

    // Build headers safely
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
    };

    // Only set Content-Type for non-FormData bodies
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    // Remove empty Authorization header (prevents CORS preflight failures)
    if (!headers['Authorization']) {
        delete headers['Authorization'];
    }

    return fetch(url, {
        ...options,
        // credentials: 'include' is still needed for server-side direct calls
        credentials: isClient ? 'same-origin' : 'include',
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
        brand: item.brand || 'Atlantis',
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
        weight: item.weight || undefined,
        shelfLife: item.shelfLife || undefined,
        origin: item.origin || undefined,
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

export async function fetchSearchSuggestions(query: string): Promise<Product[]> {
    try {
        if (!query || query.trim() === '') return [];
        const res = await apiFetch(`/products/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        if (!res.ok) return [];
        const json = await res.json();
        const data = Array.isArray(json) ? json : (json.data || []);
        return data.map(mapProduct);
    } catch (error) {
        console.error('Error fetching search suggestions:', error);
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

export async function fetchProductById(id: string): Promise<Product | null> {
    try {
        const res = await apiFetch(`/products/${id}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const item = await res.json();
        return mapProduct(item);
    } catch (error) {
        console.error('Error fetching product by id:', error);
        return null;
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

export async function fetchImagesByEan(ean: string, limit: number = 3): Promise<string[]> {
    if (!ean) return [];
    try {
        const res = await apiFetch(`/products/ean/${ean}?limit=${limit}`, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return data.imageUrls || [];
    } catch (error) {
        console.error('Error fetching images by EAN:', error);
        return [];
    }
}

export async function fetchImageByEan(ean: string): Promise<string | null> {
    const images = await fetchImagesByEan(ean, 1);
    return images.length > 0 ? images[0] : null;
}
export async function fetchSupplierAds(): Promise<any[]> {
    try {
        const res = await apiFetch('/ads/supplier/my-ads', { cache: 'no-store' });
        if (!res.ok) return [];
        return await res.json();
    } catch (error) {
        console.error('Error fetching supplier ads:', error);
        return [];
    }
}

export async function requestAdPlacement(data: { productId: string; type: string; durationDays: number }): Promise<any> {
    try {
        const res = await apiFetch('/ads/supplier/request', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to request placement');
        return await res.json();
    } catch (error) {
        console.error('Error requesting ad placement:', error);
        throw error;
    }
}

export async function deleteAdPlacement(id: string): Promise<boolean> {
    try {
        const res = await apiFetch(`/ads/supplier/${id}`, {
            method: 'DELETE',
        });
        return res.ok;
    } catch (error) {
        console.error('Error deleting ad placement:', error);
        return false;
    }
}
export async function getAdPlacements(): Promise<any> {
    try {
        const res = await apiFetch(`/admin/config/placements`, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch (error) {
        console.error('Error fetching ad placements:', error);
        return null;
    }
}

export async function setAdPlacements(data: any): Promise<boolean> {
    try {
        const res = await apiFetch(`/admin/config/placements`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return res.ok;
    } catch (error) {
        console.error('Error setting ad placements:', error);
        return false;
    }
}
