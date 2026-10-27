'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

interface SponsoredBrandProps {
    brandName: string;
    logoUrl?: string;
    products: any[];
}

export default function SponsoredBrandBanner({ brandName, logoUrl, products }: SponsoredBrandProps) {
    const { t } = useLanguage();
    if (!products || products.length === 0) return null;

    return (
        <div className="w-full bg-[#F3F3F3] border border-[#DDDDDD] p-4 flex flex-col md:flex-row items-center gap-6 rounded-md mb-6">
            <div className="flex flex-col items-center justify-center min-w-[200px] border-e border-[#DDDDDD] pe-6">
                <span className="text-[11px] text-[#565656] font-medium self-start mb-2">{t('catalogPage', 'sponsored')}</span>
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center overflow-hidden border border-[#DDDDDD] mb-3 shadow-sm">
                    {logoUrl ? (
                        <img src={logoUrl} alt={brandName} className="object-cover w-full h-full" />
                    ) : (
                        <span className="font-bold text-2xl text-[#232F3E]">{brandName.charAt(0)}</span>
                    )}
                </div>
                <h3 className="font-bold text-[#0F1111] text-lg text-center leading-tight">{t('catalogPage', 'shopBrand', { brand: brandName })}</h3>
                <Link href={`/categories?brand=${encodeURIComponent(brandName)}`} className="text-[#007185] text-sm hover:underline hover:text-[#C7511F] mt-1">
                    {t('catalogPage', 'viewBrand')}
                </Link>
            </div>

            <div className="flex-1 flex items-center gap-4 overflow-x-auto pb-2">
                {products.slice(0, 3).map(product => (
                    <Link key={product.id} href={`/products/${product.id}`} className="flex-1 min-w-[150px] bg-white border border-[#DDDDDD] rounded-md p-3 hover:shadow-sm transition-shadow flex flex-col items-center">
                        <div className="h-28 w-28 mb-3">
                            <img src={product.images?.[0] || ''} alt={product.name} className="w-full h-full object-contain mix-blend-multiply" />
                        </div>
                        <p className="text-sm font-medium text-[#0F1111] line-clamp-2 text-center group-hover:text-[#C7511F]">
                            {product.name}
                        </p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
