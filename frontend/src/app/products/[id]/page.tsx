import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';

// Dynamic page — no static params needed since products come from the backend
export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');
// Use BACKEND_URL for SSR fetches (server → server, bypasses the browser proxy).
const API_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Product {
    id: string;
    name: string;
    description?: string;
    price?: number;
    basePrice?: number;
    images?: string[];
    brand?: string;
    category?: string;
    ean?: string;
    weight?: string;
    origin?: string;
    moq?: number;
    stock?: number;
    status?: string;
}

async function fetchProduct(id: string): Promise<Product | null> {
    try {
        const res = await fetch(`${API_URL}/products/${id}`, { next: { revalidate: 300 } });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * Per-product metadata — replaces the homepage default title that every
 * product page was inheriting (audit duplicate-title finding). Title and
 * description target the brand+product+wholesale keyword pattern from the
 * audit's keyword strategy table.
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
    const product = await fetchProduct(params.id);

    if (!product) {
        return {
            title: 'Product Not Found | Atlantis Marketplace',
            description: 'The product you are looking for is no longer available. Browse the wholesale catalogue.',
            robots: { index: false, follow: false },
        };
    }

    const brand = product.brand ? `${product.brand} ` : '';
    const titleBase = `${brand}${product.name}`.trim();
    const title = `${titleBase} — Wholesale Bulk Supplier | Atlantis`;

    const desc = product.description?.replace(/\s+/g, ' ').trim().slice(0, 155)
        || `Source ${titleBase} wholesale on Atlantis. KYC-verified suppliers, escrow-protected payments, EUR pricing. Order by carton, pallet, or full truck.`;

    const ogImage = (product.images || []).find(u => u && u.startsWith('http')) || `${SITE_URL}/og-image.png`;

    return {
        title,
        description: desc,
        alternates: { canonical: `${SITE_URL}/products/${product.id}` },
        openGraph: {
            type: 'website',
            title: titleBase,
            description: desc,
            url: `${SITE_URL}/products/${product.id}`,
            images: ogImage ? [{ url: ogImage, alt: titleBase }] : undefined,
        },
        twitter: {
            card: 'summary_large_image',
            title: titleBase,
            description: desc,
            images: ogImage ? [ogImage] : undefined,
        },
    };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
    const product = await fetchProduct(params.id);

    // JSON-LD Product schema — gives Google price + availability + brand
    // rich-result eligibility (audit issue #7). Renders only when the
    // backend returned a product so we don't ship stale schema for 404s.
    const schema = product ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.description,
        image: (product.images || []).filter(u => u && u.startsWith('http')),
        ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
        ...(product.ean ? { gtin13: product.ean } : {}),
        ...(product.category ? { category: product.category } : {}),
        offers: {
            '@type': 'Offer',
            price: product.price ?? product.basePrice ?? 0,
            priceCurrency: 'EUR',
            availability: (product.stock ?? 0) > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            url: `${SITE_URL}/products/${product.id}`,
            seller: { '@type': 'Organization', name: 'Atlantis Marketplace' },
        },
    } : null;

    const breadcrumb = product ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE_URL}/categories` },
            ...(product.category ? [{ '@type': 'ListItem', position: 3, name: product.category, item: `${SITE_URL}/categories?category=${encodeURIComponent(product.category)}` }] : []),
            { '@type': 'ListItem', position: product.category ? 4 : 3, name: product.name, item: `${SITE_URL}/products/${product.id}` },
        ],
    } : null;

    return (
        <>
            {schema && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
                />
            )}
            {breadcrumb && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
                />
            )}
            <ProductDetailClient />
        </>
    );
}
