"use client";

import Navbar from '@/components/layout/Navbar';
import OffersHero from '@/components/ui/OffersHero';
import AmazonCardTile from '@/components/ui/AmazonCardTile';
import PromoBanner from '@/components/ui/PromoBanner';
import { BRANDS } from '@/lib/products';
import { fetchProducts, getHomepageCategories } from '@/lib/api';
import type { Product, ProductStatus } from '@/lib/types';
import ProductCard from '@/components/product/ProductCard';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useState, useMemo, useEffect } from 'react';
import { AdPlacements } from '@/components/marketplace/AdPlacements';
import { useLanguage } from '@/contexts/LanguageContext';
import { BrandLogosMarquee } from '@/components/ui/BrandLogosMarquee';

function CatalogSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="bg-white dark:bg-[#1A1F26] p-4 md:p-6 mt-6 shadow-sm border border-black/5 dark:border-white/5 rounded-sm">
            <h2 className="text-lg md:text-xl font-extrabold mb-4 text-[#111] dark:text-white tracking-tight">
                {title}
            </h2>
            {children}
        </section>
    );
}

export default function Home() {
    const { t } = useLanguage();
    const [selectedPopularBrand, setSelectedPopularBrand] = useState<string | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dynamicCategories, setDynamicCategories] = useState<any[] | null>(null);

    useEffect(() => {
        fetchProducts().then(data => {
            setProducts(data);
            setIsLoading(false);
        });
        getHomepageCategories().then(data => {
            if (data && Array.isArray(data)) {
                setDynamicCategories(data);
            }
        });
    }, []);

    const popularProducts = useMemo(() => {
        let filtered = products.slice(0, 20); // Initial set of popular products
        if (selectedPopularBrand) {
            filtered = filtered.filter(p => p.brand !== undefined && p.brand === selectedPopularBrand);
        }
        return filtered.slice(0, 8); // Show up to 8
    }, [products, selectedPopularBrand]);

    return (
        <div className="flex flex-col min-h-screen bg-[#F5F7F7] dark:bg-[#0A0D12] transition-colors duration-500">
            <Navbar />

            <main className="flex-1 relative">
                <OffersHero />
                <BrandLogosMarquee />
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-[#F5F7F7] dark:to-[#0A0D12] h-full" />

                {/* Overlapping Content - Catalog Section */}
                {/* Overlapping Category Grid */}
                <div className="container mx-auto px-4 relative z-20">
                    <div className={(dynamicCategories && dynamicCategories.length > 0) || !dynamicCategories ? "-mt-24 md:-mt-64" : ""}>
                        {/* Catalog Grid Section 1 */}
                        {dynamicCategories && dynamicCategories.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                                {dynamicCategories.slice(0, 4).map((cat: any, i: number) => (
                                    <AmazonCardTile
                                        key={`top-${i}`}
                                        title={cat.title}
                                        items={cat.items}
                                        footerLink={cat.footerLink}
                                        footerText={cat.footerText}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                                <AmazonCardTile
                                    title="Makeup for Everyone"
                                    items={[
                                        { label: "Dove Beauty", image: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/Dove_logo.svg/1200px-Dove_logo.svg.png", link: "/categories?category=Makeup" },
                                        { label: "Lux Care", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQO_O_m4GvYm1v5A6sB9z7V9m9I1C0V0_8wZg&s", link: "/categories?category=Makeup" },
                                        { label: "Pond's Glow", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Pond%27s_Logo.svg/2560px-Pond%27s_Logo.svg.png", link: "/categories?category=Personal Care" },
                                        { label: "Vaseline", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Vaseline_logo.svg/2560px-Vaseline_logo.svg.png", link: "/categories?category=Makeup" }
                                    ]}
                                    footerLink="/categories?category=Makeup"
                                    footerText={t('home', 'shopAllBeauty')}
                                />
                                <AmazonCardTile
                                    title="Premium Fragrances"
                                    items={[
                                        { label: "Davidoff", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Davidoff_logo.svg/2560px-Davidoff_logo.svg.png", link: "/categories?category=Perfume" },
                                        { label: "Chanel Paris", image: "https://upload.wikimedia.org/wikipedia/en/thumb/9/92/Chanel_logo_interlocking_cs.svg/1200px-Chanel_logo_interlocking_cs.svg.png", link: "/categories?category=Perfume" },
                                        { label: "Dior Luxury", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Dior_Logo.svg/2560px-Dior_Logo.svg.png", link: "/categories?category=Perfume" },
                                        { label: "Giorgio Armani", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Giorgio_Armani_logo.svg/2560px-Giorgio_Armani_logo.svg.png", link: "/categories?category=Perfume" }
                                    ]}
                                    footerLink="/categories?category=Perfume"
                                    footerText="See All Fragrances"
                                />
                                <AmazonCardTile
                                    title="Personal Care"
                                    items={[
                                        { label: "Axe Styling", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/AXE_Logo.svg/2560px-AXE_Logo.svg.png", link: "/categories?category=Personal Care" },
                                        { label: "Rexona Active", image: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/Rexona_logo.svg/1200px-Rexona_logo.svg.png", link: "/categories?category=Personal Care" },
                                        { label: "Signal Care", image: "https://upload.wikimedia.org/wikipedia/en/thumb/d/dc/Signal_toothpaste_logo.svg/1200px-Signal_toothpaste_logo.svg.png", link: "/categories?category=Personal Care" },
                                        { label: "Close-up", image: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/Closeup_toothpaste_logo.svg/1200px-Closeup_toothpaste_logo.svg.png", link: "/categories?category=Personal Care" }
                                    ]}
                                    footerLink="/categories?category=Personal Care"
                                    footerText="Shop Essentials"
                                />
                                <AmazonCardTile
                                    title="Home Cleaning"
                                    items={[
                                        { label: "Persil Tech", image: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f1/Persil_logo.svg/1200px-Persil_logo.svg.png", link: "/categories?category=Home Care" },
                                        { label: "Cif Professional", image: "https://upload.wikimedia.org/wikipedia/en/thumb/6/6d/Cif_logo.svg/1200px-Cif_logo.svg.png", link: "/categories?category=Home Care" },
                                        { label: "Domestos", image: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Domestos_logo.svg/1200px-Domestos_logo.svg.png", link: "/categories?category=Home Care" },
                                        { label: "Comfort Soft", image: "https://upload.wikimedia.org/wikipedia/en/thumb/8/87/Comfort_logo.svg/1200px-Comfort_logo.svg.png", link: "/categories?category=Home Care" }
                                    ]}
                                    footerLink="/categories?category=Home Care"
                                    footerText="Clean Home Store"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Sections */}
                <div className="container mx-auto px-4 relative z-10 pb-20 space-y-12 mt-12 md:mt-16">
                    {/* First Promo Banner */}
                    <PromoBanner
                        title={t('home', 'growBusinessTitle')}
                        subtitle={t('home', 'growBusinessSubtitle')}
                        ctaText={t('home', 'registerNow')}
                        ctaHref="/auth/register"
                        image="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=1600"
                    />

                    {/* Best Sellers Scroller */}
                    <CatalogSection title={t('home', 'trendingBevs')}>
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 pt-2 -mx-2 px-2">
                            {isLoading ? (
                                <div className="py-8 px-4 text-muted-foreground font-medium text-sm">{t('home', 'loadingBestSellers')}</div>
                            ) : (
                                products.slice(0, 10).map((product, i) => (
                                    <div key={product.id} className="min-w-[180px] md:min-w-[220px] max-w-[220px]">
                                        <ProductCard product={product} index={i} />
                                    </div>
                                ))
                            )}
                        </div>
                    </CatalogSection>

                    {/* 3D Ad Placements - Strategic Position */}
                    <div className="my-10">
                        <AdPlacements />
                    </div>

                    {/* Popular Products with Filter */}
                    <CatalogSection title={t('home', 'popularPicks')}>
                        <div className="flex flex-col gap-8">
                            {/* Simple Brand Filter */}
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                <button
                                    onClick={() => setSelectedPopularBrand(null)}
                                    className={cn(
                                        "px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border",
                                        selectedPopularBrand === null
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-white dark:bg-white/5 text-foreground border-border hover:border-primary/50"
                                    )}
                                >
                                    {t('home', 'allBrands')}
                                </button>
                                {BRANDS.slice(0, 7).map(brand => (
                                    <button
                                        key={brand}
                                        onClick={() => setSelectedPopularBrand(brand)}
                                        className={cn(
                                            "px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border",
                                            selectedPopularBrand === brand
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-white dark:bg-white/5 text-foreground border-border hover:border-primary/50"
                                        )}
                                    >
                                        {brand}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {isLoading ? (
                                    <div className="col-span-full py-8 text-center text-muted-foreground font-medium">{t('home', 'loadingPopular')}</div>
                                ) : (
                                    popularProducts.map((product, i) => (
                                        <ProductCard key={product.id} product={product} index={i} />
                                    ))
                                )}
                            </div>

                            {popularProducts.length === 0 && (
                                <div className="py-12 text-center text-muted-foreground font-medium">
                                    {t('home', 'noProductsForBrand')}
                                </div>
                            )}
                        </div>
                    </CatalogSection>

                    {/* Second Promo Banner */}
                    <PromoBanner
                        title={t('home', 'logisticsTitle')}
                        subtitle={t('home', 'logisticsSubtitle')}
                        ctaText={t('home', 'viewSolutions')}
                        ctaHref="/categories"
                        image="https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&q=80&w=1600"
                        backgroundColor="bg-[#232F3E]"
                        reverse
                    />

                    {/* Secondary Catalog Grid */}
                    {dynamicCategories && dynamicCategories.length > 4 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mt-8">
                            {dynamicCategories.slice(4).map((cat: any, i: number) => (
                                <AmazonCardTile
                                    key={`bottom-${i}`}
                                    title={cat.title}
                                    items={cat.items}
                                    footerLink={cat.footerLink}
                                    footerText={cat.footerText}
                                />
                            ))}
                        </div>
                    ) : !dynamicCategories ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mt-8">
                            <AmazonCardTile
                                title="Bulk Beverages"
                                items={[
                                    { label: "Coca-Cola", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Coca-Cola_logo.svg/2560px-Coca-Cola_logo.svg.png", link: "/categories?category=Soft Drinks" },
                                    { label: "Pepsi", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Pepsi_logo_2023.svg/2560px-Pepsi_logo_2023.svg.png", link: "/categories?category=Soft Drinks" },
                                    { label: "Red Bull", image: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f5/Red_Bull_new_logo.svg/1200px-Red_Bull_new_logo.svg.png", link: "/categories?category=Energy Drinks" },
                                    { label: "Fanta", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Fanta_logo_%282023%29.svg/2560px-Fanta_logo_%282023%29.svg.png", link: "/categories?category=Soft Drinks" }
                                ]}
                                footerLink="/categories?category=Soft Drinks"
                                footerText="Restock Drinks"
                            />
                            <AmazonCardTile
                                title="Snacks & Sweets"
                                items={[
                                    { label: "Twix", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Twix-Logo.svg/2560px-Twix-Logo.svg.png", link: "/categories?category=Snacks & Sweets" },
                                    { label: "Oreo", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Oreo_logo.svg/2560px-Oreo_logo.svg.png", link: "/categories?category=Snacks & Sweets" },
                                    { label: "Kinder", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Kinder_logo.svg/2560px-Kinder_logo.svg.png", link: "/categories?category=Snacks & Sweets" },
                                    { label: "M&M's", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/M%26Ms_logo.svg/2560px-M%26Ms_logo.svg.png", link: "/categories?category=Snacks & Sweets" }
                                ]}
                                footerLink="/categories?category=Snacks & Sweets"
                                footerText="Treats in Bulk"
                            />
                            <AmazonCardTile
                                title="Coffee & Tea"
                                items={[
                                    { label: "Nescafé", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Nescafe_logo.svg/2560px-Nescafe_logo.svg.png", link: "/categories?category=Coffee & Tea" },
                                    { label: "Starbucks", image: "https://upload.wikimedia.org/wikipedia/en/thumb/d/d3/Starbucks_Corporation_Logo_2011.svg/1200px-Starbucks_Corporation_Logo_2011.svg.png", link: "/categories?category=Coffee & Tea" },
                                    { label: "Lavazza", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Lavazza_logo.svg/2560px-Lavazza_logo.svg.png", link: "/categories?category=Coffee & Tea" },
                                    { label: "Jacobs", image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Jacobs_Logo.svg/2560px-Jacobs_Logo.svg.png", link: "/categories?category=Coffee & Tea" }
                                ]}
                                footerLink="/categories?category=Coffee & Tea"
                                footerText="Caffeine Selection"
                            />
                        </div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}



