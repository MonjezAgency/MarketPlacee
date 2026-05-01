'use client';

import * as React from 'react';
import { Mail, Search, Download, Trash2, Filter, Send, Users, Activity, CheckCircle2, Bot, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';

export default function NewsletterPage() {
    const [subscribers, setSubscribers] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isExporting, setIsExporting] = React.useState(false);
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [isSending, setIsSending] = React.useState(false);

    const fetchSubscribers = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/newsletter');
            if (res.ok) {
                const data = await res.json();
                setSubscribers(data);
            }
        } catch (error) {
            console.error('Failed to fetch subscribers:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchSubscribers();
    }, [fetchSubscribers]);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this subscriber?')) return;
        try {
            const res = await apiFetch(`/newsletter/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Subscriber removed');
                fetchSubscribers();
            } else {
                toast.error('Failed to remove subscriber');
            }
        } catch (error) {
            toast.error('Network error');
        }
    };

    const handleExport = () => {
        setIsExporting(true);
        // Simple CSV export logic
        const headers = ['Email', 'Date Joined', 'Source', 'Region', 'Status'];
        const csvContent = [
            headers.join(','),
            ...subscribers.map(s => [s.email, new Date(s.createdAt).toLocaleDateString(), s.source || 'N/A', s.region || 'N/A', s.status].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subscribers_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => setIsExporting(false), 1000);
    };

    const handleSendCampaign = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget as HTMLFormElement);
        const subject = (formData.get('subject') as string)?.trim();
        const content = (formData.get('content') as string)?.trim();

        if (!subject || !content) {
            toast.error('Please fill in both subject and content fields');
            return;
        }

        const activeSubs = subscribers.filter(s => s.status === 'ACTIVE');
        if (activeSubs.length === 0) {
            toast.error('No active subscribers to send the campaign to.');
            return;
        }

        setIsSending(true);
        try {
            const res = await apiFetch('/newsletter/send-campaign', {
                method: 'POST',
                body: JSON.stringify({ subject, content })
            });
            if (res.ok) {
                const result = await res.json();
                toast.success(`Campaign transmitted to ${result.successCount} of ${result.total} subscribers`, {
                    style: { borderRadius: '12px', background: '#0F172A', color: '#fff' },
                    duration: 5000,
                });
                setIsModalOpen(false);
            } else {
                let msg = 'Failed to send campaign';
                try {
                    const err = await res.json();
                    if (err?.message) msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
                } catch (_e) {}
                if (res.status === 401 || res.status === 403) {
                    msg = 'You don\'t have permission to send campaigns. Please log in as admin.';
                }
                toast.error(msg);
            }
        } catch (error) {
            toast.error('Network error - check your connection and try again');
        } finally {
            setIsSending(false);
        }
    };

    const filteredSubscribers = subscribers.filter(s => 
        s.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#0F172A] p-8 rounded-[32px] text-white relative overflow-hidden shadow-2xl border border-white/5">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-[#2EC4B6]/10 blur-[120px] -rotate-12" />
                <div className="relative z-10 space-y-2">
                    <div className="flex items-center gap-3 text-[#2EC4B6] mb-2">
                        <Mail size={20} />
                        <span className="text-[11px] font-black uppercase tracking-[0.4em]">Marketing Intelligence</span>
                    </div>
                    <h1 className="text-[36px] font-black tracking-tighter">Newsletter Hub</h1>
                    <p className="text-slate-400 text-sm max-w-md font-medium leading-relaxed">Manage your global marketing reach and subscriber base. Integration with AI-driven Resend campaigns.</p>
                </div>
                <div className="flex items-center gap-4 relative z-10">
                    <button 
                        onClick={handleExport}
                        disabled={isExporting || subscribers.length === 0}
                        className="h-[52px] px-8 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-3 disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        {isExporting ? 'Exporting...' : 'Export List'}
                    </button>
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="h-[52px] px-10 bg-[#2EC4B6] hover:brightness-110 text-[#0F172A] rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-2xl shadow-[#2EC4B6]/30 flex items-center gap-3 active:scale-95"
                    >
                        <Send size={18} /> Create Campaign
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Total Subscribers', value: subscribers.length.toLocaleString(), trend: '+ Real-time', icon: Users, color: '#2EC4B6' },
                    { label: 'Active Status', value: subscribers.filter(s => s.status === 'ACTIVE').length, trend: 'Verified', icon: CheckCircle2, color: '#10B981' },
                    { label: 'Open Rate', value: '42.5%', trend: '+5%', icon: Activity, color: '#3B82F6' },
                    { label: 'Unsubscribes', value: subscribers.filter(s => s.status === 'UNSUBSCRIBED').length, trend: 'Low', icon: Trash2, color: '#EF4444' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex items-center gap-5 hover:shadow-xl hover:border-[#2EC4B6]/30 transition-all duration-500 group">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: stat.color }}>
                            <stat.icon size={28} />
                        </div>
                        <div>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-[#0F172A]">{stat.value}</span>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>{stat.trend}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Subscribers Table */}
            <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
                <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="relative flex-1 max-w-xl">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input 
                            type="text" 
                            placeholder="Search by global business email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-[56px] pl-14 pr-6 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-[#2EC4B6] transition-all shadow-inner"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4">
                            <Loader2 size={40} className="animate-spin text-[#2EC4B6]" />
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Accessing subscriber database...</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="px-10 py-5 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100">Subscriber</th>
                                    <th className="px-10 py-5 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100">Date Joined</th>
                                    <th className="px-10 py-5 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100">Region</th>
                                    <th className="px-10 py-5 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100">Source</th>
                                    <th className="px-10 py-5 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100">Status</th>
                                    <th className="px-10 py-5 text-right text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredSubscribers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-10 py-20 text-center text-slate-400 font-bold italic">
                                            No subscribers found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSubscribers.map((sub) => (
                                        <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-10 py-6">
                                                <div className="flex items-center gap-4">
                                                    {sub.user ? (
                                                        <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200 overflow-hidden">
                                                            {sub.user.avatar ? (
                                                                <img src={sub.user.avatar} alt={sub.user.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-slate-500 font-black text-[14px]">{sub.user.name?.[0]?.toUpperCase()}</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="w-11 h-11 rounded-2xl bg-[#2EC4B6]/10 flex items-center justify-center text-[#2EC4B6] font-black text-[14px] border border-[#2EC4B6]/10">
                                                            {sub.email[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col">
                                                        <span className="text-[14px] font-black text-[#0F172A]">{sub.user ? sub.user.name : sub.email}</span>
                                                        <div className="flex items-center gap-2">
                                                            {sub.user && <span className="text-[10px] text-slate-500 font-medium">{sub.email}</span>}
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                                {sub.user ? sub.user.role : `${sub.region || 'Global'} Entity`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-10 py-6">
                                                <span className="text-[13px] text-slate-600 font-bold">{new Date(sub.createdAt).toLocaleDateString()}</span>
                                            </td>
                                            <td className="px-10 py-6">
                                                <span className="text-[12px] text-slate-500 font-black uppercase tracking-tighter">{sub.region || 'Global'}</span>
                                            </td>
                                            <td className="px-10 py-6">
                                                <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                                    {sub.source || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-10 py-6">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${sub.status === 'ACTIVE' ? 'bg-[#10B981]' : sub.status === 'BOUNCED' ? 'bg-amber-500' : 'bg-[#EF4444]'}`} />
                                                    <span className={`text-[12px] font-black uppercase tracking-widest ${sub.status === 'ACTIVE' ? 'text-[#10B981]' : sub.status === 'BOUNCED' ? 'text-amber-500' : 'text-[#EF4444]'}`}>
                                                        {sub.status}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-10 py-6 text-right">
                                                <button 
                                                    onClick={() => handleDelete(sub.id)}
                                                    className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-xl"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="p-8 bg-slate-50/50 border-t border-slate-100 text-center">
                    <p className="text-[13px] text-slate-400 font-bold uppercase tracking-widest">
                        Global Distribution: <span className="text-[#0F172A]">{subscribers.length} Verified Sourcing Contacts</span>
                    </p>
                </div>
            </div>

            {/* AI Teaser Card */}
            <div className="bg-[#0F172A] p-10 rounded-[32px] text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl relative overflow-hidden border border-white/5 group">
                <div className="absolute inset-0 bg-gradient-to-br from-[#2EC4B6]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10 space-y-3">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-[#2EC4B6] rounded-xl flex items-center justify-center text-[#0F172A]">
                            <Bot className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-[0.4em] text-[#2EC4B6]">AI Intelligence Layer</span>
                    </div>
                    <h3 className="text-2xl font-black tracking-tight">Predictive Campaign Analysis</h3>
                    <p className="text-slate-400 text-sm max-w-lg leading-relaxed font-medium">Coming Soon: Our AI will analyze your inventory changes and draft the perfect B2B announcement for your buyers automatically.</p>
                </div>
                <button className="relative z-10 px-10 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[12px] font-black uppercase tracking-[0.2em] transition-all">
                    Unlock Premium Insights
                </button>
            </div>

            {/* Create Campaign Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#2EC4B6]/10 rounded-xl flex items-center justify-center text-[#2EC4B6]">
                                        <Send size={20} />
                                    </div>
                                    <h2 className="text-[20px] font-black text-[#0F172A] tracking-tight">New Marketing Campaign</h2>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                                    <X size={24} className="text-slate-400" />
                                </button>
                            </div>
                            <form onSubmit={handleSendCampaign} className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Campaign Subject</label>
                                    <input 
                                        required
                                        name="subject"
                                        placeholder="e.g. Exclusive Wholesale Offer - May 2024"
                                        className="w-full h-[56px] px-6 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-[#2EC4B6] transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Email Content (B2B Professional)</label>
                                    <textarea 
                                        required
                                        name="content"
                                        rows={6}
                                        placeholder="Draft your professional message here..."
                                        className="w-full p-6 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-medium outline-none focus:bg-white focus:border-[#2EC4B6] transition-all resize-none"
                                    />
                                </div>
                                <div className="flex items-center justify-between pt-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Targeting {subscribers.length} Verified Buyers</span>
                                    </div>
                                    <button 
                                        type="submit"
                                        disabled={isSending}
                                        className="h-[56px] px-10 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-3 disabled:opacity-50"
                                    >
                                        {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                        {isSending ? 'Transmitting...' : 'Execute Campaign'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
