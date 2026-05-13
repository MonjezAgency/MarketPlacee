/**
 * Section definitions for the Homepage Banner Manager.
 *
 * These mirror the real homepage layout in HomeClient.tsx. When the
 * homepage gets a new image-bearing section, add a matching entry
 * here so the admin can manage it from /admin/banners.
 *
 * Each section carries:
 *   id          — URL slug + storage key, must be unique
 *   label       — admin-facing name
 *   blurb       — short explanation shown in the editor header
 *   size        — recommended dimensions ("1600 × 600")
 *   aspectRatio — CSS aspect-ratio value used by previews
 *   defaultAnimated — fallback for the rotation toggle when nothing saved
 *   defaultIntervalMs — fallback rotation delay
 *   minItems / maxItems — soft caps for the admin UI
 */

export interface SectionDef {
    id: string;
    label: string;
    blurb: string;
    size: string;
    aspectRatio: string;
    defaultAnimated: boolean;
    defaultIntervalMs: number;
    minItems?: number;
    maxItems?: number;
    /**
     * Layout hint for the homepage sketch — controls how the section
     * is drawn inside the wireframe so the admin recognises which
     * block on the real page they're clicking.
     */
    sketch: 'hero' | 'brand-strip' | 'category-grid' | 'promo-pair' | 'wide-banner' | 'mid-pair' | 'footer-strip';
}

export const SECTIONS: SectionDef[] = [
    {
        id: 'hero',
        label: 'Hero Slider',
        blurb: 'Full-width slider at the very top of the homepage. Each slide carries an image + your "Direct Sourcing" headline.',
        size: '1920 × 720',
        aspectRatio: '16/6',
        defaultAnimated: true,
        defaultIntervalMs: 6000,
        minItems: 1,
        maxItems: 6,
        sketch: 'hero',
    },
    {
        id: 'brands',
        label: 'Trusted by Leading Global Brands',
        blurb: 'Animated brand-logo marquee. Add the trademark logos of every partner you want featured.',
        size: '320 × 80 (per logo)',
        aspectRatio: '4/1',
        defaultAnimated: true,
        defaultIntervalMs: 2000,
        minItems: 4,
        maxItems: 30,
        sketch: 'brand-strip',
    },
    {
        id: 'top-categories',
        label: 'Top Categories for Your Business',
        blurb: 'Five large category cards under the hero. Each card carries an image + a title + a one-line description on the homepage.',
        size: '900 × 600 (per card)',
        aspectRatio: '3/2',
        defaultAnimated: false,
        defaultIntervalMs: 5000,
        minItems: 3,
        maxItems: 8,
        sketch: 'category-grid',
    },
    {
        id: 'promo-pair',
        label: 'Dual-Promo Strip',
        blurb: 'Two-up promotional banners shown below the hero — left and right column.',
        size: '600 × 400 each',
        aspectRatio: '3/2',
        defaultAnimated: false,
        defaultIntervalMs: 5000,
        minItems: 2,
        maxItems: 4,
        sketch: 'promo-pair',
    },
    {
        id: 'category-strip',
        label: 'Category Strip Banner',
        blurb: 'Wide banner above the "Browse by Business Category" section.',
        size: '1600 × 220',
        aspectRatio: '16/2',
        defaultAnimated: false,
        defaultIntervalMs: 5000,
        maxItems: 5,
        sketch: 'wide-banner',
    },
    {
        id: 'mid',
        label: 'Mid-Page Banners',
        blurb: 'Two-up mid-page split — left side / right side. Often used for featured supplier vs seasonal callout.',
        size: '800 × 300 each',
        aspectRatio: '8/3',
        defaultAnimated: false,
        defaultIntervalMs: 5000,
        minItems: 2,
        maxItems: 4,
        sketch: 'mid-pair',
    },
    {
        id: 'footer',
        label: 'Footer Strip',
        blurb: 'Last banner before the global footer. Best for newsletter / sign-up CTA.',
        size: '1600 × 200',
        aspectRatio: '16/2',
        defaultAnimated: false,
        defaultIntervalMs: 5000,
        maxItems: 3,
        sketch: 'footer-strip',
    },
];

export function getSectionById(id: string): SectionDef | undefined {
    return SECTIONS.find(s => s.id === id);
}

export interface BannerData {
    imageUrl: string;
    linkUrl?: string | null;
    alt?: string;
    updatedAt?: string;
}

export interface SectionEnvelope {
    items: BannerData[];
    animated: boolean;
    intervalMs: number;
}

export type BannerMap = Record<string, SectionEnvelope>;
