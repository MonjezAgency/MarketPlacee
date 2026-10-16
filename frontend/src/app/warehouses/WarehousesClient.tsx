'use client';

import * as React from 'react';
import Link from 'next/link';
import { Warehouse, Factory, Globe2, ShieldCheck, X, MapPin } from 'lucide-react';
import { ButtonLink, Container, CtaBand, Eyebrow, Faq, Pill, Reveal, Section, SectionHeader, TrustNav } from '@/components/ds';
import { RegionMap } from '@/components/trust/RegionMap';
import { HUB_SERVICE_LABEL, getPublicHubs, type PublicHub } from '@/lib/fulfillment';

/**
 * Atlantis hubs in Europe and the Americas. Only hubs the server returns —
 * verified (who/when recorded) and active — are plotted. Delivery countries
 * are a service area and are drawn as such, never as warehouses.
 */
export default function WarehousesClient() {
    const [data, setData] = React.useState<{ hubs: PublicHub[]; deliveryCountries: { code: string; name: string }[] } | null>(null);
    const [error, setError] = React.useState(false);
    const [selected, setSelected] = React.useState<string | null>(null);
    const load = React.useCallback(() => { setError(false); getPublicHubs().then(setData).catch(() => setError(true)); }, []);
    React.useEffect(() => { load(); }, [load]);

    const hubs = data?.hubs ?? [];
    const europe = hubs.filter((h) => h.region === 'europe');
    const americas = hubs.filter((h) => h.region === 'americas');
    const delivery = React.useMemo(() => new Set((data?.deliveryCountries ?? []).map((c) => c.code)), [data]);
    const hub = hubs.find((h) => h.id === selected) || null;
    const onSelect = React.useCallback((id: string) => setSelected((s) => (s === id ? null : id)), []);
    const loading = !data && !error;

    return (
        <main className="min-h-screen bg-surface text-start">
            <Section size="lg" className="relative overflow-hidden border-b border-line">
                <div aria-hidden className="absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(var(--atl-line-strong)) 1px, transparent 0)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(ellipse 55% 75% at 50% 35%, #000 25%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse 55% 75% at 50% 35%, #000 25%, transparent 75%)' }} />
                <Container size="prose" className="relative text-center">
                    <Reveal hero>
                        <Eyebrow pill>Warehouses</Eyebrow>
                        <h1 className="mt-6 font-sans text-display-sm sm:text-display text-heading">Where Atlantis handles your goods</h1>
                        <p className="mt-5 text-body sm:text-lead text-ink-2">Verified Atlantis hubs in Europe and the Americas — where goods can be received, consolidated or inspected before they reach you. A location appears only once Atlantis has verified it.</p>
                        <div className="mt-8 flex flex-wrap justify-center gap-3">
                            <ButtonLink href="#hub-maps" arrow={false}>See the maps</ButtonLink>
                            <ButtonLink href="/contact" variant="secondary">Ask about a lane</ButtonLink>
                        </div>
                    </Reveal>
                </Container>
            </Section>

            <Section id="hub-maps" labelledBy="maps-title">
                <Container>
                    <SectionHeader id="maps-title" eyebrow="Hub map" title="Two regions, one standard" lead="Select a hub to see its address and services. Tinted countries are places Atlantis delivers to — a service area, not a warehouse." />
                    <div className="mt-10 sm:mt-12 grid gap-8 lg:gap-6 lg:grid-cols-[1.39fr_1fr]">
                        <Reveal><RegionMap region="europe" hubs={europe} deliveryCodes={delivery} selected={selected} onSelect={onSelect} loading={loading} /></Reveal>
                        <Reveal delay={0.08}><RegionMap region="americas" hubs={americas} deliveryCodes={delivery} selected={selected} onSelect={onSelect} loading={loading} /></Reveal>
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)] items-start">
                        <ul aria-label="Map key" className="flex flex-wrap gap-x-6 gap-y-2 text-small text-ink-2">
                            <li className="flex items-center gap-2"><span aria-hidden className="w-3.5 h-3.5 rounded-full bg-[#2EC4B6] ring-[3px] ring-white shadow-card" /> Verified Atlantis hub</li>
                            <li className="flex items-center gap-2"><span aria-hidden className="w-4 h-3 rounded-sm bg-teal-soft ring-1 ring-teal/40" /> Delivery country (service area)</li>
                            <li className="flex items-center gap-2"><span aria-hidden className="w-4 h-3 rounded-sm bg-surface ring-1 ring-line-strong" /> Other country</li>
                            <li className="text-ink-3">Supplier dispatch locations aren’t plotted — they belong to suppliers, not Atlantis.</li>
                        </ul>
                        <div aria-live="polite">
                            {hub ? (
                                <div className="rounded-2xl ring-1 ring-line bg-surface shadow-card p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <Pill tone="success" icon={<ShieldCheck size={13} aria-hidden />}>Verified Atlantis hub</Pill>
                                            <h3 className="font-sans mt-3 text-subtitle text-heading">{hub.name}</h3>
                                            <p className="text-body text-ink-2">{hub.city}, {hub.countryName}</p>
                                        </div>
                                        <button type="button" onClick={() => setSelected(null)} aria-label="Close hub details" className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]"><X size={16} /></button>
                                    </div>
                                    {hub.address && <p className="mt-3 flex gap-2 text-body text-ink-2"><MapPin size={16} className="text-teal shrink-0 mt-1" aria-hidden /> {hub.address}</p>}
                                    {hub.services.length > 0 && <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Services at this hub">{hub.services.map((s) => <li key={s}><Pill tone="teal">{HUB_SERVICE_LABEL[s] || s}</Pill></li>)}</ul>}
                                    {hub.verifiedAt && <p className="mt-4 text-small text-ink-3">Verified {new Date(hub.verifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                                </div>
                            ) : error ? (
                                <div className="rounded-2xl ring-1 ring-line p-5 text-body text-ink-2">Hub information couldn’t be loaded. <button type="button" onClick={load} className="font-medium text-teal hover:underline">Try again</button></div>
                            ) : hubs.length ? (
                                <ul className="space-y-2" aria-label="Verified hubs">
                                    {hubs.map((h) => (
                                        <li key={h.id}><button type="button" onClick={() => setSelected(h.id)} className="w-full text-start rounded-xl ring-1 ring-line px-4 py-3 hover:ring-[#2EC4B6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                                            <span className="block text-[15px] font-semibold text-heading">{h.name}</span>
                                            <span className="block text-small text-ink-3">{h.city}, {h.countryName}</span>
                                        </button></li>
                                    ))}
                                </ul>
                            ) : data ? (
                                <p className="rounded-2xl ring-1 ring-line p-5 text-body text-ink-2">Atlantis hasn’t opened a verified hub yet. Today, orders are collected from the supplier’s dispatch location and delivered to you.</p>
                            ) : null}
                        </div>
                    </div>
                </Container>
            </Section>

            <Section tone="muted" labelledBy="types-title">
                <Container>
                    <SectionHeader id="types-title" align="center" eyebrow="Know the difference" title="Hubs, supplier locations and delivery areas" lead="Three different things that are easy to mix up — and that we never mix up on this page." />
                    <ul className="mt-10 sm:mt-12 grid gap-4 md:grid-cols-3">
                        {[
                            { icon: Warehouse, t: 'Atlantis hub', d: 'A physical location Atlantis has verified, with the services it actually offers (for example consolidation or inspection). Shown as a marker.', tag: 'On the map' },
                            { icon: Factory, t: 'Supplier dispatch location', d: 'Where a supplier’s goods leave from — the EXW location on each product page. It belongs to the supplier, not Atlantis.', tag: 'On product pages' },
                            { icon: Globe2, t: 'Delivery country', d: 'A country Atlantis delivers to. Delivering somewhere doesn’t mean there is a warehouse there.', tag: 'Tinted on the map' },
                        ].map((c, i) => (
                            <Reveal as="li" key={c.t} delay={i * 0.08} className="rounded-2xl bg-surface ring-1 ring-line p-6">
                                <span className="w-11 h-11 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><c.icon size={20} aria-hidden /></span>
                                <h3 className="font-sans mt-5 text-subtitle text-heading">{c.t}</h3>
                                <p className="mt-2 text-body text-ink-2">{c.d}</p>
                                <p className="mt-4"><Pill>{c.tag}</Pill></p>
                            </Reveal>
                        ))}
                    </ul>
                </Container>
            </Section>

            <Section labelledBy="delivery-title" size="md">
                <Container size="content">
                    <SectionHeader id="delivery-title" eyebrow="Service area" title="Where Atlantis delivers" lead={<>Your delivery country is checked at checkout, and delivery is priced from configured rates or quoted after the order. See the <Link href="/shipping" className="font-medium text-teal hover:underline">shipping policy</Link>.</>} />
                    <Reveal className="mt-8">
                        {data?.deliveryCountries?.length ? (
                            <ul className="flex flex-wrap gap-2" aria-label="Delivery countries">
                                {data.deliveryCountries.map((c) => <li key={c.code}><Pill>{c.name}</Pill></li>)}
                            </ul>
                        ) : <p className="text-body text-ink-3">{error ? 'The list couldn’t be loaded.' : 'Loading…'}</p>}
                    </Reveal>
                </Container>
            </Section>

            <Section tone="muted" labelledBy="faq-title">
                <Container>
                    <SectionHeader id="faq-title" align="center" title="Questions about hubs" />
                    <Faq className="mt-10" items={[
                        { q: 'Does my order go through a hub?', a: 'Only if the supplier’s delivery method uses one. Your order page shows the delivery method; “Atlantis arranges collection” goes straight from the supplier’s dispatch location to you.' },
                        { q: 'Why isn’t a location I know shown?', a: 'Only hubs Atlantis has verified are shown. Supplier warehouses and partner sites that aren’t verified Atlantis hubs are never presented as Atlantis warehouses.' },
                        { q: 'Why is the Americas map empty?', a: 'Atlantis shows a region as soon as it has a verified hub there. Until then the map stays empty rather than suggesting coverage that doesn’t exist.' },
                        { q: 'Can a supplier deliver to a hub?', a: 'Yes, once a verified hub exists. Suppliers choose this in Shipping & Fulfilment; their net price stays the same and their freight to the hub is shown separately.' },
                        { q: 'Can goods be inspected at a hub?', a: <>Where a hub lists inspection as a service. See <Link href="/goods-inspection" className="font-medium text-teal hover:underline">Goods Inspection</Link>.</> },
                    ]} />
                </Container>
            </Section>

            <CtaBand eyebrow="Plan a lane" title="Shipping between Europe and the Americas?" lead="Tell us your origin and delivery countries. We’ll tell you plainly what Atlantis can handle today.">
                <ButtonLink href="/contact">Contact the team</ButtonLink>
                <ButtonLink href="/protected-payments" variant="secondary">How orders are confirmed</ButtonLink>
            </CtaBand>
            <TrustNav current="warehouses" />
        </main>
    );
}
