'use client';

import * as React from 'react';
import Link from 'next/link';
import { CreditCard, MapPin, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { COUNTRIES } from '@/lib/countries';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Notice, Skeleton, inputCls, selectCls, useConfirm, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { AccountPicker, httpsUrl, readError, useTf, useUserNames, type AccountOption } from './shared';

type Msg = { tone: 'success' | 'danger'; text: string } | null;

/** GET a finance list; errors become a message. */
function useList<T>(path: string) {
    const tf = useTf();
    const [rows, setRows] = React.useState<T[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const load = React.useCallback(() => {
        setError(null);
        apiFetch(path, { cache: 'no-store' })
            .then(async (r) => { if (!r.ok) throw new Error(await readError(r, tf('loadFailed'))); return r.json(); })
            .then((d) => setRows(Array.isArray(d) ? d : []))
            .catch((e) => setError(e.message));
    }, [path, tf]);
    React.useEffect(() => { load(); }, [load]);
    return { rows, error, load };
}

function AccountName({ id, names }: { id: string; names: ReturnType<typeof useUserNames> }) {
    const tf = useTf();
    const n = names[id];
    return (
        <Link href={`/admin/users/${id}`} className="text-teal font-medium hover:underline">
            {n ? (n.companyName || n.name) : n === null ? tf('unknownAccount') : <span className="text-ink-3">{tf('loadingName')}</span>}
        </Link>
    );
}

// ─── Credit terms ──────────────────────────────────────────────────────

interface CreditTerm { id: string; userId: string; creditLimit: number; usedCredit: number; paymentTermDays: number; status: string; notes: string | null; updatedAt: string }

/**
 * Credit terms (GET/POST/DELETE /finance/credit-terms). The payment term sets
 * the due date of invoices generated for the buyer's orders; marking an
 * invoice paid lowers "used". Nothing checks the limit at checkout today.
 * The record has no currency field, so amounts are shown as plain numbers.
 */
export function CreditTermsPanel({ canWrite }: { canWrite: boolean }) {
    const tf = useTf();
    const { fmt } = useLanguage();
    const confirm = useConfirm();
    const { rows, error, load } = useList<CreditTerm>('/finance/credit-terms');
    const names = useUserNames((rows || []).map((r) => r.userId));
    const [edit, setEdit] = React.useState<CreditTerm | 'new' | null>(null);
    const [msg, setMsg] = React.useState<Msg>(null);
    const num = (n: number) => fmt.number(Number(n) || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const remove = async (c: CreditTerm) => {
        const n = names[c.userId];
        if (!(await confirm({ title: tf('ctDeleteTitle'), body: tf('ctDeleteBody', { name: n ? (n.companyName || n.name) : tf('unknownAccount') }), confirm: tf('ctDeleteCta'), tone: 'danger' }))) return;
        setMsg(null);
        try {
            const res = await apiFetch(`/finance/credit-terms/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await readError(res, tf('actionFailed')));
            setMsg({ tone: 'success', text: tf('ctDeleted') }); load();
        } catch (e: any) { setMsg({ tone: 'danger', text: e?.message || tf('actionFailed') }); }
    };

    return (
        <Card title={tf('ctTitle')} description={tf('ctLead')} actions={canWrite ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit('new')}>{tf('ctAdd')}</Button> : undefined}>
            <div aria-live="polite">{msg && <div className="mb-3"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}</div>
            {error && <ErrorState message={error} onRetry={load} />}
            {!rows && !error && <div className="space-y-2" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
            {rows && (rows.length === 0 ? <EmptyState icon={<CreditCard size={20} />} title={tf('ctEmptyTitle')}>{tf('ctEmptyBody')}</EmptyState> : (
                <div className="overflow-x-auto -mx-4 sm:-mx-5">
                    <table className="w-full min-w-[760px] text-[13.5px]">
                        <thead><tr className="text-ink-3 text-[12.5px] border-y border-line bg-surface-2/60">
                            <th scope="col" className="text-start font-medium ps-4 sm:ps-5 pe-2 py-2">{tf('colAccount')}</th>
                            <th scope="col" className="text-end font-medium px-2 py-2">{tf('ctLimit')}</th>
                            <th scope="col" className="text-end font-medium px-2 py-2">{tf('ctUsed')}</th>
                            <th scope="col" className="text-start font-medium px-2 py-2">{tf('ctTerm')}</th>
                            <th scope="col" className="text-start font-medium px-2 py-2">{tf('colStatus')}</th>
                            <th scope="col" className="text-end font-medium px-2 pe-4 sm:pe-5 py-2">{tf('colActions')}</th>
                        </tr></thead>
                        <tbody>
                            {rows.map((c) => (
                                <tr key={c.id} className="border-b border-line last:border-0 align-top">
                                    <td className="ps-4 sm:ps-5 pe-2 py-2.5"><AccountName id={c.userId} names={names} />{c.notes && <span className="block text-[12px] text-ink-3">{c.notes}</span>}</td>
                                    <td className="px-2 py-2.5 text-end tabular-nums">{num(c.creditLimit)}</td>
                                    <td className="px-2 py-2.5 text-end tabular-nums">{num(c.usedCredit)}</td>
                                    <td className="px-2 py-2.5">{tf('ctTermDays', { days: c.paymentTermDays })}</td>
                                    <td className="px-2 py-2.5"><Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'} dot>{['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(c.status) ? tf(`ct_${c.status}`) : c.status}</Badge></td>
                                    <td className="px-2 pe-4 sm:pe-5 py-2.5"><div className="flex justify-end gap-1">
                                        {canWrite && <Button size="sm" onClick={() => setEdit(c)}>{tf('edit')}</Button>}
                                        {canWrite && <button type="button" onClick={() => remove(c)} aria-label={tf('ctDeleteTitle')} title={tf('ctDeleteTitle')} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Trash2 size={15} /></button>}
                                    </div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            <p className="mt-3 text-[12.5px] text-ink-3">{tf('ctFootnote')}</p>
            {edit && <CreditDialog term={edit === 'new' ? null : edit} name={edit !== 'new' ? names[edit.userId] : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setMsg({ tone: 'success', text: tf('ctSaved') }); load(); }} />}
        </Card>
    );
}

function CreditDialog({ term, name, onClose, onSaved }: { term: CreditTerm | null; name?: { name: string; companyName: string | null; email: string } | null; onClose: () => void; onSaved: () => void }) {
    const tf = useTf();
    const [account, setAccount] = React.useState<AccountOption | null>(term ? { id: term.userId, name: name?.name || tf('unknownAccount'), email: name?.email || '', companyName: name?.companyName ?? null, country: null } : null);
    const [limit, setLimit] = React.useState(term ? String(term.creditLimit) : '');
    const [days, setDays] = React.useState(term ? String(term.paymentTermDays) : '30');
    const [notes, setNotes] = React.useState(term?.notes || '');
    const [touched, setTouched] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const limitOk = limit.trim() !== '' && Number.isFinite(Number(limit)) && Number(limit) >= 0;
    const daysOk = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365;
    const submit = async () => {
        if (busy) return;
        setTouched(true);
        if (!account || !limitOk || !daysOk) return;
        setBusy(true); setErr(null);
        try {
            const res = await apiFetch('/finance/credit-terms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: account.id, creditLimit: Number(limit), paymentTermDays: Number(days), notes: notes.trim() || undefined }) });
            if (!res.ok) throw new Error(await readError(res, tf('actionFailed')));
            onSaved();
        } catch (e: any) { setErr(e?.message || tf('actionFailed')); } finally { setBusy(false); }
    };
    return (
        <Dialog open onClose={() => !busy && onClose()} dismissable={!busy} title={term ? tf('ctEditTitle') : tf('ctAddTitle')} description={tf('ctDialogLead')} size="md"
            footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>{tf('cancel')}</Button><Button variant="primary" loading={busy} onClick={submit}>{tf('ctSave')}</Button></>}>
            <div className="space-y-4">
                <Field label={tf('ctBuyer')} htmlFor="ct-account" required error={touched && !account ? tf('miAccountError') : null}>
                    {term ? <div className="rounded-lg ring-1 ring-inset ring-line bg-surface-2 px-3 py-2 text-[13.5px]">{account?.companyName || account?.name}</div>
                        : <AccountPicker id="ct-account" role="CUSTOMER" label={tf('ctBuyer')} value={account} onChange={setAccount} />}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={tf('ctLimit')} htmlFor="ct-limit" required hint={tf('ctLimitHint')} error={touched && !limitOk ? tf('ctLimitError') : null}>
                        <input id="ct-limit" inputMode="decimal" dir="ltr" className={inputCls} value={limit} aria-invalid={(touched && !limitOk) || undefined} onChange={(e) => setLimit(e.target.value.replace(',', '.'))} />
                    </Field>
                    <Field label={tf('ctTerm')} htmlFor="ct-days" required error={touched && !daysOk ? tf('ctDaysError') : null}>
                        <input id="ct-days" type="number" min={1} max={365} step={1} dir="ltr" className={inputCls} value={days} aria-invalid={(touched && !daysOk) || undefined} onChange={(e) => setDays(e.target.value)} />
                    </Field>
                </div>
                <Field label={tf('detailNotes')} htmlFor="ct-notes" optional><textarea id="ct-notes" rows={2} className={cn(inputCls, 'h-auto py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
                {err && <Notice tone="danger">{err}</Notice>}
            </div>
        </Dialog>
    );
}

// ─── Tax exemptions ────────────────────────────────────────────────────

interface Exemption { id: string; userId: string; certificateUrl: string; certificateType: string; status: string; validFrom: string | null; validUntil: string | null; notes: string | null; createdAt: string }
const EX_TONE: Record<string, Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' };

/**
 * Tax exemptions (GET /finance/tax-exemptions, POST …/:id/review). An APPROVED
 * exemption makes the invoice service record 0 tax on new invoices for that
 * account; it does not check the validity dates.
 */
export function TaxExemptionsPanel({ canWrite }: { canWrite: boolean }) {
    const tf = useTf();
    const { fmt } = useLanguage();
    const confirm = useConfirm();
    const { rows, error, load } = useList<Exemption>('/finance/tax-exemptions');
    const names = useUserNames((rows || []).map((r) => r.userId));
    const [busy, setBusy] = React.useState<string | null>(null);
    const [msg, setMsg] = React.useState<Msg>(null);
    const date = (d: string | null) => (d ? fmt.date(d) : null);

    const review = async (x: Exemption, status: 'APPROVED' | 'REJECTED') => {
        if (busy) return;
        if (!(await confirm({ title: tf(status === 'APPROVED' ? 'teApproveTitle' : 'teRejectTitle'), body: tf(status === 'APPROVED' ? 'teApproveBody' : 'teRejectBody'), confirm: tf(status === 'APPROVED' ? 'teApprove' : 'teReject'), tone: status === 'REJECTED' ? 'danger' : 'primary' }))) return;
        setBusy(x.id); setMsg(null);
        try {
            const res = await apiFetch(`/finance/tax-exemptions/${encodeURIComponent(x.id)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
            if (!res.ok) throw new Error(await readError(res, tf('actionFailed')));
            setMsg({ tone: 'success', text: tf(status === 'APPROVED' ? 'teApproved' : 'teRejected') }); load();
        } catch (e: any) { setMsg({ tone: 'danger', text: e?.message || tf('actionFailed') }); } finally { setBusy(null); }
    };

    return (
        <Card title={tf('teTitle')} description={tf('teLead')}>
            <div aria-live="polite">{msg && <div className="mb-3"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}</div>
            {error && <ErrorState message={error} onRetry={load} />}
            {!rows && !error && <div className="space-y-2" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
            {rows && (rows.length === 0 ? <EmptyState icon={<ShieldCheck size={20} />} title={tf('teEmptyTitle')}>{tf('teEmptyBody')}</EmptyState> : (
                <ul className="divide-y divide-line -mx-4 sm:-mx-5 border-y border-line">
                    {rows.map((x) => {
                        const cert = httpsUrl(x.certificateUrl);
                        return (
                            <li key={x.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 text-[13.5px]">
                                    <p className="flex flex-wrap items-center gap-2"><AccountName id={x.userId} names={names} />
                                        <Badge tone={EX_TONE[x.status] ?? 'neutral'} dot>{['PENDING', 'APPROVED', 'REJECTED'].includes(x.status) ? tf(`te_${x.status}`) : x.status}</Badge>
                                    </p>
                                    <p className="mt-0.5 text-[12.5px] text-ink-3"><bdi dir="ltr">{x.certificateType}</bdi> · {tf('teSubmitted', { date: date(x.createdAt) || '—' })}
                                        {' · '}{x.validFrom || x.validUntil ? tf('teValid', { from: date(x.validFrom) || '—', to: date(x.validUntil) || '—' }) : tf('teNoValidity')}</p>
                                    <p className="mt-0.5 text-[12.5px]">{cert ? <a href={cert} target="_blank" rel="noopener noreferrer" className="text-teal font-medium hover:underline">{tf('teOpenCert')}</a> : <span className="text-ink-4">{tf('teNoCert')}</span>}</p>
                                </div>
                                {canWrite && x.status === 'PENDING' && (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="primary" loading={busy === x.id} disabled={!!busy} onClick={() => review(x, 'APPROVED')}>{tf('teApprove')}</Button>
                                        <Button size="sm" disabled={!!busy} onClick={() => review(x, 'REJECTED')}>{tf('teReject')}</Button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ))}
        </Card>
    );
}

// ─── Supplier dispatch locations (Warehouse model) ─────────────────────

interface Location { id: string; name: string; address: string; city: string; country: string; zipCode: string | null; supplierId: string; isDefault: boolean }

/**
 * Supplier-owned dispatch addresses (GET/POST/DELETE /finance/warehouses).
 * Offers show a product's location as "ships from". These are not Atlantis
 * hubs (Settings → Atlantis hubs) and Atlantis doesn't operate them.
 */
export function DispatchLocationsPanel({ canWrite }: { canWrite: boolean }) {
    const tf = useTf();
    const confirm = useConfirm();
    const { rows, error, load } = useList<Location>('/finance/warehouses');
    const names = useUserNames((rows || []).map((r) => r.supplierId));
    const [adding, setAdding] = React.useState(false);
    const [msg, setMsg] = React.useState<Msg>(null);
    const { meta } = useLanguage();
    const countryName = React.useMemo(() => { let dn: Intl.DisplayNames | null = null; try { dn = new Intl.DisplayNames([meta.intl], { type: 'region' }); } catch { /* none */ } return (c: string) => { try { return (/^[A-Z]{2}$/i.test(c) && dn?.of(c.toUpperCase())) || c; } catch { return c; } }; }, [meta.intl]);

    const remove = async (w: Location) => {
        if (!(await confirm({ title: tf('dlDeleteTitle'), body: tf('dlDeleteBody', { name: w.name }), confirm: tf('dlDeleteCta'), tone: 'danger' }))) return;
        setMsg(null);
        try {
            const res = await apiFetch(`/finance/warehouses/${encodeURIComponent(w.id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await readError(res, tf('dlDeleteFailed')));
            setMsg({ tone: 'success', text: tf('dlDeleted') }); load();
        } catch (e: any) { setMsg({ tone: 'danger', text: e?.message || tf('dlDeleteFailed') }); }
    };

    return (
        <Card title={tf('dlTitle')} description={tf('dlLead')} actions={canWrite ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>{tf('dlAdd')}</Button> : undefined}>
            <div aria-live="polite">{msg && <div className="mb-3"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}</div>
            {error && <ErrorState message={error} onRetry={load} />}
            {!rows && !error && <div className="space-y-2" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
            {rows && (rows.length === 0 ? <EmptyState icon={<MapPin size={20} />} title={tf('dlEmptyTitle')}>{tf('dlEmptyBody')}</EmptyState> : (
                <ul className="divide-y divide-line -mx-4 sm:-mx-5 border-y border-line">
                    {rows.map((w) => (
                        <li key={w.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-start justify-between gap-3 text-[13.5px]">
                            <div className="min-w-0">
                                <p className="font-semibold text-heading flex flex-wrap items-center gap-2">{w.name}{w.isDefault && <Badge tone="brand">{tf('dlDefault')}</Badge>}</p>
                                <p className="mt-0.5 text-ink-2">{[w.address, w.zipCode, w.city, countryName(w.country)].filter(Boolean).join(', ')}</p>
                                <p className="mt-0.5 text-[12.5px] text-ink-3">{tf('dlSupplier')} <AccountName id={w.supplierId} names={names} /></p>
                            </div>
                            {canWrite && <button type="button" onClick={() => remove(w)} aria-label={tf('dlDeleteTitle')} title={tf('dlDeleteTitle')} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Trash2 size={15} /></button>}
                        </li>
                    ))}
                </ul>
            ))}
            {adding && <LocationDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setMsg({ tone: 'success', text: tf('dlSaved') }); load(); }} />}
        </Card>
    );
}

function LocationDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const tf = useTf();
    const { meta } = useLanguage();
    const options = React.useMemo(() => {
        let dn: Intl.DisplayNames | null = null; try { dn = new Intl.DisplayNames([meta.intl], { type: 'region' }); } catch { /* none */ }
        return COUNTRIES.map((c) => { let n = c.name; try { n = dn?.of(c.iso) || c.name; } catch { /* keep */ } return { iso: c.iso, name: n }; }).sort((a, b) => a.name.localeCompare(b.name, meta.intl));
    }, [meta.intl]);
    const [supplier, setSupplier] = React.useState<AccountOption | null>(null);
    const [f, setF] = React.useState({ name: '', address: '', city: '', country: '', zipCode: '' });
    const [touched, setTouched] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const req = (k: keyof typeof f) => (touched && !f[k].trim() ? tf('required') : null);
    const submit = async () => {
        if (busy) return;
        setTouched(true);
        if (!supplier || !f.name.trim() || !f.address.trim() || !f.city.trim() || !f.country) return;
        setBusy(true); setErr(null);
        try {
            const res = await apiFetch('/finance/warehouses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplierId: supplier.id, name: f.name.trim(), address: f.address.trim(), city: f.city.trim(), country: f.country, zipCode: f.zipCode.trim() || undefined }) });
            if (!res.ok) throw new Error(await readError(res, tf('actionFailed')));
            onSaved();
        } catch (e: any) { setErr(e?.message || tf('actionFailed')); } finally { setBusy(false); }
    };
    const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
    return (
        <Dialog open onClose={() => !busy && onClose()} dismissable={!busy} title={tf('dlAddTitle')} description={tf('dlDialogLead')} size="md"
            footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>{tf('cancel')}</Button><Button variant="primary" loading={busy} onClick={submit}>{tf('dlSave')}</Button></>}>
            <div className="space-y-4">
                <Field label={tf('dlSupplierField')} htmlFor="dl-supplier" required error={touched && !supplier ? tf('required') : null}>
                    <AccountPicker id="dl-supplier" role="SUPPLIER" label={tf('dlSupplierField')} value={supplier} onChange={setSupplier} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={tf('dlName')} htmlFor="dl-name" required error={req('name')}><input id="dl-name" className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
                    <Field label={tf('dlCity')} htmlFor="dl-city" required error={req('city')}><input id="dl-city" className={inputCls} value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
                    <Field label={tf('dlCountry')} htmlFor="dl-country" required error={req('country')}>
                        <select id="dl-country" className={selectCls} value={f.country} onChange={(e) => set('country', e.target.value)}>
                            <option value="">{tf('choose')}</option>{options.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                        </select>
                    </Field>
                    <Field label={tf('dlZip')} htmlFor="dl-zip" optional><input id="dl-zip" className={inputCls} value={f.zipCode} onChange={(e) => set('zipCode', e.target.value)} /></Field>
                </div>
                <Field label={tf('dlAddress')} htmlFor="dl-address" required error={req('address')}><input id="dl-address" className={inputCls} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
                {err && <Notice tone="danger">{err}</Notice>}
            </div>
        </Dialog>
    );
}
