'use client';

import * as React from 'react';
import { Globe2, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button, Card, Notice, PageHeader, Badge } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

type Policy = { countries: string[]; configured: boolean; defaultCountries: string[]; all: { code: string; name: string }[] };

/**
 * Where Atlantis delivers. Checkout checks a buyer's destination against this
 * list before the order review, and the server re-checks it when the order is
 * placed. Until it's saved here, the default (Europe + GCC) applies.
 */
export default function DeliveryCountriesPage() {
    const [policy, setPolicy] = React.useState<Policy | null>(null);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [q, setQ] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [msg, setMsg] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

    const load = React.useCallback(() => {
        apiFetch('/admin/delivery-policy').then((r) => (r.ok ? r.json() : Promise.reject(r))).then((p: Policy) => { setPolicy(p); setSelected(new Set(p.countries)); })
            .catch(() => setMsg({ tone: 'danger', text: 'Couldn’t load the delivery policy (owner/admin access required).' }));
    }, []);
    React.useEffect(() => { load(); }, [load]);

    const save = async () => {
        setSaving(true); setMsg(null);
        try {
            const res = await apiFetch('/admin/delivery-policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ countries: Array.from(selected) }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : 'Couldn’t save.');
            setMsg({ tone: 'success', text: `Saved. Checkout now accepts ${d.countries.length} destination countries.` }); load();
        } catch (e: any) { setMsg({ tone: 'danger', text: e.message }); } finally { setSaving(false); }
    };

    const toggle = (c: string) => setSelected((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
    const list = (policy?.all ?? []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase() === q.toLowerCase());
    const dirty = policy && JSON.stringify(Array.from(selected).sort()) !== JSON.stringify([...policy.countries].sort());

    return (
        <div className="max-w-5xl space-y-5 text-start">
            <PageHeader title="Delivery countries" description="Buyers can only check out to these destinations. Checkout explains an unsupported destination before the order review, and the server refuses it when the order is placed." />
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            {policy && !policy.configured && <Notice tone="warning">No list has been saved yet, so the default applies: EU, EEA, Switzerland, UK, Western Balkans, Moldova and the GCC — the area the site says it serves. Confirm or change it and save.</Notice>}
            <Card>
                <div className="flex flex-wrap items-center gap-3">
                    <Globe2 size={18} className="text-teal" />
                    <p className="text-[14px] font-medium text-heading flex-1">{selected.size} countries selected</p>
                    <Button size="sm" variant="ghost" onClick={() => policy && setSelected(new Set(policy.defaultCountries))}>Use default</Button>
                    <Button size="sm" variant="primary" loading={saving} disabled={!dirty || selected.size === 0} onClick={save}>Save list</Button>
                </div>
                <label className="relative block mt-4">
                    <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a country" aria-label="Find a country" className="w-full h-10 rounded-lg ring-1 ring-line-strong bg-surface ps-9 pe-3 text-[13.5px]" />
                </label>
                <ul className="mt-4 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 max-h-[60vh] overflow-y-auto">
                    {list.map((c) => (
                        <li key={c.code}>
                            <label className={cn('flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-surface-2 text-[13.5px]', selected.has(c.code) && 'text-heading font-medium')}>
                                <input type="checkbox" checked={selected.has(c.code)} onChange={() => toggle(c.code)} className="w-4 h-4 accent-[#0E7C74]" />
                                {c.name} <span className="text-ink-4 text-[12px]">{c.code}</span>
                                {policy?.defaultCountries.includes(c.code) && <Badge>default</Badge>}
                            </label>
                        </li>
                    ))}
                </ul>
            </Card>
            <p className="text-[12.5px] text-ink-3">No product-, supplier- or route-specific delivery restriction exists in the data yet; this list applies to every order. Freight is quoted by Atlantis after the order.</p>
        </div>
    );
}
