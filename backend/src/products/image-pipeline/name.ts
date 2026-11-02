/**
 * Supplier names carry article codes, prices, units and the brand twice, in
 * German, Romanian, Dutch or English. This keeps the original-language name and
 * an English rendering, and pulls out what identifies the product.
 */
export interface CleanName {
    original: string;
    /** Original language, noise removed. */
    clean: string;
    /** Same, with common pack words translated. Equal to `clean` when nothing needed translating. */
    english: string;
    brand: string;
    /** "500 ml", "4 x 500 ml", "39 pieces", "size 4 39 pieces". */
    size: string;
    /** What tells this product from its siblings: "active baby", "pants", "aussie lemonade". */
    variant: string[];
}

const WORDS: Record<string, string> = {
    windeln: 'diapers', scutece: 'diapers', luiers: 'diapers', couches: 'diapers', pannolini: 'diapers', bleier: 'diapers', blöjor: 'diapers',
    größe: 'size', groesse: 'size', marimea: 'size', mărimea: 'size', maat: 'size', taille: 'size', taglia: 'size',
    stück: 'pieces', stueck: 'pieces', stk: 'pieces', st: 'pieces', stuks: 'pieces', bucati: 'pieces', bucăți: 'pieces', buc: 'pieces', pcs: 'pieces', pieces: 'pieces', pc: 'pieces',
    schokolade: 'chocolate', ciocolata: 'chocolate', ciocolată: 'chocolate', chocolade: 'chocolate', zitrone: 'lemon', erdbeere: 'strawberry',
    waschmittel: 'detergent', spülmittel: 'dish soap', geschirrspülmittel: 'dish soap', detergent: 'detergent', shampoo: 'shampoo', duschgel: 'shower gel',
    kaffee: 'coffee', cafea: 'coffee', koffie: 'coffee', wasser: 'water', apa: 'water', saft: 'juice', suc: 'juice', sap: 'juice', dose: 'can', flasche: 'bottle', sticla: 'bottle',
    für: 'for', pentru: 'for', voor: 'for', herren: 'men', damen: 'women', männer: 'men', frauen: 'women', barbati: 'men', femei: 'women',
};
/** Words that describe the listing, not the product. */
const NOISE = /\b(uvp|ek|vk|neu|new|nou|nieuw|angebot|aktion|promo|sale|ean|gtin|art(ikel)?\.?\s*-?\s*nr\.?|item\s*no\.?|sku|ref\.?)\b\.?:?/gi;
/** Pack words: they say what kind of thing it is, so they never tell two siblings apart. */
const GENERIC = new Set([...Object.values(WORDS), ...Object.keys(WORDS), 'x', 'pack', 'packung', 'set', 'box', 'karton', 'case', 'tray', 'ca', 'of', 'the', 'and', 'with', 'mit', 'cu', 'met', 'und', 'si', 'și', 'en', 'de', 'der', 'die', 'das', 'la']);
const UNIT = '(kg|g|gr|mg|l|ltr|cl|ml|oz|fl\\.?\\s*oz)';

const squash = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,.;:/|-]+|[\s,.;:/|-]+$/g, '').trim();
const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

/** "33 cl" and "0,33L" stay comparable: a dot for decimals and "g" not "gr". */
function unit(value: string, name: string) {
    const u = name.toLowerCase().replace(/\s/g, '').replace(/\.$/, '');
    return `${value.replace(',', '.')} ${u === 'gr' ? 'g' : u === 'ltr' ? 'l' : u}`;
}

function sizeOf(text: string): { size: string; rest: string } {
    let rest = text;
    const parts: string[] = [];
    // A "Gr." with a small bare number is a German clothing or nappy size ("Gr. 4"), not grams.
    const clothing = rest.match(/\b(?:gr\.?|größe|groesse|marimea|mărimea|maat|taille|size)\s*(\d{1,2}(?:\s*[-+/]\s*\d{1,2})?\+?)(?![\d.,]*\s*(?:kg|g|gr|ml|l)\b)/i);
    if (clothing) { parts.push(`size ${clothing[1].replace(/\s/g, '')}`); rest = rest.replace(clothing[0], ' '); }
    const multi = rest.match(new RegExp(`\\b(\\d{1,3})\\s*[x×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}\\b\\.?`, 'i'));
    const after = rest.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*${UNIT}\\s*[x×*]\\s*(\\d{1,3})\\b`, 'i'));
    const single = rest.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*${UNIT}\\b\\.?`, 'i'));
    if (multi) { parts.push(`${multi[1]} x ${unit(multi[2], multi[3])}`); rest = rest.replace(multi[0], ' '); }
    else if (after) { parts.push(`${after[3]} x ${unit(after[1], after[2])}`); rest = rest.replace(after[0], ' '); }
    else if (single) { parts.push(unit(single[1], single[2])); rest = rest.replace(single[0], ' '); }
    const count = rest.match(/\b(\d{1,4})\s*(?:stk|stück|stueck|stuks|st|pcs|pieces|pc|buc|bucati|bucăți|tablets|tabs|pods|caps|wipes)\b\.?/i);
    if (count) { parts.push(`${count[1]} pieces`); rest = rest.replace(count[0], ' '); }
    return { size: parts.join(' '), rest };
}

export function cleanName(raw: string | null | undefined, brandRaw?: string | null): CleanName {
    const original = String(raw ?? '').trim();
    const brand = squash(String(brandRaw ?? ''));
    let text = original
        .replace(/[€$£]\s*\d+(?:[.,]\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\s*(?:€|eur|usd|ron|lei)\b/gi, ' ')
        .replace(NOISE, ' ')
        // Article codes: a code at the start, or any long digit run.
        .replace(/^\s*(?:[A-Z]{0,3}[-/]?\d{4,}[A-Z]?)\b[\s:.-]*/, ' ')
        .replace(/\b\d{5,}\b/g, ' ');
    const { size, rest } = sizeOf(text);
    text = rest;
    // The brand once, at the front.
    if (brand) text = text.replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
    const seen = new Set<string>();
    const tokens = squash(text.replace(/[()[\]{}]/g, ' ').replace(/\s[-–|/]\s/g, ' ')).split(/\s+/).filter((t) => {
        const k = t.toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    const body = tokens.join(' ');
    const english = tokens.map((t) => WORDS[t.toLowerCase().replace(/\.$/, '')] ?? t).join(' ');
    const join = (b: string) => squash([brand, b].filter(Boolean).join(' '));
    const variant = words(english).filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w) && !words(brand).includes(w));
    return { original, clean: join(body), english: join(english), brand, size, variant };
}
