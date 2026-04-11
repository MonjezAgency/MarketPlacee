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
                                    title={t('home', 'makeup')}
                                    items={[
                                        { label: t('home', 'womensBeauty'), image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200&h=200&fit=crop", link: "/categories?category=Makeup" },
                                        { label: t('home', 'mensGrooming'), image: "https://images.unsplash.com/photo-1590156221122-c748c789d36a?w=200&h=200&fit=crop", link: "/categories?category=Makeup" },
                                        { label: t('home', 'skincare'), image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=200&h=200&fit=crop", link: "/categories?category=Personal Care" },
                                        { label: t('home', 'bestsellers'), image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=200&h=200&fit=crop", link: "/categories?category=Makeup" }
                                    ]}
                                    footerLink="/categories?category=Makeup"
                                    footerText={t('home', 'shopAllBeauty')}
                                />
                                <AmazonCardTile
                                    title={t('home', 'fragrances')}
                                    items={[
                                        { label: t('home', 'forMen'), image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=200&h=200&fit=crop", link: "/categories?category=Perfume" },
                                        { label: t('home', 'forWomen'), image: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=200&h=200&fit=crop", link: "/categories?category=Perfume" },
                                        { label: t('home', 'giftSets'), image: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=200&h=200&fit=crop", link: "/categories?category=Perfume" },
                                        { label: t('home', 'newArrivals'), image: "https://images.unsplash.com/photo-1583467875263-d50dec37a88c?w=200&h=200&fit=crop", link: "/categories?category=Perfume" }
                                    ]}
                                    footerLink="/categories?category=Perfume"
                                    footerText={t('home', 'seeAllPerfumes')}
                                />
                                <AmazonCardTile
                                    title={t('home', 'personalCare')}
                                    items={[
                                        { label: t('home', 'bodyCare'), image: "https://images.unsplash.com/photo-1612817288484-6f916006741a?w=200&h=200&fit=crop", link: "/categories?category=Personal Care" },
                                        { label: t('home', 'hairCare'), image: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=200&h=200&fit=crop", link: "/categories?category=Personal Care" },
                                        { label: t('home', 'oralCare'), image: "https://images.unsplash.com/photo-1559613122-02ec9d898a00?w=200&h=200&fit=crop", link: "/categories?category=Personal Care" },
                                        { label: t('home', 'shaving'), image: "https://images.unsplash.com/photo-1626285492eda-fa605a9a4734?w=200&h=200&fit=crop", link: "/categories?category=Personal Care" }
                                    ]}
                                    footerLink="/categories?category=Personal Care"
                                    footerText={t('home', 'essentials')}
                                />
                                <AmazonCardTile
                                    title={t('home', 'homeCleaning')}
                                    items={[
                                        { label: t('home', 'laundry'), image: "https://images.unsplash.com/photo-1583947581924-860bda6a26df?w=200&h=200&fit=crop", link: "/categories?category=Home Care" },
                                        { label: t('home', 'dishwashing'), image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=200&h=200&fit=crop", link: "/categories?category=Home Care" },
                                        { label: t('home', 'surfaceCare'), image: "https://images.unsplash.com/photo-1584622781564-1d987f7333c1?w=200&h=200&fit=crop", link: "/categories?category=Home Care" },
                                        { label: t('home', 'paperPlastic'), image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=200&h=200&fit=crop", link: "/categories?category=Home Care" }
                                    ]}
                                    footerLink="/categories?category=Home Care"
                                    footerText={t('home', 'shopHousehold')}
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
                                title={t('home', 'bulkBevs')}
                                items={[
                                    { label: t('home', 'energyDrinks'), image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&h=200&fit=crop", link: "/categories?category=Energy Drinks" },
                                    { label: t('home', 'softDrinks'), image: "https://images.unsplash.com/photo-1553456558-aff63285bdd1?w=200&h=200&fit=crop", link: "/categories?category=Soft Drinks" },
                                    { label: t('home', 'juices'), image: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=200&h=200&fit=crop", link: "/categories?category=Soft Drinks" },
                                    { label: t('home', 'water'), image: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=200&h=200&fit=crop", link: "/categories?category=Soft Drinks" }
                                ]}
                                footerLink="/categories?category=Soft Drinks"
                                footerText={t('home', 'restockDrinks')}
                            />
                            <AmazonCardTile
                                title={t('home', 'snacks')}
                                items={[
                                    { label: t('home', 'biscuits'), image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=200&h=200&fit=crop", link: "/categories?category=Snacks & Sweets" },
                                    { label: t('home', 'chocolates'), image: "https://images.unsplash.com/photo-1511381939415-e44015466834?w=200&h=200&fit=crop", link: "/categories?category=Snacks & Sweets" },
                                    { label: t('home', 'chips'), image: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=200&h=200&fit=crop", link: "/categories?category=Snacks & Sweets" },
                                    { label: t('home', 'gums'), image: "https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=200&h=200&fit=crop", link: "/categories?category=Snacks & Sweets" }
                                ]}
                                footerLink="/categories?category=Snacks & Sweets"
                                footerText={t('home', 'treatsInBulk')}
                            />
                            <AmazonCardTile
                                title={t('home', 'coffeeTea')}
                                items={[
                                    { label: t('home', 'instantCoffee'), image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&h=200&fit=crop", link: "/categories?category=Coffee & Tea" },
                                    { label: t('home', 'groundCoffee'), image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&h=200&fit=crop", link: "/categories?category=Coffee & Tea" },
                                    { label: t('home', 'teaBags'), image: "https://images.unsplash.com/photo-1594631252845-29fc4586d517?w=200&h=200&fit=crop", link: "/categories?category=Coffee & Tea" },
                                    { label: t('home', 'creamers'), image: "https://images.unsplash.com/photo-1544233726-9f1d2b27be8b?w=200&h=200&fit=crop", link: "/categories?category=Coffee & Tea" }
                                ]}
                                footerLink="/categories?category=Coffee & Tea"
                                footerText={t('home', 'caffeineSelection')}
                            />
                        </div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}



