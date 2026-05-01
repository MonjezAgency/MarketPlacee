'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCurrencyInfo } from '@/lib/currency';

interface FilterProps {
    brands: string[];
    categories: string[];
    selectedBrands: string[];
    selectedCategories: string[];
    selectedAudience?: string[];
    priceRange: { min: string; max: string };
    onBrandChange: (brand: string) => void;
    onCategoryChange: (category: string) => void;
    onAudienceChange?: (audience: string) => void;
    onPriceChange: (range: { min: string; max: string }) => void;
    onApplyPrice: () => void;
}

function FilterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border-b border-border/60 pb-5 mb-5 last:border-0 last:pb-0 last:mb-0">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full text-start mb-3 group"
            >
                <h3 className="text-xs font-bold text-foreground transition-colors">{title}</h3>
                <ChevronDown className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform duration-200",
                    isOpen ? 'rotate-180' : ''
                )} />
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function ProductFilters(props: FilterProps) {
    const { t } = useLanguage();
    const minVal = parseInt(props.priceRange.min) || 0;
    const maxVal = parseInt(props.priceRange.max) || 1000;

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'min' | 'max') => {
        const value = e.target.value;
        if (type === 'min') {
            if (parseInt(value) <= maxVal) {
                props.onPriceChange({ ...props.priceRange, min: value });
            }
        } else {
            if (parseInt(value) >= minVal) {
                props.onPriceChange({ ...props.priceRange, max: value });
            }
        }
    };

    return (
        <div className="bg-card px-2">
            {/* Categories */}
            <FilterSection title={t('categories', 'department')}>
                <div className="flex flex-col gap-1.5">
                    {props.categories.map(cat => {
                        const isActive = props.selectedCategories.includes(cat);
                        return (
                            <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={() => props.onCategoryChange(cat)}
                                    className="w-4 h-4 rounded-sm border-border text-primary focus:ring-primary/20 transition-all cursor-pointer accent-primary"
                                />
                                <span className={cn(
                                    "text-sm group-hover:text-primary transition-colors",
                                    isActive ? "font-bold text-foreground" : "text-muted-foreground"
                                )}>
                                    {t('categories', cat.replace(/\s+/g, '').replace(/&/g, 'And').charAt(0).toLowerCase() + cat.replace(/\s+/g, '').replace(/&/g, 'And').slice(1)) || cat}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </FilterSection>

            {/* Brand */}
            <FilterSection title={t('categories', 'brand')}>
                <div className="flex flex-col gap-1.5 pt-1">
                    {props.brands.map(brand => {
                        const isActive = props.selectedBrands.includes(brand);
                        return (
                            <label key={brand} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={() => props.onBrandChange(brand)}
                                    className="w-4 h-4 rounded-sm border-border text-primary focus:ring-primary/20 transition-all cursor-pointer accent-primary"
                                />
                                <span className={cn(
                                    "text-sm group-hover:text-primary transition-colors",
                                    isActive ? "font-bold text-foreground" : "text-muted-foreground"
                                )}>
                                    {brand}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </FilterSection>

            {/* Target Audience */}
            <FilterSection title={t('categories', 'targetAudience')} defaultOpen={true}>
                <div className="flex flex-col gap-1.5 pt-1">
                    {['Women', 'Men', 'Unisex'].map(audience => {
                        const isActive = props.selectedAudience?.includes(audience);
                        const label = t('categories', audience.toLowerCase());
                        return (
                            <label key={audience} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={() => props.onAudienceChange?.(audience)}
                                    className="w-4 h-4 rounded-sm border-border text-primary focus:ring-primary/20 transition-all cursor-pointer accent-primary"
                                />
                                <span className={cn(
                                    "text-sm group-hover:text-primary transition-colors",
                                    isActive ? "font-bold text-foreground" : "text-muted-foreground"
                                )}>
                                    {label}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </FilterSection>

            {/* Price Filter */}
            <FilterSection title={t('categories', 'price')}>
                <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{getCurrencyInfo().symbol}</span>
                            <input
                                type="number"
                                value={minVal}
                                onChange={(e) => props.onPriceChange({ ...props.priceRange, min: e.target.value })}
                                placeholder={t('categories', 'min')}
                                className="w-full h-10 bg-transparent border border-border/80 rounded-md ps-6 pe-3 text-sm focus:border-primary outline-none transition-colors"
                            />
                        </div>
                        <span className="text-muted-foreground">-</span>
                        <div className="relative flex-1">
                            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{getCurrencyInfo().symbol}</span>
                            <input
                                type="number"
                                value={maxVal}
                                onChange={(e) => props.onPriceChange({ ...props.priceRange, max: e.target.value })}
                                placeholder={t('categories', 'max')}
                                className="w-full h-10 bg-transparent border border-border/80 rounded-md ps-6 pe-3 text-sm focus:border-primary outline-none transition-colors"
                            />
                        </div>
                    </div>
                    <button
                        onClick={props.onApplyPrice}
                        className="w-full h-10 bg-foreground text-background rounded-md text-xs font-bold btn-hover"
                    >
                        {t('categories', 'go')}
                    </button>
                </div>
            </FilterSection>

            {/* Special */}
            <FilterSection title={t('categories', 'specialOffers')} defaultOpen={false}>
                <label className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" className="w-4 h-4 rounded-sm border-border text-primary cursor-pointer accent-primary" />
                    <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">{t('categories', 'discountedItems')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group mt-2">
                    <input type="checkbox" className="w-4 h-4 rounded-sm border-border text-primary cursor-pointer accent-primary" />
                    <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">{t('categories', 'bulkSaveConfig')}</span>
                </label>
            </FilterSection>
        </div>
    );
}
