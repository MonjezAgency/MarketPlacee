'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Copy, Mail, Plus, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Skeleton, useConfirm } from '@/components/supplier/ui';
import { newsletterApi, type CampaignRow } from '@/lib/admin-newsletter-api';
import { CampaignStatusBadge, useInt, useTn, useWhen } from './newsletterUi';

/**
 * Campaign history with real statuses. "Accepted" = accepted by the email
 * provider; delivery and bounces are not reported back, so they are shown as
 * not available. Opens/clicks come from Ali FMCG's own tracking pixel and links.
 */
export function CampaignsPanel() {
    const tn = useTn();
    const int = useInt();
    const when = useWhen();
    const router = useRouter();
    const confirm = useConfirm();
    const [rows, setRows] = React.useState<CampaignRow[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);

    const load = React.useCallback(() => {
        setError(null);
        newsletterApi.campaigns().then(setRows).catch((e) => setError(e?.message || tn('loadFailed')));
    }, [tn]);
    React.useEffect(() => { load(); }, [load]);
    // Refresh while something is sending.
    React.useEffect(() => {
        if (!rows?.some((r) => r.status === 'SENDING')) return;
        const h = setInterval(load, 5000);
        return () => clearInterval(h);
    }, [rows, load]);

    const duplicate = async (id: string) => {
        setBusy(id);
        try { const c = await newsletterApi.duplicateCampaign(id); router.push(`/admin/newsletter/campaign?id=${c.id}`); }
        catch (e: any) { toast.error(e?.message || tn('actionFailed')); setBusy(null); }
    };
    const remove = async (r: CampaignRow) => {
        if (!(await confirm({ title: tn('deleteDraftTitle'), body: r.subject || tn('untitled'), confirm: tn('deleteDraft'), tone: 'danger' }))) return;
        setBusy(r.id);
        try { await newsletterApi.deleteCampaign(r.id); load(); } catch (e: any) { toast.error(e?.message || tn('actionFailed')); } finally { setBusy(null); }
    };

    return (
        <Card bodyClassName="p-0" title={tn('campaignsTitle')} description={tn('campaignsDesc')}
            actions={<Link href="/admin/newsletter/campaign" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-cta text-cta-fg hover:bg-cta-hover text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-1"><Plus size={14} />{tn('newCampaign')}</Link>}>
            {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : !rows ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : rows.length === 0 ? (
                <EmptyState icon={<Mail size={20} />} title={tn('noCampaigns')}>{tn('noCampaignsBody')}</EmptyState>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-[13px]">
                        <thead>
                            <tr className="text-[12px] text-ink-3 border-b border-line">
                                <th className="py-2.5 px-4 text-start font-medium">{tn('colCampaign')}</th>
                                <th className="py-2.5 px-3 text-start font-medium">{tn('colStatus')}</th>
                                <th className="py-2.5 px-3 text-end font-medium">{tn('colRecipients')}</th>
                                <th className="py-2.5 px-3 text-end font-medium">{tn('colAccepted')}</th>
                                <th className="py-2.5 px-3 text-end font-medium">{tn('colFailed')}</th>
                                <th className="py-2.5 px-3 text-start font-medium">{tn('colDelivery')}</th>
                                <th className="py-2.5 px-3 text-end font-medium">{tn('colTracked')}</th>
                                <th className="py-2.5 px-3 text-start font-medium">{tn('colWhen')}</th>
                                <th className="py-2.5 px-4"><span className="sr-only">{tn('colActions')}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const draft = r.status === 'DRAFT';
                                return (
                                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                                        <td className="py-2.5 px-4">
                                            <Link href={`/admin/newsletter/campaign?id=${r.id}`} className="font-medium text-ink hover:text-teal">{r.subject || tn('untitled')}</Link>
                                            <span className="block text-[12px] text-ink-3">{r.legacy ? tn('legacyCampaign') : `${tn(`template_${r.template || 'BLANK'}`)} · ${tn(`aud_${r.audienceSpec?.audience || r.audience || 'NEWSLETTER'}`)}`}</span>
                                        </td>
                                        <td className="py-2.5 px-3"><CampaignStatusBadge status={r.status} />{r.lastError && r.status !== 'SENT' && <span className="block mt-0.5 text-[12px] text-red-700 max-w-[16rem] truncate" title={r.lastError}>{r.lastError}</span>}</td>
                                        <td className="py-2.5 px-3 text-end tabular-nums">{draft ? '—' : int(r.totalCount)}</td>
                                        <td className="py-2.5 px-3 text-end tabular-nums">{draft ? '—' : int(r.sentCount)}</td>
                                        <td className="py-2.5 px-3 text-end tabular-nums">{draft || r.legacy ? '—' : int(r.failedCount)}</td>
                                        <td className="py-2.5 px-3 text-ink-3">{draft ? '—' : tn('notReported')}</td>
                                        <td className="py-2.5 px-3 text-end tabular-nums text-ink-2">{draft ? '—' : tn('trackedCounts', { opens: int(r.tracking.opens), clicks: int(r.tracking.clicks) })}</td>
                                        <td className="py-2.5 px-3 text-ink-3 whitespace-nowrap tabular-nums">{draft ? tn('editedAt', { when: when(r.updatedAt) || '' }) : when(r.sentAt || r.sendStartedAt || r.createdAt)}</td>
                                        <td className="py-2.5 px-4">
                                            <div className="flex justify-end gap-1">
                                                {!r.legacy && <Button size="sm" variant="ghost" aria-label={tn('duplicate')} title={tn('duplicate')} disabled={busy === r.id} onClick={() => duplicate(r.id)} icon={<Copy size={14} />} />}
                                                {draft && <Button size="sm" variant="ghost" aria-label={tn('deleteDraft')} title={tn('deleteDraft')} disabled={busy === r.id} onClick={() => remove(r)} icon={<Trash2 size={14} />} />}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="px-4 py-3 border-t border-line text-[12px] text-ink-3">{tn('historyFootnote')}</p>
        </Card>
    );
}
