'use client';

/**
 * Admin Email Analytics — full visibility into who opened / clicked
 * every email the platform sent. Built on top of the EmailEvent
 * append-only log: each campaign / offer blast attaches a unique
 * tracking id to a 1×1 pixel + wraps every link, so opens and
 * clicks land in the DB automatically.
 *
 * Layout:
 *   - Top KPI strip: Sent / Opened / Clicked / Open-rate / Click-rate
 *   - 30-day trend chart (sent vs opened vs clicked)
 *   - Per-campaign table (open-rate + click-rate) with click-through
 *     to per-recipient drill-down
 *   - Per-offer table
 *   - Top 10 most-engaged recipients
 */

import * as React from 'react';
import {
    Mail, Eye, MousePointer2, Send, TrendingUp, Loader2, Users, Activity, Beaker,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface Overview {
    windowDays: number;
    totals: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number };
    campaigns: Array<{ id: string; subject?: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number }>;
    offers: Array<{ id: string; subject?: string; sent: number; opened: number; clicked: number; openRate: number; clickRate: number }>;
    topRecipients: Array<{ recipient: string; opens: number }>;
    trend: Array<{ day: string; sent: number; opened: number; clicked: number }>;
}

export default function EmailAnalyticsPage() {
    const [data, setData] = React.useState<Overview | null>(null);
    const [days, setDays] = React.useState(30);
    const [isLoading, setIsLoading] = React.useState(true);

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch(`/email/analytics/overview?days=${days}`);
            if (res.ok) setData(await res.json());
        } finally {
            setIsLoading(false);
        }
    }, [days]);

    React.useEffect(() => { fetchData(); }, [fetchData]);

    // Send-test-email diagnostic.
    // Hits POST /offers/send-test-email which renders the real
    // offer-blast template, registers a tracking id, wraps the
    // click links + injects the pixel, and forwards to Resend.
    // Operator uses it to verify the whole pipeline (delivery →
    // open tracking → analytics row) without waiting for a real
    // supplier submission. Defaults to the operator's QA address.
    const [testTo, setTestTo] = React.useState('monjez@monjez-agency.com');
    const [isTesting, setIsTesting] = React.useState(false);
    const handleSendTest = async () => {
        const target = testTo.trim();
        if (!target) {
            toast.error('Enter a recipient email.');
            return;
        }
        setIsTesting(true);
        const tid = toast.loading(`Sending test offer email to ${target}…`);
        try {
            const res = await apiFetch('/offers/send-test-email', {
                method: 'POST',
                body: JSON.stringify({ to: target }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.ok) {
                toast.success(
                    `Sent to ${target}. Tracking id: ${data.trackingId?.slice(0, 8) || 'logged'}. Refresh the dashboard in ~30s to see the row.`,
                    { id: tid, duration: 7000 },
                );
                // Auto-refresh shortly after so the new send shows up
                setTimeout(() => fetchData(), 3000);
            } else {
                toast.error(`Send failed: ${data?.error || data?.message || 'unknown error'}`, { id: tid });
            }
        } catch (err: any) {
            toast.error(`Network error: ${err?.message || ''}`, { id: tid });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-16">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2EC4B6]">Marketing</p>
                    <h1 className="text-[28px] font-black tracking-tight text-[#0F172A]">Email Analytics</h1>
                    <p className="text-[13px] text-slate-500 mt-1 max-w-xl">Open and click tracking across every campaign and offer blast. Backed by the EmailEvent log — each row is a real recipient interaction.</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    {[7, 30, 90].map(d => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={cn(
                                'h-10 px-4 rounded-lg text-[12px] font-black uppercase tracking-widest',
                                days === d ? 'bg-white shadow-sm text-[#0F172A]' : 'text-slate-500 hover:text-slate-700',
                            )}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Send Test Email diagnostic ──
                Fires a real offer-template email at any address so
                the operator can verify the full pipeline (Resend
                delivery + open pixel + click rewrites + analytics
                row). Uses the same registerSentEmail → wrapLinks →
                trackingPixelHtml path the production blast uses, so
                a successful test = production is verified. */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100 flex items-center justify-center flex-shrink-0">
                        <Beaker size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-900">Send a test offer email</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            Real template, real tracking. The row lands in the dashboard once Resend confirms delivery.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                        type="email"
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                        placeholder="recipient@example.com"
                        className="flex-1 sm:w-64 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <button
                        onClick={handleSendTest}
                        disabled={isTesting || !testTo.trim()}
                        className="h-10 px-5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-bold uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        Send Test
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#2EC4B6]" size={28} /></div>
            ) : !data ? (
                <p className="text-slate-400">Failed to load analytics.</p>
            ) : (
                <>
                    {/* KPI strip */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <KpiCard label="Sent"        value={data.totals.sent.toLocaleString()}     icon={Send}          color="#0F172A" />
                        <KpiCard label="Opened"      value={data.totals.opened.toLocaleString()}   icon={Eye}           color="#2EC4B6" />
                        <KpiCard label="Clicked"     value={data.totals.clicked.toLocaleString()}  icon={MousePointer2} color="#8B5CF6" />
                        <KpiCard label="Open rate"   value={`${data.totals.openRate}%`}            icon={TrendingUp}    color="#10B981" />
                        <KpiCard label="Click rate"  value={`${data.totals.clickRate}%`}           icon={Activity}      color="#F59E0B" />
                    </div>

                    {/* Trend chart */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[12px] font-black uppercase tracking-widest text-slate-500">
                                Trend · last {data.windowDays} days
                            </p>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-bold">
                                <Legend dot="#0F172A" label="Sent" />
                                <Legend dot="#2EC4B6" label="Opened" />
                                <Legend dot="#8B5CF6" label="Clicked" />
                            </div>
                        </div>
                        <div style={{ height: 240 }}>
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
                                    <Area type="monotone" dataKey="sent"     stroke="#0F172A" strokeWidth={2} fill="transparent" />
                                    <Area type="monotone" dataKey="opened"   stroke="#2EC4B6" strokeWidth={3} fill="url(#g-opened)" />
                                    <Area type="monotone" dataKey="clicked"  stroke="#8B5CF6" strokeWidth={2} fill="transparent" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Per-campaign + per-offer tables */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <DataTable title="Campaigns" rows={data.campaigns} emptyHint="No newsletter campaigns sent yet." />
                        <DataTable title="Offer blasts" rows={data.offers} emptyHint="No supplier offers blasted yet." />
                    </div>

                    {/* Most-engaged recipients */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Users size={16} className="text-slate-400" />
                            <p className="text-[12px] font-black uppercase tracking-widest text-slate-500">Top 10 most-engaged recipients</p>
                        </div>
                        {data.topRecipients.length === 0 ? (
                            <p className="text-[13px] text-slate-400 italic">No opens recorded in this window.</p>
                        ) : (
                            <table className="w-full">
                                <tbody className="divide-y divide-slate-100">
                                    {data.topRecipients.map((r, i) => (
                                        <tr key={r.recipient}>
                                            <td className="py-2 text-[12px] text-slate-400 w-10">#{i + 1}</td>
                                            <td className="py-2 text-[13px] font-bold text-[#0F172A]">{r.recipient}</td>
                                            <td className="py-2 text-right text-[13px] font-black text-[#2EC4B6]">
                                                {r.opens} open{r.opens === 1 ? '' : 's'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
    title,
    rows,
    emptyHint,
}: {
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
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <th className="px-5 py-2 text-left">Subject</th>
                            <th className="px-5 py-2 text-right">Sent</th>
                            <th className="px-5 py-2 text-right">Open</th>
                            <th className="px-5 py-2 text-right">Click</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50/60">
                                <td className="px-5 py-2.5 text-[12px] font-bold text-[#0F172A] truncate max-w-[260px]">{r.subject || r.id.slice(0, 8)}</td>
                                <td className="px-5 py-2.5 text-right text-[12px] font-bold tabular-nums">{r.sent}</td>
                                <td className="px-5 py-2.5 text-right text-[12px]">
                                    <span className="font-bold text-[#0F172A]">{r.opened}</span>
                                    <span className="text-[10px] text-emerald-600 font-bold ml-1">{r.openRate}%</span>
                                </td>
                                <td className="px-5 py-2.5 text-right text-[12px]">
                                    <span className="font-bold text-[#0F172A]">{r.clicked}</span>
                                    <span className="text-[10px] text-violet-600 font-bold ml-1">{r.clickRate}%</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
