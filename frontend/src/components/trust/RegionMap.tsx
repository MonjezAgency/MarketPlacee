'use client';

import * as React from 'react';
import { CalendarClock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ISO_NUMERIC, REGIONS, loadGeo, type GeoKit, type RegionKey } from '@/lib/geo';
import type { PublicHub } from '@/lib/fulfillment';

const SIZE: Record<RegionKey, { w: number; h: number }> = { europe: { w: 640, h: 520 }, americas: { w: 460, h: 520 } };

function useGeo() {
    const [kit, setKit] = React.useState<GeoKit | null>(null);
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => {
        let live = true;
        loadGeo().then((k) => live && setKit(k)).catch(() => live && setFailed(true));
        return () => { live = false; };
    }, []);
    return { kit, failed };
}

/**
 * Outline map of one region with verified hubs as buttons. Delivery countries
 * (a service area, not warehouses) are tinted. Nothing else is plotted.
 */
export function RegionMap({ region, hubs, deliveryCodes, selected, onSelect, loading }: {
    region: RegionKey; hubs: PublicHub[]; deliveryCodes: Set<string>; selected: string | null; onSelect: (id: string) => void; loading: boolean;
}) {
    const { kit, failed } = useGeo();
    const { w, h } = SIZE[region];
    const cfg = REGIONS[region];

    const drawn = React.useMemo(() => {
        if (!kit) return null;
        const { d3, countries } = kit;
        const [[x0, y0], [x1, y1]] = cfg.bbox;
        const grid: [number, number][] = [];
        for (let x = x0; x <= x1; x += 5) for (let y = y0; y <= y1; y += 5) grid.push([x, y]);
        const projection = (cfg.projection === 'conic' ? d3.geoConicConformal().parallels([40, 65]) : d3.geoNaturalEarth1())
            .rotate(cfg.rotate)
            .fitExtent([[12, 12], [w - 12, h - 12]], { type: 'MultiPoint', coordinates: grid })
            .clipExtent([[0, 0], [w, h]]);
        const path = d3.geoPath(projection);
        const delivery = new Set(Array.from(deliveryCodes).map((c) => ISO_NUMERIC[c]).filter(Boolean));
        const shapes = countries.map((f: any) => ({ id: f.id, name: f.properties?.name, d: path(f) as string | null, delivery: delivery.has(f.id) })).filter((s: any) => s.d);
        const graticule = path(d3.geoGraticule().step([10, 10])());
        const project = (lng: number, lat: number) => projection([lng, lat]) as [number, number] | null;
        return { shapes, graticule, project };
    }, [kit, deliveryCodes, cfg, w, h]);

    const placed = drawn ? hubs.map((hub) => ({ hub, at: drawn.project(hub.longitude, hub.latitude) })).filter((p) => p.at && p.at[0] >= 0 && p.at[0] <= w && p.at[1] >= 0 && p.at[1] <= h) : [];

    return (
        <figure className="flex flex-col">
            <figcaption className="flex items-baseline justify-between gap-3 mb-3">
                <span className="text-subtitle text-heading">{cfg.label}</span>
                <span className="text-small text-ink-3">{loading ? 'Loading…' : hubs.length ? `${hubs.length} verified hub${hubs.length === 1 ? '' : 's'}` : 'No verified hub yet'}</span>
            </figcaption>
            <div className="relative rounded-3xl ring-1 ring-line bg-surface-2 overflow-hidden" style={{ aspectRatio: `${w} / ${h}` }}>
                {drawn ? (
                    <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full" role="img" aria-label={`Outline map of ${cfg.label}${hubs.length ? ` with ${hubs.length} verified Atlantis hub${hubs.length === 1 ? '' : 's'}` : ''}`}>
                        <path d={drawn.graticule || ''} fill="none" style={{ stroke: 'rgb(var(--atl-line-strong) / 0.7)' }} strokeWidth={0.6} strokeDasharray="1 4" />
                        {drawn.shapes.map((s: any) => (
                            <path key={s.id || s.name} d={s.d} strokeWidth={0.6} strokeLinejoin="round"
                                style={{ fill: s.delivery ? 'rgb(var(--atl-teal-soft))' : 'rgb(var(--atl-surface))', stroke: s.delivery ? 'rgb(var(--atl-teal) / 0.4)' : 'rgb(var(--atl-line-strong))' }} />
                        ))}
                    </svg>
                ) : !failed ? (
                    <div className="absolute inset-0 animate-pulse bg-surface-3/60" aria-hidden />
                ) : null}

                {placed.map(({ hub, at }) => {
                    const on = selected === hub.id;
                    return (
                        <button key={hub.id} type="button" onClick={() => onSelect(hub.id)} aria-pressed={on}
                            aria-label={`${hub.name}, ${hub.city}, ${hub.countryName} — show details`}
                            className="group absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]"
                            style={{ left: `${(at![0] / w) * 100}%`, top: `${(at![1] / h) * 100}%` }}>
                            <span aria-hidden className={cn('absolute w-5 h-5 rounded-full', on ? 'bg-heading/30' : 'bg-[#2EC4B6]/40', 'animate-atl-pulse-ring')} />
                            <span aria-hidden className={cn('relative w-4 h-4 rounded-full ring-[3px] ring-white shadow-float transition-colors duration-150', on ? 'bg-heading' : 'bg-[#2EC4B6] group-hover:bg-teal')} />
                            <span className={cn('pointer-events-none absolute top-full mt-0.5 whitespace-nowrap rounded-md bg-heading px-2 py-1 text-small font-medium text-white shadow-float transition-opacity duration-150', on ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100')}>{hub.city}</span>
                        </button>
                    );
                })}

                {failed && (
                    <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                        <p className="flex items-center gap-2 text-small text-ink-3"><AlertCircle size={15} /> The map couldn’t load. Hub details are listed below.</p>
                    </div>
                )}
                {!loading && hubs.length === 0 && !failed && (
                    <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4 sm:p-6 pointer-events-none">
                        <div className="pointer-events-auto max-w-[19rem] rounded-2xl bg-surface/95 backdrop-blur ring-1 ring-line shadow-float p-5 text-center">
                            <span className="mx-auto w-10 h-10 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><CalendarClock size={18} aria-hidden /></span>
                            <p className="mt-3 text-[15px] font-semibold text-heading">No verified hub in {cfg.label === 'The Americas' ? 'the Americas' : cfg.label} yet</p>
                            <p className="mt-1 text-small text-ink-2">Hubs appear here only after Atlantis has verified the location and its services.</p>
                        </div>
                    </div>
                )}
            </div>
        </figure>
    );
}
