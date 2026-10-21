'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { Archive, ChevronLeft, ChevronRight, Download, Lock, Search, Trash2, Undo2, Unlock, Upload, UserPlus, Users } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Skeleton, Stat, inputCls, selectCls, useConfirm } from '@/components/supplier/ui';
import { CONTACT_KINDS, CONTACT_STATUSES, EXCLUSIONS, newsletterApi, type BulkContactAction, type BulkContactResult, type ContactList, type ContactRow } from '@/lib/admin-newsletter-api';
import { EligibilityBadge, KindBadge, useInt, useTn, useWhen } from './newsletterUi';
import { AddContactDialog, ContactDialog } from './ContactDialogs';
import { ImportContactsDialog } from './ImportContactsDialog';

const PAGE_SIZE = 25;

/** Newsletter Hub → Contacts: real rows from /newsletter/admin/contacts; filters run on the server. */
export function ContactsPanel() {
    const tn = useTn();
    const int = useInt();
    const when = useWhen();
    const confirm = useConfirm();
    const [data, setData] = React.useState<ContactList | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [q, setQ] = React.useState('');
    const [term, setTerm] = React.useState('');
    const [status, setStatus] = React.useState('');
    const [kind, setKind] = React.useState('');
    const [source, setSource] = React.useState('');
    const [region, setRegion] = React.useState('');
    const [eligibility, setEligibility] = React.useState('');
    const [page, setPage] = React.useState(1);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [adding, setAdding] = React.useState(false);
    const [importing, setImporting] = React.useState(false);
    const [openId, setOpenId] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);
    const [report, setReport] = React.useState<BulkContactResult | null>(null);

    React.useEffect(() => { const h = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(h); }, [q]);
    React.useEffect(() => { setPage(1); }, [term, status, kind, source, region, eligibility]);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        newsletterApi.contacts({ q: term, status, kind, source, region, eligibility, page, pageSize: PAGE_SIZE })
            .then((d) => { setData(d); setSelected(new Set()); })
            .catch((e) => setError(e?.message || tn('loadFailed')))
            .finally(() => setLoading(false));
    }, [term, status, kind, source, region, eligibility, page, tn]);
    React.useEffect(() => { load(); }, [load]);

    const rows = data?.rows ?? [];
    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
    const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const filtered = !!(term || status || kind || source || region || eligibility);

    const runBulk = async (action: BulkContactAction) => {
        const ids = Array.from(selected);
        if (!ids.length) return;
        const ok = await confirm({ title: tn(`bulkTitle_${action}`, { count: ids.length }), body: tn(`bulkBody_${action}`), confirm: tn(`bulk_${action}`), tone: action === 'delete' || action === 'block' ? 'danger' : 'primary' });
        if (!ok) return;
        setBusy(true);
        try { const r = await newsletterApi.bulk(ids, action); setReport(r); load(); }
        catch (e: any) { toast.error(e?.message || tn('actionFailed')); }
        finally { setBusy(false); }
    };
    const exportCsv = async () => {
        setExporting(true);
        try { await newsletterApi.exportContacts(); } catch (e: any) { toast.error(e?.message || tn('exportFailed')); } finally { setExporting(false); }
    };

    const s = data?.summary;
    const excludedTotal = s ? Object.values(s.byReason).reduce((a, b) => a + (b || 0), 0) : 0;
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label={tn('summaryAria')}>
                <Stat label={tn('statContacts')} value={s ? int(s.contacts) : '—'} loading={!data && loading} hint={s ? tn('statContactsHint', { accounts: int(s.byKind.ACCOUNT ?? 0) }) : undefined} />
                <Stat label={tn('statSendable')} tone="success" value={s ? int(s.eligible) : '—'} loading={!data && loading} hint={tn('statSendableHint')} />
                <Stat label={tn('statExcluded')} tone="warning" value={s ? int(excludedTotal) : '—'} loading={!data && loading} hint={s ? tn('statExcludedHint', { unsub: int(s.byReason.UNSUBSCRIBED ?? 0), noconsent: int(s.byReason.NO_CONSENT ?? 0) }) : undefined} />
                <Stat label={tn('statAccountOptIns')} value={s ? int(s.accountOptInsWithoutContact) : '—'} loading={!data && loading} hint={tn('statAccountOptInsHint')} />
            </div>

            <Card bodyClassName="p-0">
                <div className="flex flex-wrap items-end gap-2 p-4 border-b border-line">
                    <div className="relative flex-1 min-w-[14rem]">
                        <label htmlFor="nl-q" className="sr-only">{tn('search')}</label>
                        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                        <input id="nl-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tn('searchPh')} className={`${inputCls} ps-9 h-9`} />
                    </div>
                    <label className="sr-only" htmlFor="nl-elig">{tn('filterEligibility')}</label>
                    <select id="nl-elig" value={eligibility} onChange={(e) => setEligibility(e.target.value)} className={`${selectCls} h-9 !w-auto`}>
                        <option value="">{tn('anyEligibility')}</option>
                        <option value="ELIGIBLE">{tn('sendable')}</option>
                        {EXCLUSIONS.filter((x) => x !== 'SUPPLIER_PRICE_PRIVACY' && x !== 'NON_PRODUCTION').map((x) => <option key={x} value={x}>{tn(`reason_${x}`)}</option>)}
                    </select>
                    <label className="sr-only" htmlFor="nl-kind">{tn('filterKind')}</label>
                    <select id="nl-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${selectCls} h-9 !w-auto`}>
                        <option value="">{tn('anyKind')}</option>
                        {CONTACT_KINDS.map((k) => <option key={k} value={k}>{tn(`kind_${k}`)}</option>)}
                    </select>
                    <label className="sr-only" htmlFor="nl-status">{tn('filterStatus')}</label>
                    <select id="nl-status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectCls} h-9 !w-auto`}>
                        <option value="">{tn('anyStatus')}</option>
                        {CONTACT_STATUSES.map((k) => <option key={k} value={k}>{tn(`status_${k}`)}</option>)}
                    </select>
                    {!!data?.facets.sources.length && (<>
                        <label className="sr-only" htmlFor="nl-source">{tn('filterSource')}</label>
                        <select id="nl-source" value={source} onChange={(e) => setSource(e.target.value)} className={`${selectCls} h-9 !w-auto max-w-[12rem]`}>
                            <option value="">{tn('anySource')}</option>
                            {data.facets.sources.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </>)}
                    {!!data?.facets.regions.length && (<>
                        <label className="sr-only" htmlFor="nl-region">{tn('filterRegion')}</label>
                        <select id="nl-region" value={region} onChange={(e) => setRegion(e.target.value)} className={`${selectCls} h-9 !w-auto max-w-[12rem]`}>
                            <option value="">{tn('anyRegion')}</option>
                            {data.facets.regions.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </>)}
                    <div className="flex flex-wrap gap-2 ms-auto">
                        <Button size="sm" icon={<Download size={14} />} loading={exporting} onClick={exportCsv}>{tn('export')}</Button>
                        <Button size="sm" icon={<Upload size={14} />} onClick={() => setImporting(true)}>{tn('import')}</Button>
                        <Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setAdding(true)}>{tn('addContact')}</Button>
                    </div>
                </div>

                {selected.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-teal-soft border-b border-line text-[13px]" role="region" aria-label={tn('bulkAria')}>
                        <span className="font-medium text-ink">{tn('selectedCount', { count: selected.size })}</span>
                        <Button size="sm" variant="ghost" icon={<Archive size={14} />} disabled={busy} onClick={() => runBulk('archive')}>{tn('bulk_archive')}</Button>
                        <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={busy} onClick={() => runBulk('restore')}>{tn('bulk_restore')}</Button>
                        <Button size="sm" variant="ghost" icon={<Lock size={14} />} disabled={busy} onClick={() => runBulk('block')}>{tn('bulk_block')}</Button>
                        <Button size="sm" variant="ghost" icon={<Unlock size={14} />} disabled={busy} onClick={() => runBulk('unblock')}>{tn('bulk_unblock')}</Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={busy} onClick={() => runBulk('delete')}>{tn('bulk_delete')}</Button>
                        <button type="button" onClick={() => setSelected(new Set())} className="ms-auto text-teal font-medium hover:underline">{tn('clearSelection')}</button>
                    </div>
                )}
                {report && (
                    <div role="status" className="px-4 py-2 border-b border-line text-[13px] text-ink-2 flex flex-wrap gap-2 items-center">
                        <span>{tn('bulkDone', { done: report.done })}</span>
                        {report.skipped.length > 0 && <span className="text-ink-3">{tn('bulkSkipped', { count: report.skipped.length })}: {report.skipped.slice(0, 5).map((x) => `${x.email || x.id} (${tn(`skip_${x.reason}`)})`).join(', ')}</span>}
                        <button type="button" onClick={() => setReport(null)} className="ms-auto text-teal font-medium hover:underline">{tn('dismiss')}</button>
                    </div>
                )}

                {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : loading && !data ? (
                    <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : rows.length === 0 ? (
                    <EmptyState icon={<Users size={20} />} title={filtered ? tn('emptyFiltered') : tn('emptyTitle')}
                        action={!filtered ? <><Button size="sm" onClick={() => setImporting(true)}>{tn('import')}</Button><Button size="sm" variant="primary" onClick={() => setAdding(true)}>{tn('addContact')}</Button></> : undefined}>
                        {filtered ? tn('emptyFilteredBody') : tn('emptyBody')}
                    </EmptyState>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-[13px]">
                            <thead>
                                <tr className="text-start text-[12px] text-ink-3 border-b border-line">
                                    <th className="py-2.5 ps-4 pe-2 w-8"><input type="checkbox" aria-label={tn('selectPage')} checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                                    <th className="py-2.5 px-3 text-start font-medium">{tn('colContact')}</th>
                                    <th className="py-2.5 px-3 text-start font-medium">{tn('colType')}</th>
                                    <th className="py-2.5 px-3 text-start font-medium">{tn('colMarketing')}</th>
                                    <th className="py-2.5 px-3 text-start font-medium">{tn('colBasis')}</th>
                                    <th className="py-2.5 px-3 text-start font-medium">{tn('colSource')}</th>
                                    <th className="py-2.5 px-3 text-start font-medium">{tn('colAdded')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => <Row key={r.id} r={r} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} onOpen={() => setOpenId(r.id)} when={when} />)}
                            </tbody>
                        </table>
                    </div>
                )}
                {data && data.total > data.pageSize && (
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-line text-[13px] text-ink-3">
                        <span>{tn('pageOf', { page, pages, total: int(data.total) })}</span>
                        <div className="flex gap-1">
                            <Button size="sm" variant="secondary" aria-label={tn('prevPage')} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft size={14} className="rtl:rotate-180" />} />
                            <Button size="sm" variant="secondary" aria-label={tn('nextPage')} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} icon={<ChevronRight size={14} className="rtl:rotate-180" />} />
                        </div>
                    </div>
                )}
            </Card>

            <AddContactDialog open={adding} onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); load(); setOpenId(id); }} onOpenExisting={(id) => { setAdding(false); setOpenId(id); }} />
            <ImportContactsDialog open={importing} onClose={() => setImporting(false)} onDone={() => load()} />
            <ContactDialog id={openId} onClose={() => setOpenId(null)} onChanged={load} />
        </div>
    );
}

function Row({ r, checked, onToggle, onOpen, when }: { r: ContactRow; checked: boolean; onToggle: () => void; onOpen: () => void; when: (s: string | null) => string | null }) {
    const tn = useTn();
    const display = r.account?.companyName || r.company || r.account?.name || r.name;
    return (
        <tr className="border-b border-line last:border-0 hover:bg-surface-2/60">
            <td className="py-2.5 ps-4 pe-2"><input type="checkbox" aria-label={tn('selectRow', { email: r.email })} checked={checked} onChange={onToggle} /></td>
            <td className="py-2.5 px-3 min-w-0">
                <button type="button" onClick={onOpen} className="text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded">
                    <span className="block font-medium text-ink hover:text-teal">{r.email}</span>
                    {display && <span className="block text-[12px] text-ink-3">{display}{r.region ? ` · ${r.region}` : ''}</span>}
                </button>
            </td>
            <td className="py-2.5 px-3"><KindBadge kind={r.kind} />{r.account && <span className="block mt-0.5 text-[12px] text-ink-3">{tn(`role_${r.account.role}`)}</span>}</td>
            <td className="py-2.5 px-3"><EligibilityBadge row={r} /></td>
            <td className="py-2.5 px-3 text-ink-2">{r.basis ? tn(`basis_${r.basis}`) : <span className="text-ink-3">{tn('basisNone')}</span>}</td>
            <td className="py-2.5 px-3 text-ink-2">{r.source || <span className="text-ink-3">{tn('notRecorded')}</span>}</td>
            <td className="py-2.5 px-3 text-ink-3 tabular-nums whitespace-nowrap">{when(r.createdAt)}</td>
        </tr>
    );
}
