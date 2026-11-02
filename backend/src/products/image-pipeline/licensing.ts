import type { Candidate, DomainClass, Licence } from './types';

/**
 * Who may be published, and when. The rule the owner chooses is one setting:
 *   A: an `unknown` licence always goes to a person. The default.
 *   B: `unknown` may publish only with confidence 0.9+, from the brand's own
 *      domain or a major retailer, and never an editorial image.
 */
/** A: stated licences only. B: also brand and retailer pages. open: anything vision passed, on the owner's decision of 2 Nov 2026; the source stays on record. */
export type LicencePolicy = 'A' | 'B' | 'open';
export const DEFAULT_POLICY: LicencePolicy = 'A';
export const AUTO_APPROVE_CONFIDENCE = 0.9;
export const POLICY_B_CONFIDENCE = 0.9;

/** Brands whose official sites use another name. A domain counts as the brand's only on an exact label. */
const OWNER_DOMAINS: Record<string, string[]> = {
    pampers: ['pg', 'pgshop', 'pampers'], fairy: ['pg', 'fairy'], ariel: ['pg', 'ariel'], tena: ['essity', 'tena'], libero: ['essity'], nutella: ['ferrero', 'nutella'], kinder: ['ferrero', 'kinder'],
    milka: ['mondelezinternational', 'milka'], oreo: ['mondelezinternational', 'oreo'], dove: ['unilever', 'dove'], lipton: ['unilever', 'lipton'], redbull: ['redbull'], monster: ['monsterenergy'], prime: ['drinkprime'],
    cocacola: ['coca-cola', 'cocacola', 'coca-colacompany'], pepsi: ['pepsico', 'pepsi'], lavazza: ['lavazza'], nescafe: ['nescafe', 'nestle'], persil: ['henkel', 'persil'], nivea: ['nivea', 'beiersdorf'],
};
/** True when one name is the company that owns the other: a database saying "Ferrero" for a Nutella row is no disagreement. */
export const ownedBy = (brand: string, company: string) => (OWNER_DOMAINS[compact(brand)] || []).includes(compact(company));
const RETAILERS = new Set([
    'carrefour', 'tesco', 'dm', 'rewe', 'kaufland', 'amazon', 'emag', 'noon', 'sainsburys', 'asda', 'morrisons', 'ocado', 'waitrose', 'lidl', 'aldi', 'auchan', 'walmart', 'target', 'ah', 'albertheijn', 'jumbo',
    'edeka', 'rossmann', 'mueller', 'bipa', 'migros', 'coop', 'lulu', 'luluhypermarket', 'spinneys', 'superdrug', 'boots', 'etos', 'kruidvat', 'douglas', 'costco', 'mega-image', 'freshful', 'sephora',
]);
const EAN_DATABASES = new Set(['openfoodfacts', 'openbeautyfacts', 'openproductsfacts', 'ean-db', 'upcitemdb', 'go-upc', 'barcodespider', 'barcodelookup']);
/** Never used, whatever else the photo scores. */
const BLOCKED = new Set([
    'aliexpress', 'alicdn', 'alibaba', 'temu', 'shein', 'wish', 'dhgate', 'pinterest', 'pinimg', 'facebook', 'fbcdn', 'instagram', 'cdninstagram', 'tiktok', 'tiktokcdn', 'twitter', 'twimg', 'reddit', 'redd', 'youtube', 'ytimg',
    'shutterstock', 'alamy', 'dreamstime', 'istockphoto', 'istock', '123rf', 'depositphotos', 'adobestock', 'stock', 'gettyimages', 'freepik', 'vecteezy', 'pngtree', 'vectorstock', 'canstockphoto', 'bigstockphoto',
]);

const compact = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function hostOf(url?: string) { try { return new URL(String(url)).hostname.toLowerCase(); } catch { return ''; } }
const labels = (host: string) => host.split('.').filter(Boolean);

/** The page a photo is on says more than the CDN it is served from. */
export function candidateHost(c: Pick<Candidate, 'url' | 'pageUrl'>) { return hostOf(c.pageUrl) || hostOf(c.url); }

export function blockedDomain(c: Pick<Candidate, 'url' | 'pageUrl' | 'source'>): string | null {
    if (c.source === 'shutterstock') return null;   // the licensed route, handled by its own rule
    for (const host of [hostOf(c.pageUrl), hostOf(c.url)]) if (labels(host).some((l) => BLOCKED.has(l))) return host;
    return null;
}

export function domainClass(c: Pick<Candidate, 'url' | 'pageUrl'>, brand: string): DomainClass {
    const parts = labels(candidateHost(c));
    const owner = compact(brand);
    const owners = new Set([owner, ...(OWNER_DOMAINS[owner] || [])].filter((x) => x.length >= 2));
    if (parts.slice(0, -1).some((l) => owners.has(l))) return 'brand';
    if (parts.some((l) => RETAILERS.has(l))) return 'retailer';
    if (parts.some((l) => EAN_DATABASES.has(l))) return 'ean_database';
    return 'unknown';
}

export function licenceOf(c: Candidate, cls: DomainClass): Licence {
    if (c.isEditorial) return 'editorial';
    if (c.licence) return c.licence;
    if (c.source === 'supplier') return 'supplier';
    if (cls === 'brand') return 'manufacturer';
    return 'unknown';
}

/** Vision has already passed when this is asked. */
export function mayPublish(input: { licence: Licence; confidence: number; domain: DomainClass; isEditorial?: boolean }, policy: LicencePolicy): boolean {
    const { licence, confidence, domain, isEditorial } = input;
    if (isEditorial || licence === 'editorial' || licence === 'stock_licensed') return false;
    if (confidence < AUTO_APPROVE_CONFIDENCE) return false;
    if (licence !== 'unknown' || policy === 'open') return true;
    return policy === 'B' && confidence >= POLICY_B_CONFIDENCE && (domain === 'brand' || domain === 'retailer');
}
