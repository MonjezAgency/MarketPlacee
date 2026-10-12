/**
 * Brand → logo asset, only for brands whose genuine logo ships in
 * /public/brands. Unknown brands return null (no placeholder logos).
 */
const LOGOS: Record<string, string> = {
    'coca-cola': '/brands/coca-cola.svg', 'cocacola': '/brands/coca-cola.svg',
    'nescafe': '/brands/nescafe.webp', 'ferrero rocher': '/brands/ferrero-rocher.webp',
    'nivea': '/brands/nivea.svg', 'red bull': '/brands/red-bull.webp', 'redbull': '/brands/red-bull.webp',
    'nutella': '/brands/nutella.svg', 'persil': '/brands/persil.webp', 'pepsi': '/brands/pepsi.svg',
    'lavazza': '/brands/lavazza.webp', 'snickers': '/brands/snickers.svg', 'dove': '/brands/dove.webp',
    'kinder': '/brands/kinder.webp', 'domestos': '/brands/domestos.webp', "m&m's": '/brands/mms.svg',
    'm&ms': '/brands/mms.svg', 'oreo': '/brands/oreo.webp', 'sprite': '/brands/sprite.webp',
    'jacobs': '/brands/jacobs.webp', 'comfort': '/brands/comfort.webp', 'twix': '/brands/twix.webp',
    'starbucks': '/brands/starbucks.webp', 'tchibo': '/brands/tchibo.webp', 'dr pepper': '/brands/dr-pepper.webp',
    'cif': '/brands/cif.webp', "wall's": '/brands/walls.webp', 'walls': '/brands/walls.webp', 'wonka': '/brands/wonka.webp',
};

export function brandLogo(brand?: string | null): string | null {
    if (!brand) return null;
    const k = brand.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'");
    return LOGOS[k] ?? null;
}

/** Display names for brands that have a genuine logo in /public/brands. */
export const LOGO_BRANDS = ['Coca-Cola', 'Nescafé', 'Ferrero Rocher', 'NIVEA', 'Red Bull', 'Nutella', 'Persil', 'Pepsi', 'Lavazza', 'Snickers', 'Dove', 'Kinder', 'Domestos', "M&M's", 'Oreo', 'Sprite', 'Jacobs', 'Comfort', 'Twix', 'Starbucks', 'Tchibo', 'Dr Pepper', 'Cif', "Wall's", 'Wonka'];
