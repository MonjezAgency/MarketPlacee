'use client';

/**
 * Admin Email Analytics — opens / clicks recorded in the EmailEvent log for
 * newsletter campaigns and offer emails (dictionary section `adminEmailTools`).
 * Opens come from a tracking pixel and are approximate; the page says so.
 *
 * Layout:
 *   - Top KPI strip: Sent / Opened / Clicked / Open-rate / Click-rate
 *   - Trend chart (sent vs opened vs clicked) for the selected window
 *   - Per-campaign and per-offer tables
 *   - Top 10 most-engaged recipients
 */

import * as React from 'react';
import {
    Eye, MousePointer2, Send, TrendingUp, Loader2, Users, Activity, Beaker,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { ErrorState } from '@/components/supplier/ui';

interface Overview {
    windowDays: number;
    totals: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number };
    campaigns: Array<{ id: string; subject?: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number }>;
    offers: Array<{ id: string; subject?: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number }>;
    topRecipients: Array<{ recipient: string; opens: number }>;
    trend: Array<{ day: string; sent: number; opened: number; clicked: number }>;
}

type Tk = (k: string, v?: Record<string, string | number>) => string;

export default function EmailAnalyticsPage() {
    const { t, fmt } = useLanguage();
    const tk: Tk = React.useCallback((k: string, v?: Record<string, string | number>) => t('adminEmailTools', k, v), [t]);
    const [data, setData] = React.useState<Overview | null>(null);
    const [days, setDays] = React.useState(30);
    const [isLoading, setIsLoading] = React.useState(true);

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch(`/email/analytics/overview?days=${days}`);
            setData(res.ok ? await res.json() : null);
        } catch {
            setData(null);
        } finally {
            setIsLoading(false);
        }
    }, [days]);

    React.useEffect(() => { fetchData(); }, [fetchData]);

    // Send-test-email diagnostic: POST /offers/send-test-email renders the
    // real offer template (sample content unless an offerId is passed),
    // registers a tracking id and sends it to the one address typed here.
    const [testTo, setTestTo] = React.useState('');
    const [isTesting, setIsTesting] = React.useState(false);
    const handleSendTest = async () => {
        const target = testTo.trim();
        if (!target) {
            toast.error(tk('testNeedEmail'));
            return;
        }
        setIsTesting(true);
        const tid = toast.loading(tk('testSending', { email: target }));
        try {
            const res = await apiFetch('/offers/send-test-email', {
                method: 'POST',
                body: JSON.stringify({ to: target }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.ok && body?.ok) {
                toast.success(tk('testSent', { email: target }), { id: tid, duration: 7000 });
                setTimeout(() => fetchData(), 3000);
            } else {
                const reason = body?.error || (typeof body?.message === 'string' ? body.message : '');
                toast.error(reason ? tk('notSent', { reason }) : tk('notSentUnknown'), { id: tid });
            }
        } catch {
            toast.error(tk('networkError'), { id: tid });
        } finally {
            setIsTesting(false);
        }
    };

    const n = (v: number) => fmt.number(v);

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-16 text-start">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2EC4B6]">{tk('eyebrow')}</p>
                    <h1 className="text-[28px] font-black tracking-tight text-[#0F172A]">{tk('title')}</h1>
                    <p className="text-[13px] text-slate-500 mt-1 max-w-xl">{tk('intro')}</p>
                </div>
                <div role="group" aria-label={tk('windowAria')} className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    {[7, 30, 90].map(d => (
                        <button
                            key={d}
                            type="button"
                            aria-pressed={days === d}
                            onClick={() => setDays(d)}
                            className={cn(
                                'h-10 px-4 rounded-lg text-[12px] font-bold',
                                days === d ? 'bg-white shadow-sm text-[#0F172A]' : 'text-slate-500 hover:text-slate-700',
                            )}
                        >
                            {tk('windowOption', { days: d })}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100 flex items-center justify-center flex-shrink-0">
                        <Beaker size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-900">{tk('testTitle')}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{tk('testHint')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                        type="email"
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                        placeholder={tk('testEmailLabel')}
                        aria-label={tk('testEmailLabel')}
                        className="flex-1 sm:w-64 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <button
                        type="button"
                        onClick={handleSendTest}
                        disabled={isTesting || !testTo.trim()}
                        className="h-10 px-5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {tk('testButton')}
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#2EC4B6]" size={28} /></div>
            ) : !data ? (
                <ErrorState message={tk('loadFailed')} onRetry={fetchData} />
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <KpiCard label={tk('kpiSent')} value={n(data.totals.sent)} icon={Send} color="#0F172A" />
                        <KpiCard label={tk('kpiOpened')} value={n(data.totals.opened)} icon={Eye} color="#2EC4B6" />
                        <KpiCard label={tk('kpiClicked')} value={n(data.totals.clicked)} icon={MousePointer2} color="#8B5CF6" />
                        <KpiCard label={tk('kpiOpenRate')} value={`${n(data.totals.openRate)}%`} icon={TrendingUp} color="#10B981" />
                        <KpiCard label={tk('kpiClickRate')} value={`${n(data.totals.clickRate)}%`} icon={Activity} color="#F59E0B" />
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <p className="text-[12px] font-black uppercase tracking-widest text-slate-500">
                                {tk('trendTitle', { days: data.windowDays })}
                            </p>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-bold">
                                <Legend dot="#0F172A" label={tk('kpiSent')} />
                                <Legend dot="#2EC4B6" label={tk('kpiOpened')} />
                                <Legend dot="#8B5CF6" label={tk('kpiClicked')} />
                            </div>
                        </div>
                        <div style={{ height: 240 }} dir="ltr">
                            <ResponsiveContainer>
                                <AreaChart data={data.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="g-opened" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#2EC4B6" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#2EC4B6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748B' }} />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                                    <Area type="monotone" dataKey="sent" name={tk('kpiSent')} stroke="#0F172A" strokeWidth={2} fill="transparent" />
                                    <Area type="monotone" dataKey="opened" name={tk('kpiOpened')} stroke="#2EC4B6" strokeWidth={3} fill="url(#g-opened)" />
                                    <Area type="monotone" dataKey="clicked" name={tk('kpiClicked')} stroke="#8B5CF6" strokeWidth={2} fill="transparent" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <DataTable tk={tk} title={tk('campaigns')} rows={data.campaigns} emptyHint={tk('campaignsEmpty')} />
                        <DataTable tk={tk} title={tk('offers')} rows={data.offers} emptyHint={tk('offersEmpty')} />
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Users size={16} className="text-slate-400" />
                            <p className="text-[12px] font-black uppercase tracking-widest text-slate-500">{tk('topTitle')}</p>
                        </div>
                        {data.topRecipients.length === 0 ? (
                            <p className="text-[13px] text-slate-400 italic">{tk('topEmpty')}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <tbody className="divide-y divide-slate-100">
                                        {data.topRecipients.map((r, i) => (
                                            <tr key={r.recipient}>
                                                <td className="py-2 text-[12px] text-slate-400 w-10 tabular-nums">{i + 1}</td>
                                                <td className="py-2 text-[13px] font-bold text-[#0F172A]"><bdi dir="ltr">{r.recipient}</bdi></td>
                                                <td className="py-2 text-end text-[13px] font-black text-[#2EC4B6]">
                                                    {tk('opens', { count: r.opens })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: color }}>
                <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className="text-[18px] font-black text-[#0F172A] mt-0.5 truncate">{value}</p>
            </div>
        </div>
    );
}

function Legend({ dot, label }: { dot: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />
            {label}
        </span>
    );
}

function DataTable({
    tk,
    title,
    rows,
    emptyHint,
}: {
    tk: Tk;
    title: string;
    rows: Array<{ id: string; subject?: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number }>;
    emptyHint: string;
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                <p className="text-[12px] font-black uppercase tracking-widest text-slate-500">{title}</p>
            </div>
            {rows.length === 0 ? (
                <p className="text-[13px] text-slate-400 italic px-5 py-6">{emptyHint}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px]">
                        <thead>
                            <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <th className="px-5 py-2 text-start">{tk('colSubject')}</th>
                                <th className="px-5 py-2 text-end">{tk('colSent')}</th>
                                <th className="px-5 py-2 text-end">{tk('colOpened')}</th>
                                <th className="px-5 py-2 text-end">{tk('colClicked')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(r => (
                                <tr key={r.id} className="hover:bg-slate-50/60">
                                    <td className="px-5 py-2.5 text-[12px] font-bold text-[#0F172A] truncate max-w-[260px]">{r.subject || r.id.slice(0, 8)}</td>
                                    <td className="px-5 py-2.5 text-end text-[12px] font-bold tabular-nums">{r.sent}</td>
                                    <td className="px-5 py-2.5 text-end text-[12px]">
                                        <span className="font-bold text-[#0F172A]">{r.opened}</span>
                                        <span className="text-[10px] text-emerald-600 font-bold ms-1">{r.openRate}%</span>
                                    </td>
                                    <td className="px-5 py-2.5 text-end text-[12px]">
                                        <span className="font-bold text-[#0F172A]">{r.clicked}</span>
                                        <span className="text-[10px] text-violet-600 font-bold ms-1">{r.clickRate}%</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
