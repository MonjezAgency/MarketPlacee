'use client';

import * as React from 'react';
import Link from 'next/link';
import { Warehouse, MapPin, Factory, Globe2, ShieldCheck, X, Loader2, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Faq, PrimaryLink, SecondaryLink, SectionHead, TrustCta, TrustHero, TrustNav } from '@/components/trust/TrustBlocks';
import { HubMap } from '@/components/trust/HubMap';
import { HUB_SERVICE_LABEL, getPublicHubs, type PublicHub } from '@/lib/fulfillment';

/**
 * Atlantis hubs — only hubs Atlantis has verified (server-side flag with
 * who/when) are listed or plotted. With none verified the page says so.
 */
export default function WarehousesClient() {
    const [data, setData] = React.useState<{ hubs: PublicHub[]; deliveryCountries: { code: string; name: string }[] } | null>(null);
    const [error, setError] = React.useState(false);
    const [selected, setSelected] = React.useState<string | null>(null);
    React.useEffect(() => { getPublicHubs().then(setData).catch(() => setError(true)); }, []);
    const hubs = data?.hubs ?? [];
    const hub = hubs.find((h) => h.id === selected) || null;
    const onSelect = React.useCallback((id: string) => setSelected(id), []);

    return (
        <main className="min-h-screen bg-surface text-start">
            <TrustHero eyebrow="Warehouses" title="Atlantis hubs in Europe"
                lead="Verified Atlantis hubs where goods can be received, consolidated or inspected before delivery. Only locations Atlantis has verified appear here.">
                <PrimaryLink href="/contact">Ask about hub delivery</PrimaryLink>
                <SecondaryLink href="/goods-inspection">Goods inspection</SecondaryLink>
            </TrustHero>

            <section aria-labelledby="map-heading" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
                <h2 id="map-heading" className="sr-only">Hub map</h2>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="relative isolate z-0 h-[420px] sm:h-[520px] rounded-3xl overflow-hidden ring-1 ring-line">
                        <HubMap hubs={hubs} selected={selected} onSelect={onSelect} className="absolute inset-0" />
                        {data && hubs.length === 0 && (
                            <div className="absolute inset-0 z-[500] flex items-center justify-center p-6 pointer-events-none">
                                <div className="pointer-events-auto max-w-sm rounded-2xl bg-surface/95 backdrop-blur ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.12)] p-6 text-center">
                                    <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><CalendarClock size={22} /></span>
                                    <p className="mt-4 text-[17px] font-semibold text-heading">Hubs coming soon</p>
                                    <p className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">Atlantis hasn’t opened a verified hub yet. Orders are collected from the supplier’s dispatch location and delivered to you. Hubs will appear on this map once they are verified.</p>
                                </div>
                            </div>
                        )}
                        {!data && !error && <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none"><Loader2 className="animate-spin text-ink-3" /></div>}
                    </div>

                    <aside aria-label="Hub details" className="rounded-3xl ring-1 ring-line p-5 sm:p-6 self-start">
                        {hub ? (
                            <div>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-teal"><ShieldCheck size={14} /> Verified Atlantis hub</p>
                                        <h3 className="mt-1 text-[19px] font-semibold text-heading">{hub.name}</h3>
                                        <p className="text-[14px] text-ink-2">{hub.city}, {hub.countryName}</p>
                                    </div>
                                    <button type="button" onClick={() => setSelected(null)} aria-label="Close hub details" className="w-9 h-9 rounded-xl flex items-center justify-center text-ink-3 hover:bg-surface-2"><X size={16} /></button>
                                </div>
                                {hub.address && <p className="mt-3 flex gap-2 text-[14px] text-ink-2"><MapPin size={16} className="text-teal shrink-0 mt-0.5" /> {hub.address}</p>}
                                {hub.services.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-[12.5px] font-semibold text-ink-3 uppercase tracking-[0.1em]">Services at this hub</p>
                                        <ul className="mt-2 flex flex-wrap gap-1.5">{hub.services.map((s) => <li key={s} className="px-2.5 py-1 rounded-full bg-teal-soft text-teal text-[12.5px] font-semibold">{HUB_SERVICE_LABEL[s] || s}</li>)}</ul>
                                    </div>
                                )}
                                {hub.verifiedAt && <p className="mt-4 text-[12.5px] text-ink-3">Verified {new Date(hub.verifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
                            </div>
                        ) : hubs.length ? (
                            <div>
                                <p className="text-[15px] font-semibold text-heading">{hubs.length} verified hub{hubs.length === 1 ? '' : 's'}</p>
                                <p className="text-[13.5px] text-ink-3">Select a marker or a hub below.</p>
                                <ul className="mt-3 space-y-1.5">
                                    {hubs.map((h) => (
                                        <li key={h.id}><button type="button" onClick={() => setSelected(h.id)} className="w-full text-start rounded-xl ring-1 ring-line px-3 py-2.5 hover:ring-[#2EC4B6]">
                                            <span className="block text-[14px] font-semibold text-ink">{h.name}</span>
                                            <span className="block text-[12.5px] text-ink-3">{h.city}, {h.countryName}</span>
                                        </button></li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div>
                                <p className="text-[15px] font-semibold text-heading">No verified hubs yet</p>
                                <p className="mt-1 text-[13.5px] text-ink-2 leading-relaxed">{error ? 'We couldn’t load hub information right now. Please try again later.' : 'When Atlantis verifies a hub, its location, address and services are shown here.'}</p>
                            </div>
                        )}

                        <div className="mt-6 border-t border-line pt-4 space-y-2.5 text-[13px]">
                            <p className="font-semibold text-ink">Map key</p>
                            <p className="flex items-center gap-2 text-ink-2"><span className="w-3 h-3 rounded-full bg-[#2EC4B6] ring-2 ring-white shadow" /> Verified Atlantis hub</p>
                            <p className="text-ink-3">Supplier dispatch locations and delivery countries aren’t plotted — they aren’t Atlantis warehouses.</p>
                        </div>
                    </aside>
                </div>
            </section>

            <section aria-labelledby="types" className="bg-[#F6F8FA]">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
                    <SectionHead id="types" eyebrow="Know the difference" title="Hubs, supplier locations and delivery areas" lead="Three different things that are easy to mix up." />
                    <div className="mt-10 grid gap-4 md:grid-cols-3">
                        {[
                            { icon: Warehouse, t: 'Atlantis hub', d: 'A location Atlantis has verified for receiving goods — with the services listed for it (for example consolidation or inspection). Shown on the map.' },
                            { icon: Factory, t: 'Supplier dispatch location', d: 'Where a supplier’s goods leave from — the EXW location on each product page. It belongs to the supplier, not Atlantis.' },
                            { icon: Globe2, t: 'Delivery area', d: 'Countries Atlantis delivers to. Delivering to a country doesn’t mean there is a warehouse there.' },
                        ].map((c) => (
                            <div key={c.t} className="rounded-2xl bg-surface ring-1 ring-line p-5 sm:p-6">
                                <span className="w-11 h-11 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><c.icon size={20} /></span>
                                <h3 className="font-sans mt-4 text-[16px] font-bold text-heading">{c.t}</h3>
                                <p className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">{c.d}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 rounded-2xl bg-surface ring-1 ring-line p-5 sm:p-6">
                        <p className="text-[15px] font-semibold text-heading">Where Atlantis delivers</p>
                        {data?.deliveryCountries?.length ? (
                            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Delivery countries">
                                {data.deliveryCountries.map((c) => <li key={c.code} className="px-2.5 py-1 rounded-full ring-1 ring-line text-[13px] text-ink-2">{c.name}</li>)}
                            </ul>
                        ) : (
                            <p className="mt-2 text-[14px] text-ink-3">{data ? 'The delivery country list is being updated — you can check any country at checkout.' : 'Loading…'}</p>
                        )}
                        <p className="mt-3 text-[13px] text-ink-3">Your delivery country is checked at checkout. See the <Link href="/shipping" className="text-teal font-medium hover:underline">shipping policy</Link>.</p>
                    </div>
                </div>
            </section>

            <section aria-labelledby="faq" className="px-4 sm:px-6 py-14 sm:py-20">
                <SectionHead id="faq" title="Questions about hubs" />
                <div className="mt-8">
                    <Faq items={[
                        { q: 'Does my order go through a hub?', a: 'Only if the supplier’s delivery method uses one. Your order page shows the delivery method — “Atlantis arranges collection” goes straight from the supplier’s dispatch location to you.' },
                        { q: 'Why is a location missing?', a: 'Only hubs Atlantis has verified are shown. Supplier warehouses and partner sites that aren’t verified Atlantis hubs are never listed as Atlantis warehouses.' },
                        { q: 'Can I collect goods from a hub?', a: 'Only where a hub lists collection as a service. Ask the team before you order.' },
                        { q: 'Can a supplier deliver to a hub?', a: <>Yes, once a verified hub exists. Suppliers choose this in <strong>Shipping &amp; Fulfilment</strong>; their net price stays the same and their freight to the hub is shown separately.</> },
                        { q: 'Can goods be inspected at a hub?', a: <>Where a hub lists inspection as a service. See <Link href="/goods-inspection" className="text-teal font-medium hover:underline">Goods Inspection</Link>.</> },
                    ]} />
                </div>
            </section>

            <TrustCta title="Planning a regular lane?" lead="Tell us your origin and delivery countries — we’ll tell you honestly what Atlantis can handle today.">
                <PrimaryLink href="/contact">Contact the team</PrimaryLink>
                <SecondaryLink href="/protected-payments">How orders are confirmed</SecondaryLink>
            </TrustCta>
            <TrustNav current="warehouses" />
        </main>
    );
}
