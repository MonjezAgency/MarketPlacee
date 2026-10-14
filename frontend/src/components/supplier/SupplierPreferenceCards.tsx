'use client';

import * as React from 'react';
import Link from 'next/link';
import { Coins, Package, Check, AlertCircle } from 'lucide-react';
import { supplierApi } from '@/lib/supplier-api';
import { SettingsCard } from '@/components/account/AccountCards';
import { selectCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

/**
 * Default currency for entering prices. Suggested from the company country
 * until the supplier picks one; changing it never converts saved prices.
 */
export function DefaultCurrencyCard() {
    const [prefs, setPrefs] = React.useState<any | null | undefined>(undefined);
    const [busy, setBusy] = React.useState(false);
    const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
    React.useEffect(() => { supplierApi.preferences().then(setPrefs).catch(() => setPrefs(null)); }, []);
    const save = async (value: string) => {
        setBusy(true); setMsg(null);
        try { setPrefs(await supplierApi.setPreferences({ defaultCurrency: value || null })); setMsg({ ok: true, text: 'Saved.' }); }
        catch (e: any) { setMsg({ ok: false, text: e.message }); }
        finally { setBusy(false); }
    };
    return (
        <SettingsCard icon={<Coins size={17} />} title="Default currency" desc="Pre-selected when you add a product or upload a sheet. You can still change it per product.">
            {prefs === undefined ? <p className="text-[13px] text-ink-3">Loading…</p> : prefs === null ? <p className="text-[13px] text-ink-3">Couldn’t load your preferences.</p> : (
                <div className="space-y-2">
                    <label htmlFor="pref-cur" className="sr-only">Default currency</label>
                    <select id="pref-cur" value={prefs.defaultCurrency || ''} disabled={busy} onChange={(e) => save(e.target.value)} className={selectCls}>
                        <option value="">Automatic — {prefs.suggestedCurrency}{prefs.country ? ` (from ${prefs.country})` : ''}</option>
                        {prefs.currencies.map((c: string) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {prefs.defaultCurrency && prefs.defaultCurrency !== prefs.suggestedCurrency && (
                        <p className="text-[12.5px] text-ink-3">Your company country suggests {prefs.suggestedCurrency}. <button type="button" className="text-teal font-semibold hover:underline" onClick={() => save(prefs.suggestedCurrency)}>Use {prefs.suggestedCurrency}</button></p>
                    )}
                    <p className="text-[12.5px] text-ink-3">Changing this doesn’t convert prices you already saved — each product keeps the currency it was entered in. Prices are stored on the platform in EUR at a fixed rate.</p>
                    {msg && <p role={msg.ok ? 'status' : 'alert'} className={cn('text-[13px] flex items-center gap-1.5', msg.ok ? 'text-teal' : 'text-red-700')}>{msg.ok ? <Check size={14} /> : <AlertCircle size={14} />}{msg.text}</p>}
                </div>
            )}
        </SettingsCard>
    );
}

/** Where the supplier's catalog stands (counts from the server). */
export function ListingStatusCard() {
    const [s, setS] = React.useState<any | null | undefined>(undefined);
    React.useEffect(() => { supplierApi.products({ limit: 5 }).then((d) => setS(d.summary)).catch(() => setS(null)); }, []);
    const rows: [string, string, string][] = [['Live', 'APPROVED', 'text-emerald-700'], ['In review', 'PENDING', 'text-amber-800'], ['Changes requested', 'NEEDS_CHANGES', 'text-amber-800'], ['Drafts', 'DRAFT', 'text-ink-2'], ['Rejected', 'REJECTED', 'text-red-700']];
    return (
        <SettingsCard icon={<Package size={17} />} title="Your listings">
            {s === undefined ? <p className="text-[13px] text-ink-3">Loading…</p> : s === null ? <p className="text-[13px] text-ink-3">Couldn’t load your listings.</p> : (
                <>
                    <dl className="grid grid-cols-2 gap-y-1.5 text-[13.5px]">
                        {rows.map(([label, key, cls]) => (
                            <React.Fragment key={key}><dt className="text-ink-3">{label}</dt><dd className={cn('text-end tabular-nums font-semibold', s.byStatus?.[key] ? cls : 'text-ink-4')}>{s.byStatus?.[key] ?? 0}</dd></React.Fragment>
                        ))}
                    </dl>
                    <Link href="/supplier/products" className="mt-3 inline-block text-[13.5px] font-semibold text-teal hover:underline">Open Inventory &amp; Products</Link>
                </>
            )}
        </SettingsCard>
    );
}
