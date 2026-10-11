/**
 * FMCG departments shown in the marketplace nav (New offers · Targets ·
 * Requests | All · departments). A department is a *view* over whatever
 * categories suppliers, buyers and admins actually used when listing — so
 * matching is keyword-based on `product.category`, not an exact list.
 * If nothing matches, the catalog shows a department-specific empty state.
 */
export interface Department {
    slug: string;
    label: string;
    /** Case-insensitive substrings matched against product.category. */
    include: string[];
    /** Substrings that disqualify a match (e.g. "Pet Food" is not Food). */
    exclude?: string[];
}

export const DEPARTMENTS: Department[] = [
    { slug: 'confectionery', label: 'Confectionery', include: ['confection', 'chocolate', 'sweet', 'candy', 'candies', 'gum', 'praline'] },
    { slug: 'snacks', label: 'Snacks', include: ['snack', 'biscuit', 'chips', 'crisp', 'cookie', 'cracker', 'wafer', 'popcorn', 'nuts'] },
    { slug: 'beverages', label: 'Beverages', include: ['beverage', 'drink', 'coffee', 'tea', 'juice', 'nectar', 'water', 'soda', 'cola'], exclude: ['toilet', 'micellar', 'tea tree', 'steak'] },
    { slug: 'personal-care', label: 'Personal Care', include: ['personal care', 'hair', 'oral', 'tooth', 'deodorant', 'shav', 'razor', 'bath', 'shower', 'hygiene'], exclude: ['pet food', 'pet care', 'baby'] },
    { slug: 'beauty', label: 'Beauty', include: ['beauty', 'makeup', 'make-up', 'cosmetic', 'skin', 'fragrance', 'perfume', 'nail'] },
    { slug: 'household', label: 'Household', include: ['household', 'cleaning', 'cleaner', 'laundry', 'detergent', 'dishwash', 'paper', 'tissue', 'kitchen', 'home'] },
    { slug: 'food', label: 'Food', include: ['food', 'dairy', 'cheese', 'frozen', 'bakery', 'bread', 'pantry', 'grain', 'pasta', 'rice', 'canned', 'jarred', 'spice', 'condiment', 'sauce', 'oil', 'meat', 'poultry', 'seafood', 'cereal', 'spread'], exclude: ['pet', 'baby', 'dog', 'cat ', 'toilet', 'hair', 'body', 'skin', 'essential'] },
    { slug: 'baby', label: 'Baby', include: ['baby', 'infant', 'diaper', 'nappy', 'nappies'] },
    { slug: 'pets', label: 'Pets', include: ['pet', 'dog', 'cat food', 'cat litter'], exclude: ['carpet', 'petroleum', 'trumpet'] },
    { slug: 'health', label: 'Health', include: ['health', 'wellness', 'vitamin', 'supplement', 'pharma', 'medical', 'first aid'] },
];

export function getDepartment(slug: string | null | undefined): Department | undefined {
    if (!slug) return undefined;
    return DEPARTMENTS.find((d) => d.slug === slug);
}

export function matchesDepartment(category: string | null | undefined, dept: Department): boolean {
    const c = ` ${String(category || '').toLowerCase()} `;
    if (!c.trim()) return false;
    if (dept.exclude?.some((x) => c.includes(x))) return false;
    return dept.include.some((x) => c.includes(x));
}
