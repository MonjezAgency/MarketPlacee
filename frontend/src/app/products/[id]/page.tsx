import ProductDetailClient from './ProductDetailClient';

// Dynamic page — no static params needed since products come from the backend
export const dynamic = 'force-dynamic';

export default function ProductPage() {
    return <ProductDetailClient />;
}
