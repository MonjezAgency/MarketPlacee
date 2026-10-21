'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, ImageOff, RefreshCw, ShieldCheck, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Notice, Skeleton, Stat, inputCls, type Tone } from '@/components/supplier/ui';
import { RoleChip } from '@/components/admin/support/hqUi';
import { KYC_DECIDE_ROLES, USER_DETAIL_ROLES, kycApi, type KycDoc, type KycStats, type KycStatus } from '@/lib/admin-support-api';

/**
 * Admin → Support HQ → KYC (dictionary section `adminKyc`).
 * Everything the former KYC Verification page (/admin/kyc) did — the status
 * filters and counts, the document viewer through the signed-URL endpoint,
 * approve and reject — plus revoke for verified documents (PATCH
 * /kyc/admin/:id/revoke). backend/src/kyc decides; this view shows its answer.
 */

type Filter = 'ALL' | KycStatus;
const FILTERS: Filter[] = ['PENDING', 'VERIFIED', 'REJECTED', 'ALL'];
const STATUS_TONE: Record<string, Tone> = { PENDING: 'warning', VERIFIED: 'success', REJECTED: 'danger' };
const DOC_TYPES = ['NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENSE', 'RESIDENCE_PERMIT'];
type Action = 'verify' | 'reject' | 'revoke';

function useTk() {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminKyc', k, v), [t]);
}

export function KycStatusBadge({ status, className }: { status: string; className?: string }) {
    const tk = useTk();
    return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot className={className}>{STATUS_TONE[status] ? tk(`status_${status}`) : status}</Badge>;
}
function useDocType() {
    const tk = useTk();
    return React.useCallback((v: string) => (DOC_TYPES.includes(v) ? tk(`doc_${v}`) : v.replace(/_/g, ' ')), [tk]);
}

export function KycReview({ role, selectedId, userId, onSelect }: { role: string; selectedId: string | null; userId: string | null; onSelect: (id: string | null) => void }) {
    const tk = useTk();
    const { fmt } = useLanguage();
    const docType = useDocType();
    const [filter, setFilter] = React.useState((userId ? 'ALL' : 'PENDING') as Filter);
    const [rows, setRows] = React.useState(null as KycDoc[] | null);
    const [error, setError] = React.useState(null as string | null);
    const [stats, setStats] = React.useState(null as KycStats | null);
    const [userMissing, setUserMissing] = React.useState(false);

    const loadStats = React.useCallback(() => { kycApi.stats().then(setStats).catch(() => setStats(null)); }, []);
    const load = React.useCallback(async () => {
        setError(null); setRows(null);
        try { setRows(await kycApi.list(filter === 'ALL' ? null : filter)); } catch (e: any) { setError(e?.message || tk('loadFailed')); }
    }, [filter, tk]);
    React.useEffect(() => { load(); }, [load]);
    React.useEffect(() => { loadStats(); }, [loadStats]);

    // ?user=<userId>: open that account's most recent submission.
    React.useEffect(() => {
        if (!userId || selectedId || !rows || filter !== 'ALL') return;
        const mine = rows.filter((r) => r.userId === userId);
        if (mine.length) onSelect(mine[0].id); else setUserMissing(true);
    }, [userId, selectedId, rows, filter, onSelect]);

    const changed = () => { load(); loadStats(); };
    const count = (f: Filter) => (!stats ? null : f === 'PENDING' ? stats.pending : f === 'VERIFIED' ? stats.verified : f === 'REJECTED' ? stats.rejected : null);

    return (
        <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
                <Stat loading={!stats} tone={stats?.pending ? 'warning' : 'neutral'} label={tk('statPending')} value={stats?.pending ?? '—'} />
                <Stat loading={!stats} label={tk('statVerified')} value={stats?.verified ?? '—'} />
                <Stat loading={!stats} label={tk('statRejected')} value={stats?.rejected ?? '—'} />
                <Stat loading={!stats} label={tk('statUnverified')} value={stats?.unverified ?? '—'} hint={tk('statUnverifiedHint')} />
            </div>
            {userMissing && <Notice tone="info" onClose={() => setUserMissing(false)}>{tk('userNoDoc')}</Notice>}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,400px)_1fr] gap-3 items-start">
                <section aria-label={tk('listAria')} className={cn('rounded-xl bg-surface ring-1 ring-line overflow-hidden', selectedId && 'hidden lg:block')}>
                    <div className="p-3 border-b border-line flex flex-wrap gap-1.5" role="group" aria-label={tk('filterLabel')}>
                        {FILTERS.map((f) => {
                            const c = count(f);
                            return (
                                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                                    className={cn('h-8 px-2.5 rounded-lg text-[12.5px] font-medium inline-flex items-center gap-1.5 ring-1 ring-inset transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                        filter === f ? 'bg-teal-soft text-teal ring-teal' : 'bg-surface text-ink-2 ring-line hover:bg-surface-2')}>
                                    {f === 'ALL' ? tk('filterAll') : tk(`status_${f}`)}{c ? <span className="tabular-nums text-ink-3">{c}</span> : null}
                                </button>
                            );
                        })}
                    </div>
                    {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div>
                        : !rows ? <div className="p-3 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
                            : !rows.length ? <EmptyState icon={<ShieldCheck size={20} />} title={tk('emptyTitle')}>{filter === 'PENDING' ? tk('emptyPending') : tk('emptyBody')}</EmptyState>
                                : (
                                    <ul className="divide-y divide-line max-h-[70dvh] overflow-y-auto">
                                        {rows.map((k) => (
                                            <li key={k.id}>
                                                <button type="button" onClick={() => onSelect(k.id)} aria-current={selectedId === k.id ? 'true' : undefined}
                                                    className={cn('w-full text-start px-4 py-2.5 flex flex-col gap-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6]', selectedId === k.id && 'bg-surface-2')}>
                                                    <span className="flex items-center gap-2">
                                                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-heading">{k.user?.name || k.user?.email || tk('unknownUser')}</span>
                                                        <time dateTime={k.createdAt} className="shrink-0 text-[12px] text-ink-4">{fmt.date(k.createdAt)}</time>
                                                    </span>
                                                    <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                                                        <KycStatusBadge status={k.status} className="h-5 px-1.5 text-[11.5px]" />
                                                        {k.user?.role && <RoleChip role={k.user.role} />}
                                                        <span className="truncate">{docType(k.documentType)}</span>
                                                        {k.status === 'PENDING' && k.adminNotes?.startsWith('AI flagged') && <span className="text-[#B45309]">{tk('flagged')}</span>}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                </section>

                <section className={cn('rounded-xl bg-surface ring-1 ring-line min-h-[320px]', !selectedId && 'hidden lg:block')}>
                    {selectedId ? <KycDetail key={selectedId} id={selectedId} role={role} onBack={() => onSelect(null)} onChanged={changed} />
                        : (
                            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8">
                                <span className="w-11 h-11 rounded-xl bg-surface-2 ring-1 ring-line text-ink-3 flex items-center justify-center"><ShieldCheck size={20} aria-hidden /></span>
                                <p className="mt-3 text-[15px] font-semibold text-heading">{tk('pickTitle')}</p>
                                <p className="mt-1 text-[13.5px] text-ink-3 max-w-[44ch]">{tk('pickBody')}</p>
                            </div>
                        )}
                </section>
            </div>
        </div>
    );
}

/** Image source: private files through a one-hour signed URL; older submissions stored a direct URL. */
function useKycSrc(path: string | null) {
    const [state, setState] = React.useState({ src: null as string | null, failed: false });
    React.useEffect(() => {
        let live = true;
        setState({ src: null, failed: false });
        if (!path) return;
        if (path.startsWith('supabase://')) {
            kycApi.signedUrl(path).then((u) => { if (live) setState({ src: u, failed: !u }); }).catch(() => { if (live) setState({ src: null, failed: true }); });
        } else if (/^(https?:\/\/|\/(?!\/)|data:image\/)/i.test(path)) setState({ src: path, failed: false });
        else setState({ src: null, failed: true });
        return () => { live = false; };
    }, [path]);
    return state;
}

function KycImage({ path, label, onOpen }: { path: string; label: string; onOpen: (src: string, label: string) => void }) {
    const tk = useTk();
    const { src, failed } = useKycSrc(path);
    return (
        <figure className="space-y-1">
            <figcaption className="text-[12.5px] font-medium text-ink-3">{label}</figcaption>
            {failed ? (
                <div className="h-36 rounded-lg bg-surface-2 ring-1 ring-line flex flex-col items-center justify-center gap-1 text-[12.5px] text-ink-3"><ImageOff size={18} aria-hidden />{tk('imageFailed')}</div>
            ) : !src ? <Skeleton className="h-36" /> : (
                <button type="button" onClick={() => onOpen(src, label)} aria-label={tk('enlarge', { label })}
                    className="group relative block w-full h-36 rounded-lg overflow-hidden ring-1 ring-line bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <span className="absolute bottom-1.5 end-1.5 w-7 h-7 rounded-md bg-white/90 text-ink-2 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 motion-reduce:transition-none" aria-hidden><ZoomIn size={14} /></span>
                </button>
            )}
        </figure>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-x-4 gap-y-0.5 py-2 border-t border-line first:border-t-0">
            <dt className="text-[12.5px] text-ink-3">{label}</dt>
            <dd className="text-[13.5px] text-ink min-w-0">{children}</dd>
        </div>
    );
}

function KycDetail({ id, role, onBack, onChanged }: { id: string; role: string; onBack: () => void; onChanged: () => void }) {
    const tk = useTk();
    const { fmt } = useLanguage();
    const docType = useDocType();
    const canDecide = KYC_DECIDE_ROLES.includes(role);
    const [doc, setDoc] = React.useState(null as KycDoc | null);
    const [error, setError] = React.useState(null as { message: string; status?: number } | null);
    const [action, setAction] = React.useState(null as Action | null);
    const [viewer, setViewer] = React.useState(null as { src: string; label: string } | null);
    const [notice, setNotice] = React.useState(null as string | null);
    const when = (s: string) => fmt.date(s, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const load = React.useCallback(async () => {
        setError(null);
        try { setDoc(await kycApi.get(id)); } catch (e: any) { setError({ message: e?.message || tk('loadFailed'), status: e?.status }); }
    }, [id, tk]);
    React.useEffect(() => { load(); }, [load]);

    const back = (
        <button type="button" onClick={onBack} className="lg:hidden inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[13px] text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
            <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden />{tk('backToList')}
        </button>
    );
    if (error) return <div className="p-4 space-y-3">{back}{error.status === 404 ? <EmptyState icon={<ShieldCheck size={20} />} title={tk('notFound')}>{tk('notFoundBody')}</EmptyState> : <ErrorState message={error.message} onRetry={load} />}</div>;
    if (!doc) return <div className="p-4 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-36" /><Skeleton className="h-24" /></div>;

    const images = [
        { path: doc.frontImageUrl, label: tk('imgFront') },
        { path: doc.backImageUrl, label: tk('imgBack') },
        { path: doc.selfieUrl, label: tk('imgSelfie') },
    ].filter((i): i is { path: string; label: string } => !!i.path);

    return (
        <div className="flex flex-col">
            <header className="px-4 sm:px-5 py-3 border-b border-line flex flex-wrap items-start gap-3">
                {back}
                <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-semibold text-heading flex flex-wrap items-center gap-2">
                        {doc.user?.name || doc.user?.email || tk('unknownUser')}
                        {doc.user?.role && <RoleChip role={doc.user.role} />}
                        <KycStatusBadge status={doc.status} />
                    </h2>
                    {doc.user?.email && <p className="mt-0.5 text-[12.5px] text-ink-3"><bdi dir="ltr">{doc.user.email}</bdi></p>}
                </div>
                <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={load}>{tk('refresh')}</Button>
            </header>

            <div className="p-4 sm:p-5 space-y-4">
                {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}

                {canDecide ? (
                    doc.status === 'PENDING' ? (
                        <div className="rounded-lg bg-surface-2 ring-1 ring-line p-3 flex flex-wrap items-center gap-2">
                            <p className="text-[13px] text-ink-2 me-auto">{tk('actionsPending')}</p>
                            <Button size="sm" variant="danger" onClick={() => setAction('reject')}>{tk('reject')}</Button>
                            <Button size="sm" variant="brand" onClick={() => setAction('verify')}>{tk('approve')}</Button>
                        </div>
                    ) : doc.status === 'VERIFIED' ? (
                        <div className="rounded-lg bg-surface-2 ring-1 ring-line p-3 flex flex-wrap items-center gap-2">
                            <p className="text-[13px] text-ink-2 me-auto">{tk('actionsVerified')}</p>
                            <Button size="sm" variant="secondary" onClick={() => setAction('revoke')}>{tk('revoke')}</Button>
                        </div>
                    ) : <Notice tone="info">{tk('rejectedNote')}</Notice>
                ) : <Notice tone="info">{tk('viewOnly')}</Notice>}

                <Card title={tk('secDocument')} bodyClassName="pt-1">
                    <dl>
                        <Row label={tk('fType')}>{docType(doc.documentType)}</Row>
                        <Row label={tk('fSubmitted')}>{when(doc.createdAt)}</Row>
                        <Row label={tk('fUpdated')}>{when(doc.updatedAt)}</Row>
                        <Row label={tk('fScore')}>{doc.livenessScore != null ? <span className="tabular-nums">{fmt.number(doc.livenessScore, { style: 'percent', maximumFractionDigits: 0 })} <span className="text-ink-3 text-[12.5px]">· {tk('scoreHint')}</span></span> : <span className="text-ink-3">{tk('notRecorded')}</span>}</Row>
                        {doc.user && USER_DETAIL_ROLES.includes(role) && (
                            <Row label={tk('fAccount')}><Link href={`/admin/users/${encodeURIComponent(doc.user.id)}`} className="inline-flex items-center gap-1 text-teal font-medium hover:underline">{tk('openAccount')}<ExternalLink size={12} aria-hidden /></Link></Row>
                        )}
                    </dl>
                </Card>

                <Card title={tk('secImages')} description={tk('secImagesDesc')}>
                    {!images.length ? <p className="text-[13px] text-ink-3">{tk('noImages')}</p> : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {images.map((i) => <KycImage key={i.label} path={i.path} label={i.label} onOpen={(src, label) => setViewer({ src, label })} />)}
                        </div>
                    )}
                </Card>

                <Card title={tk('secNotes')} description={tk('secNotesDesc')}>
                    {doc.adminNotes ? <p className="text-[13px] text-ink whitespace-pre-wrap break-words">{doc.adminNotes}</p> : <p className="text-[13px] text-ink-3">{tk('noNotes')}</p>}
                </Card>
            </div>

            <Dialog open={!!viewer} onClose={() => setViewer(null)} size="xl" title={viewer?.label || ''} description={doc.user?.name || undefined}
                footer={viewer ? <a href={viewer.src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[13.5px] font-semibold ring-1 ring-inset ring-line-strong text-ink hover:bg-surface-2">{tk('openNewTab')}<ExternalLink size={14} aria-hidden /></a> : null}>
                {viewer && (
                    <div className="flex items-center justify-center bg-surface-2 rounded-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={viewer.src} alt={viewer.label} className="max-h-[70dvh] w-auto object-contain" referrerPolicy="no-referrer" />
                    </div>
                )}
            </Dialog>

            <ActionDialog doc={doc} action={action} onClose={() => setAction(null)}
                onDone={async (updated) => {
                    setAction(null);
                    setNotice(tk('doneStatus', { status: STATUS_TONE[updated.status] ? tk(`status_${updated.status}`) : updated.status }));
                    await load(); onChanged();
                }} />
        </div>
    );
}

/** Confirm approve / reject / revoke, stating what kyc.service.ts does for each. */
function ActionDialog({ doc, action, onClose, onDone }: { doc: KycDoc; action: Action | null; onClose: () => void; onDone: (d: KycDoc) => void }) {
    const tk = useTk();
    const [note, setNote] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null as string | null);
    React.useEffect(() => { if (action) { setNote(''); setError(null); } }, [action]);
    if (!action) return null;
    const close = () => { if (!busy) onClose(); };
    const required = action === 'reject';

    const run = async () => {
        if (required && !note.trim()) { setError(tk('reasonRequired')); return; }
        setBusy(true); setError(null);
        try {
            const r = action === 'verify' ? await kycApi.verify(doc.id, note.trim() || undefined)
                : action === 'reject' ? await kycApi.reject(doc.id, note.trim())
                    : await kycApi.revoke(doc.id, note.trim());
            onDone(r);
        } catch (e: any) { setError(e?.message || tk('actionFailed')); } finally { setBusy(false); }
    };

    return (
        <Dialog open onClose={close} dismissable={!busy} size="md"
            title={tk(`dlg_${action}_title`)} description={doc.user?.name || doc.user?.email || undefined}
            footer={<>
                <Button variant="secondary" onClick={close} disabled={busy}>{tk('cancel')}</Button>
                <Button variant={action === 'verify' ? 'brand' : 'danger'} loading={busy} onClick={run}>{tk(`dlg_${action}_confirm`)}</Button>
            </>}>
            <div className="space-y-4">
                <div className="text-[13.5px] text-ink-2">
                    <p className="font-medium text-heading">{tk('dlgWhat')}</p>
                    <ul className="mt-1.5 list-disc ps-5 space-y-1">
                        <li>{tk(`dlg_${action}_1`)}</li>
                        <li>{tk(`dlg_${action}_2`)}</li>
                        <li>{tk(`dlg_${action}_3`)}</li>
                    </ul>
                </div>
                <Field label={required ? tk('reasonLabel') : tk('noteLabel')} htmlFor="kyc-note" required={required} optional={!required} hint={tk(`dlg_${action}_hint`)} error={error}>
                    <textarea id="kyc-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000}
                        aria-invalid={!!error && required && !note.trim()} className={cn(inputCls, 'h-auto py-2 resize-y')} />
                </Field>
            </div>
        </Dialog>
    );
}
