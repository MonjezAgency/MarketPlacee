'use client';

import * as React from 'react';
import { ClipboardCheck, AlertTriangle, CheckCircle2, XCircle, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Inspection } from '@/lib/order-workflow';

const STATUS_STYLE: Record<Inspection['status'], { tone: string; icon: React.ElementType }> = {
    SCHEDULED: { tone: 'bg-surface-3 text-ink-2', icon: CalendarClock },
    PASSED: { tone: 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300', icon: CheckCircle2 },
    PASSED_WITH_FINDINGS: { tone: 'bg-[#FFFBEB] text-[#B45309] dark:bg-amber-500/15 dark:text-amber-300', icon: AlertTriangle },
    FAILED: { tone: 'bg-[#FEF2F2] text-[#B91C1C] dark:bg-red-500/15 dark:text-red-300', icon: XCircle },
};
const UNIT_KEY: Record<string, string> = { carton: 'lineCarton', case: 'lineCarton', pallet: 'linePallet', truck: 'lineTruck' };

/** A recorded inspection: what was checked, what was found, and how it was resolved. */
export function InspectionReport({ inspection: i }: { inspection: Inspection }) {
    const { t, fmt } = useLanguage();
    const s = STATUS_STYLE[i.status];
    const qty = (n: number, unit: string) => (UNIT_KEY[unit] ? t('orders', UNIT_KEY[unit], { count: n }) : fmt.number(n));
    return (
        <article className="rounded-2xl ring-1 ring-line bg-surface p-4 sm:p-5">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-teal-soft text-teal flex items-center justify-center" aria-hidden><ClipboardCheck size={17} /></span>
                    <div>
                        <h4 className="font-sans text-[15px] font-semibold text-heading">{t('inspection', 'title')}</h4>
                        <p className="text-[12.5px] text-ink-3">
                            {i.inspectedAt ? t('inspection', 'inspectedOn', { date: fmt.date(i.inspectedAt) }) : t('inspection', 'notYet')}{i.inspectorName ? ` · ${i.inspectorName}` : ''}
                        </p>
                    </div>
                </div>
                <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold', s.tone)}><s.icon size={13} aria-hidden /> {t('inspection', `status${i.status}`)}</span>
            </header>

            {i.lines.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead><tr className="text-ink-3 border-b border-line"><th scope="col" className="py-2 pe-3 text-start font-medium">{t('inspection', 'product')}</th><th scope="col" className="py-2 pe-3 text-end font-medium">{t('inspection', 'ordered')}</th><th scope="col" className="py-2 text-end font-medium">{t('inspection', 'received')}</th></tr></thead>
                        <tbody>
                            {i.lines.map((l) => (
                                <tr key={l.itemId} className="border-b border-line last:border-0">
                                    <td className="py-2 pe-3 text-ink">{l.name}</td>
                                    <td className="py-2 pe-3 text-end tabular-nums text-ink-2">{qty(l.ordered, l.unit)}</td>
                                    <td className={cn('py-2 text-end tabular-nums font-medium', l.received < l.ordered ? 'text-[#B45309]' : 'text-ink')}>{fmt.number(l.received)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {i.findings.length > 0 && (
                <ul className="mt-4 space-y-2">
                    {i.findings.map((f, n) => (
                        <li key={n} className="rounded-xl bg-surface-2 p-3 text-[13px]">
                            <p className="font-semibold text-ink">{t('inspection', `finding${f.type}`)}{f.name ? <span className="font-normal text-ink-3"> · {f.name}</span> : null}</p>
                            <p className="text-ink-2 mt-0.5">{f.note}</p>
                        </li>
                    ))}
                </ul>
            )}

            {i.photos.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {i.photos.map((u, n) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden ring-1 ring-line">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt={t('inspection', 'photoAlt', { n: n + 1 })} className="w-full h-full object-cover" />
                        </a>
                    ))}
                </div>
            )}

            <footer className="mt-4 border-t border-line pt-3 text-[13px]">
                <p><span className="text-ink-3">{t('inspection', 'outcome')}:</span> <span className="font-semibold text-ink">{t('inspection', `resolution${i.resolution || 'PENDING'}`)}</span></p>
                {i.resolutionNote && <p className="mt-1 text-ink-2">{i.resolutionNote}</p>}
            </footer>
        </article>
    );
}
