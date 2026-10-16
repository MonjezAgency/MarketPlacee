/**
 * Country outlines for the hub maps. d3-geo, topojson-client and Natural
 * Earth (world-atlas, public domain) are loaded from jsDelivr on demand, at
 * pinned versions, so they cost nothing in the main bundle.
 */
const CDN = 'https://cdn.jsdelivr.net/npm';
const SCRIPTS = [`${CDN}/d3-array@3.2.4/dist/d3-array.min.js`, `${CDN}/d3-geo@3.1.1/dist/d3-geo.min.js`, `${CDN}/topojson-client@3.1.0/dist/topojson-client.min.js`];
const WORLD = `${CDN}/world-atlas@2.0.2/countries-50m.json`;

export interface GeoKit { d3: any; countries: any[] }
let pending: Promise<GeoKit> | null = null;

function script(src: string) {
    return new Promise<void>((resolve, reject) => {
        if (document.querySelector(`script[data-geo="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src; s.async = false; s.crossOrigin = 'anonymous'; s.dataset.geo = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Map data failed to load'));
        document.head.appendChild(s);
    });
}

export function loadGeo(): Promise<GeoKit> {
    if (pending) return pending;
    pending = (async () => {
        for (const src of SCRIPTS) await script(src);
        const res = await fetch(WORLD);
        if (!res.ok) throw new Error('Map data failed to load');
        const topo = await res.json();
        const w = window as any;
        const countries = w.topojson.feature(topo, topo.objects.countries).features;
        return { d3: w.d3, countries };
    })();
    pending.catch(() => { pending = null; });
    return pending;
}

/** ISO 3166-1 alpha-2 → numeric (the ids in world-atlas), for the countries on the two maps. */
export const ISO_NUMERIC: Record<string, string> = {
    AL: '008', AD: '020', AT: '040', BY: '112', BE: '056', BA: '070', BG: '100', HR: '191', CY: '196', CZ: '203', DK: '208', EE: '233',
    FI: '246', FR: '250', DE: '276', GR: '300', HU: '348', IS: '352', IE: '372', IT: '380', LV: '428', LI: '438', LT: '440', LU: '442',
    MT: '470', MD: '498', MC: '492', ME: '499', NL: '528', MK: '807', NO: '578', PL: '616', PT: '620', RO: '642', RU: '643', SM: '674',
    RS: '688', SK: '703', SI: '705', ES: '724', SE: '752', CH: '756', UA: '804', GB: '826', TR: '792', VA: '336',
    US: '840', CA: '124', MX: '484', GT: '320', BZ: '084', SV: '222', HN: '340', NI: '558', CR: '188', PA: '591', CU: '192', JM: '388',
    HT: '332', DO: '214', PR: '630', BS: '044', TT: '780', CO: '170', VE: '862', GY: '328', SR: '740', EC: '218', PE: '604', BR: '076',
    BO: '068', PY: '600', CL: '152', AR: '032', UY: '858', GL: '304',
};

export const REGIONS = {
    europe: { label: 'Europe', bbox: [[-25, 34], [45, 71.5]] as [[number, number], [number, number]], rotate: [-10, 0, 0] as [number, number, number], projection: 'conic' as const },
    americas: { label: 'The Americas', bbox: [[-140, -56], [-34, 70]] as [[number, number], [number, number]], rotate: [85, 0, 0] as [number, number, number], projection: 'natural' as const },
};
export type RegionKey = keyof typeof REGIONS;
