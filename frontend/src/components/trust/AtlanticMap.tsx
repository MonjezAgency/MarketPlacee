'use client';

import * as React from 'react';
import { AlertCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ISO_NUMERIC, loadGeo, type GeoKit } from '@/lib/geo';

/**
 * One continuous map: North America on the left, the Atlantic in the middle,
 * Europe and the UK on the right (framed like a zoom-3 web map centred on the
 * North Atlantic). Natural Earth outlines, Web-Mercator projection.
 *
 * Points come from data only. `preview` points are design samples and are
 * always drawn and labelled as such — never as real facilities.
 */
export type MapPoint = {
    id: string; lng: number; lat: number; label: string; sub?: string;
    kind: 'hub' | 'preview';
};
export type MapRoute = { id: string; from: [number, number]; to: [number, number]; kind: 'route' | 'preview' };
export type Focus = 'all' | 'americas' | 'europe';

const W = 1600, H = 900;
// Geographic frames (lng/lat boxes) for the three views.
const CENTER: [number, number] = [-31.8, 56.8];
const SPAN_LNG = 216;
const FRAMES: Record<Exclude<Focus, 'all'>, [[number, number], [number, number]]> = {
    americas: [[-128, 16], [-52, 64]],
    europe: [[-12, 35], [35, 66]],
};
/** Target markets (business context, not coverage): Europe incl. the UK, and North America. */
const TARGET = ['AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA', 'US', 'CA', 'MX'];

type VB = { x: number; y: number; w: number; h: number };
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function AtlanticMap({ points, routes = [], focus, selected, onSelect, loading, failed: dataFailed, className }: {
    points: MapPoint[]; routes?: MapRoute[]; focus: Focus; selected: string | null; onSelect: (id: string | null) => void;
    loading?: boolean; failed?: boolean; className?: string;
}) {
    const [kit, setKit] = React.useState<GeoKit | null>(null);
    const [geoFailed, setGeoFailed] = React.useState(false);
    React.useEffect(() => { let live = true; loadGeo().then((k) => live && setKit(k)).catch(() => live && setGeoFailed(true)); return () => { live = false; }; }, []);

    // Phones get a taller frame (more latitude, same centre) so the map stays legible.
    const [aspect, setAspect] = React.useState(W / H);
    React.useEffect(() => {
        const mq = window.matchMedia('(max-width: 639px)');
        const apply = () => setAspect(mq.matches ? 1.3 : W / H);
        apply(); mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    // One projection; every view is a viewBox crop of the same drawing.
    const geo = React.useMemo(() => {
        if (!kit) return null;
        const { d3, countries } = kit;
        // Same framing as the reference web map: Web Mercator centred on the North
        // Atlantic (56.8°N, 31.8°W), ~216° of longitude across the width.
        const projection = d3.geoMercator().center(CENTER).scale(W / (SPAN_LNG * Math.PI / 180)).translate([W / 2, H / 2]);
        const path = d3.geoPath(projection);
        const target = new Set(TARGET.map((c) => ISO_NUMERIC[c]).filter(Boolean));
        const shapes = countries.map((f: any) => ({ id: String(f.id ?? f.properties?.name), d: path(f) as string, target: target.has(f.id) })).filter((s: any) => s.d);
        const graticule = path(d3.geoGraticule().step([15, 10])()) as string;
        const project = (lng: number, lat: number) => projection([lng, lat]) as [number, number];
        const frame = (f: Focus): VB => {
            if (f === 'all') { const h = W / aspect; return { x: 0, y: (H - h) / 2, w: W, h }; }
            const [[x0, y0], [x1, y1]] = FRAMES[f as Exclude<Focus, 'all'>];
            const a = project(x0, y1), b = project(x1, y0);
            let w = b[0] - a[0], h = b[1] - a[1];
            // keep the map's aspect ratio
            if (w / h > aspect) { const nh = w / aspect; return { x: a[0], y: a[1] - (nh - h) / 2, w, h: nh }; }
            const nw = h * aspect; return { x: a[0] - (nw - w) / 2, y: a[1], w: nw, h };
        };
        const arc = (from: [number, number], to: [number, number]) => {
            const p = project(...from), q = project(...to);
            const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2 - Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.18;
            return `M${p[0]},${p[1]} Q${mx},${my} ${q[0]},${q[1]}`;
        };
        return { shapes, graticule, project, frame, arc };
    }, [kit, aspect]);

    // Animated viewBox between focus frames.
    const [vb, setVb] = React.useState<VB>({ x: 0, y: 0, w: W, h: H });
    const vbRef = React.useRef(vb);
    vbRef.current = vb;
    React.useEffect(() => {
        if (!geo) return;
        const to = geo.frame(focus), from = vbRef.current;
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { setVb(to); return; }
        let raf = 0; const start = performance.now(), dur = 700;
        const step = (now: number) => {
            const t = ease(Math.min(1, (now - start) / dur));
            setVb({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, w: from.w + (to.w - from.w) * t, h: from.h + (to.h - from.h) * t });
            if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [focus, geo]);

    const scale = W / vb.w; // >1 when zoomed in
    const pos = (lng: number, lat: number) => {
        const [x, y] = geo!.project(lng, lat);
        return { left: `${((x - vb.x) / vb.w) * 100}%`, top: `${((y - vb.y) / vb.h) * 100}%`, inside: x >= vb.x && x <= vb.x + vb.w && y >= vb.y && y <= vb.y + vb.h };
    };
    const failed = geoFailed || dataFailed;

    return (
        <div className={cn('relative overflow-hidden bg-surface', className)} style={{ aspectRatio: String(aspect) }}>
            {geo ? (
                <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="absolute inset-0 w-full h-full" role="img"
                    aria-label="Map of North America, the North Atlantic and Europe">
                    <path d={geo.graticule} fill="none" style={{ stroke: 'rgb(var(--atl-line-strong) / 0.55)' }} strokeWidth={0.8 / scale} strokeDasharray={`${1 / scale} ${6 / scale}`} strokeLinecap="round" />
                    {geo.shapes.map((s: any) => (
                        <path key={s.id} d={s.d} strokeLinejoin="round" strokeWidth={0.7 / scale}
                            style={{ fill: s.target ? 'rgb(var(--atl-teal-soft) / 0.75)' : 'rgb(var(--atl-surface))', stroke: s.target ? 'rgb(var(--atl-teal) / 0.32)' : 'rgb(var(--atl-line-strong) / 0.9)' }} />
                    ))}
                    {routes.map((r) => (
                        <path key={r.id} d={geo.arc(r.from, r.to)} fill="none" strokeLinecap="round"
                            className={r.kind === 'preview' ? 'atl-route-flow' : undefined}
                            style={{ stroke: r.kind === 'preview' ? 'rgb(var(--atl-ink-3))' : 'rgb(var(--atl-teal))' }}
                            strokeWidth={1.4 / scale} strokeDasharray={`${2 / scale} ${6 / scale}`} />
                    ))}
                </svg>
            ) : !failed ? <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden /> : null}

            {geo && points.map((p) => {
                const at = pos(p.lng, p.lat);
                if (!at.inside) return null;
                const on = selected === p.id;
                const preview = p.kind === 'preview';
                return (
                    <button key={p.id} type="button" onClick={() => onSelect(on ? null : p.id)} aria-pressed={on}
                        aria-label={`${preview ? 'Design preview marker, not a real location: ' : ''}${p.label}${p.sub ? `, ${p.sub}` : ''}`}
                        className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]"
                        style={{ left: at.left, top: at.top }}>
                        {!preview && <span aria-hidden className="absolute w-5 h-5 rounded-full bg-[#2EC4B6]/40 animate-atl-pulse-ring" />}
                        <span aria-hidden className={cn('relative rounded-full transition-all duration-200',
                            preview ? cn('w-3.5 h-3.5 border-2 border-dashed', on ? 'border-heading bg-surface' : 'border-ink-3 bg-surface')
                                : cn('w-4 h-4 ring-[3px] ring-white shadow-float', on ? 'bg-heading scale-110' : 'bg-[#2EC4B6] group-hover:bg-teal'))} />
                        <span className={cn('pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-start shadow-float ring-1 transition-all duration-200',
                            preview ? 'bg-surface ring-line text-ink' : 'bg-heading ring-heading text-white',
                            on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100')}>
                            <span className="block text-[12.5px] font-semibold leading-tight">{p.label}</span>
                            {p.sub && <span className={cn('block text-[11.5px] leading-tight', preview ? 'text-ink-3' : 'text-white/70')}>{p.sub}</span>}
                        </span>
                    </button>
                );
            })}

            {failed && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                    <p className="flex items-center gap-2 text-small text-ink-3"><AlertCircle size={15} aria-hidden /> The map couldn’t load. Location details are listed below.</p>
                </div>
            )}
            {loading && !failed && <span className="sr-only">Loading map</span>}
            <style>{'@keyframes atl-route-flow{to{stroke-dashoffset:-16}} .atl-route-flow{animation:atl-route-flow 1.2s linear infinite} @media (prefers-reduced-motion: reduce){.atl-route-flow{animation:none}}'}</style>
        </div>
    );
}

export function PreviewBadge() {
    return <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#FFFBEB] ring-1 ring-[#FDE68A] text-small font-semibold text-[#B45309]"><Eye size={13} aria-hidden /> Design preview — sample markers, not real locations</span>;
}
