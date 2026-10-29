'use client';

import * as React from 'react';
import type { PublicHub } from '@/lib/fulfillment';

/**
 * Europe map of verified Ali FMCG hubs. Leaflet is loaded from cdnjs on
 * demand (no bundle cost) with OpenStreetMap tiles. Only hubs the server
 * returns — verified and active — are plotted; nothing else is drawn.
 */
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
let loading: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if ((window as any).L) return Promise.resolve((window as any).L);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = `${LEAFLET}/leaflet.min.css`; css.crossOrigin = '';
        document.head.appendChild(css);
        const js = document.createElement('script');
        js.src = `${LEAFLET}/leaflet.min.js`; js.async = true; js.crossOrigin = '';
        js.onload = () => resolve((window as any).L);
        js.onerror = () => { loading = null; reject(new Error('Map library failed to load')); };
        document.head.appendChild(js);
    });
    return loading;
}

const PIN = (on: boolean) => `
<span style="display:block;width:34px;height:34px;transform:translate(-17px,-34px)">
  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
    <path d="M17 2c-6.1 0-11 4.8-11 10.8 0 8 11 19.2 11 19.2s11-11.2 11-19.2C28 6.8 23.1 2 17 2z" fill="${on ? '#0B1F3A' : '#2EC4B6'}" stroke="#fff" stroke-width="2"/>
    <rect x="11.5" y="8" width="11" height="9" rx="1.5" fill="${on ? '#7FE3D9' : '#0B1F3A'}"/>
    <path d="M11.5 11.5h11" stroke="${on ? '#0B1F3A' : '#2EC4B6'}" stroke-width="1.4"/>
  </svg>
</span>`;

export function HubMap({ hubs, selected, onSelect, className }: { hubs: PublicHub[]; selected: string | null; onSelect: (id: string) => void; className?: string }) {
    const el = React.useRef<HTMLDivElement>(null);
    const map = React.useRef<any>(null);
    const markers = React.useRef<Map<string, any>>(new Map());
    const [failed, setFailed] = React.useState(false);
    const [ready, setReady] = React.useState(false);

    React.useEffect(() => {
        let gone = false;
        loadLeaflet().then((L) => {
            if (gone || !el.current || map.current) return;
            const m = L.map(el.current, { center: [51, 12], zoom: 4, minZoom: 3, maxZoom: 12, scrollWheelZoom: false, maxBounds: [[30, -32], [73, 50]], worldCopyJump: false });
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
                maxZoom: 19,
                className: 'atl-tiles',
            }).addTo(m);
            map.current = m;
            setReady(true);
            setTimeout(() => m.invalidateSize(), 50);
        }).catch(() => !gone && setFailed(true));
        return () => { gone = true; if (map.current) { map.current.remove(); map.current = null; markers.current.clear(); } };
    }, []);

    // Markers follow the hub list and the selection.
    React.useEffect(() => {
        const L = (window as any).L;
        const m = map.current;
        if (!ready || !L || !m) return;
        markers.current.forEach((mk) => mk.remove());
        markers.current.clear();
        for (const h of hubs) {
            const mk = L.marker([h.latitude, h.longitude], {
                icon: L.divIcon({ html: PIN(selected === h.id), className: 'atl-pin', iconSize: [0, 0] }),
                title: `${h.name}, ${h.city}`, alt: `${h.name}, ${h.city}`, keyboard: true, riseOnHover: true,
            }).addTo(m);
            mk.on('click', () => onSelect(h.id));
            markers.current.set(h.id, mk);
        }
    }, [hubs, selected, onSelect, ready]);

    // Frame the hubs once per list (not on every selection).
    React.useEffect(() => {
        const m = map.current;
        if (!ready || !m) return;
        if (hubs.length > 1) m.fitBounds(hubs.map((h) => [h.latitude, h.longitude]), { padding: [60, 60], maxZoom: 6 });
        else if (hubs.length === 1) m.setView([hubs[0].latitude, hubs[0].longitude], 6);
    }, [hubs, ready]);

    return (
        <div className={className}>
            <style>{'.atl-tiles{filter:grayscale(1) contrast(.9) brightness(1.06)} .atl-pin{background:none;border:0} .leaflet-container{font:inherit;background:#EEF2F5}'}</style>
            <div ref={el} className="w-full h-full" role="region" aria-label="Map of verified Ali FMCG hubs in Europe" />
            {failed && <div className="absolute inset-0 flex items-center justify-center bg-[#EEF2F5] text-[14px] text-ink-3 p-6 text-center">The map couldn’t load. The hub list below has the same information.</div>}
        </div>
    );
}
