import { Product } from './products';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

export interface ProductFilters {
    q?: string;
    category?: string;
    brand?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: 'newest' | 'price_asc' | 'price_desc' | 'name_asc';
}

function mapProduct(item: any): Product {
    return {
        id: item.id,
        name: item.name,
        brand: item.brand || item.supplier?.companyName || item.supplier?.name || 'Parallel Broker',
        price: item.price,
        basePrice: item.basePrice || null,
        supplierId: item.supplierId || null,
        unit: 'unit',
        minOrder: 10,
        image: (item.images && item.images.length > 0) ? item.images[0] : '',
        inStock: item.stock > 0,
        category: item.category,
        ean: item.ean,
        rating: 4.5 + (Math.random() * 0.5),
        reviews: Math.floor(Math.random() * 100) + 10,
    };
}

export async function fetchProductsWithFilters(filters: ProductFilters = {}): Promise<Product[]> {
    try {
        const params = new URLSearchParams({ status: 'APPROVED' });
        if (filters.q) params.set('q', filters.q);
        if (filters.category) params.set('category', filters.category);
        if (filters.brand) params.set('brand', filters.brand);
        if (filters.minPrice) params.set('minPrice', filters.minPrice);
        if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
        if (filters.sort) params.set('sort', filters.sort);
        const response = await fetch(`${API_URL}/products?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) return [];
        const text = await response.text();
        if (!text) return [];
        return JSON.parse(text).map(mapProduct);
    } catch (error) {
        console.error('Error fetching products with filters:', error);
        return [];
    }
}

export async function fetchProducts(): Promise<Product[]> {
    try {
        const response = await fetch(`${API_URL}/products?status=APPROVED`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to fetch products');
        }
        const text = await response.text();
        if (!text) return [];
        const data = JSON.parse(text);
        // The backend returns an array of products.
        // We'll map them to match our frontend Product interface if necessary
        return data.map((item: any) => ({
            id: item.id,
            name: item.name,
            brand: item.supplier?.companyName || item.supplier?.name || 'Parallel Broker',
            price: item.price,
            basePrice: item.basePrice || null,
            supplierId: item.supplierId || null,
            unit: 'unit',
            minOrder: 10,
            image: (item.images && item.images.length > 0) ? item.images[0] : '',
            inStock: item.stock > 0,
            category: item.category,
            ean: item.ean,
            rating: 4.5 + (Math.random() * 0.5),
            reviews: Math.floor(Math.random() * 100) + 10,
        }));
    } catch (error) {
        console.error('Error fetching products:', error);
        return [];
    }
}

export async function fetchMyProducts(token: string): Promise<Product[]> {
    try {
        const response = await fetch(`${API_URL}/products/my-products`, {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error('Failed to fetch my products');
        }
        const text = await response.text();
        if (!text) return [];
        const data = JSON.parse(text);
        return data.map((item: any) => ({
            id: item.id,
            name: item.name,
            brand: item.supplier?.companyName || item.supplier?.name || 'My Product',
            price: item.price, // This is basePrice for suppliers (mapped by backend)
            supplierId: item.supplierId || null,
            unit: 'unit',
            minOrder: 10,
            image: (item.images && item.images.length > 0) ? item.images[0] : '',
            inStock: item.stock > 0,
            category: item.category,
            ean: item.ean,
            rating: 4.5 + (Math.random() * 0.5),
            reviews: Math.floor(Math.random() * 100) + 10,
        }));
    } catch (error) {
        console.error('Error fetching my products:', error);
        return [];
    }
}

export async function getHomepageCategories(): Promise<any> {
    try {
        const response = await fetch(`${API_URL}/config/homepage-categories`, { cache: 'no-store' });
        if (!response.ok) return [];
        const text = await response.text();
        if (!text) return [];
        return JSON.parse(text);
    } catch (error) {
        console.error('Error fetching homepage categories:', error);
        return [];
    }
}

export async function setHomepageCategories(token: string, data: any): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/admin/config/homepage-categories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(data),
        });
        return response.ok;
    } catch (error) {
        console.error('Error setting homepage categories:', error);
        return false;
    }
}

export async function fetchImageByEan(ean: string): Promise<string | null> {
    if (!ean) return null;
    try {
        const response = await fetch(`${API_URL}/products/ean/${ean}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json();
        return data.imageUrl || null;
    } catch (error) {
        console.error('Error fetching image by EAN:', error);
        return null;
    }
}
