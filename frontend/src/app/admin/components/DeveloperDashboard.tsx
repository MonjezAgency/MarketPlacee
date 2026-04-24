'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { 
    Activity, Shield, Server, Database, 
    Cpu, HardDrive, Terminal, Zap,
    Lock, AlertTriangle, CheckCircle2,
    BarChart3, RefreshCw, Code2, Globe,
    Search, Filter, ExternalLink, ChevronRight
} from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, 
    Tooltip, ResponsiveContainer, LineChart, Line,
    BarChart, Bar
} from 'recharts';
import { cn } from '@/lib/utils';

const MOCK_TRAFFIC = [
    { time: '00:00', requests: 450, latency: 45 },
    { time: '04:00', requests: 300, latency: 42 },
    { time: '08:00', requests: 800, latency: 68 },
    { time: '12:00', requests: 1200, latency: 85 },
    { time: '16:00', requests: 950, latency: 72 },
    { time: '20:00', requests: 600, latency: 50 },
    { time: '23:59', requests: 500, latency: 48 },
];

const LOGS = [
    { id: 1, level: 'INFO', service: 'AUTH', message: 'JWT Token rotation successful for user_8429', time: '2 mins ago' },
    { id: 2, level: 'WARN', service: 'PAYMENTS', message: 'Stripe webhook retry detected for evt_3842', time: '5 mins ago' },
    { id: 3, level: 'ERROR', service: 'STORAGE', message: 'Supabase bucket limit approaching (85%)', time: '12 mins ago' },
    { id: 4, level: 'INFO', service: 'CRON', message: 'Inventory sync completed (4,291 items)', time: '20 mins ago' },
    { id: 5, level: 'INFO', service: 'CDN', message: 'Edge cache cleared for /static/assets/*', time: '45 mins ago' },
];

export default function DeveloperDashboard() {
    return (
        <div className="space-y-8 animate-in fade-in duration-1000 pb-20">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-teal-500 mb-1">
                        <Terminal size={14} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">System Engine v4.2</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">Technical Overview</h1>
                    <p className="text-sm text-slate-500 font-medium">Real-time infrastructure health and system-wide security monitoring.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[11px] font-black text-emerald-600 uppercase">System Operational</span>
                    </div>
                    <button className="h-10 px-4 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all">
                        <RefreshCw size={14} /> Force Sync
                    </button>
                </div>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'CPU Usage', value: '14.2%', sub: 'Optimized', icon: Cpu, color: 'text-blue-500', bg: 'bg-blue-50' },
                    { label: 'Memory', value: '2.4 GB', sub: 'of 8.0 GB', icon: HardDrive, color: 'text-purple-500', bg: 'bg-purple-50' },
                    { label: 'Latency', value: '42ms', sub: 'P95 Response', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50' },
                    { label: 'Errors', value: '0.04%', sub: 'Last 24h', icon: Shield, color: 'text-teal-500', bg: 'bg-teal-50' },
                ].map((stat, i) => (
                    <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm group hover:border-teal-500/30 transition-all"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", stat.bg)}>
                                <stat.icon size={20} className={stat.color} />
                            </div>
                            <Activity size={16} className="text-slate-200" />
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                        <h3 className="text-2xl font-black text-slate-900 mt-1">{stat.value}</h3>
                        <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tight">{stat.sub}</p>
                    </motion.div>
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-12 gap-8">
                
                {/* Traffic & Latency (LEFT - 65%) */}
                <div className="col-span-12 lg:col-span-8 space-y-8">
                    
                    {/* Traffic Visualization */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden relative">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-base font-black text-slate-900 uppercase italic">Network Traffic</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">Requests per hour across API gateway</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-teal-500 rounded-full" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Requests</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Latency</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={MOCK_TRAFFIC}>
                                    <defs>
                                        <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#0F172A', border: 'none', borderRadius: '12px', padding: '12px' }}
                                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                        labelStyle={{ color: '#94a3b8', marginBottom: '4px', fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase' }}
                                    />
                                    <Area type="monotone" dataKey="requests" stroke="#14B8A6" strokeWidth={3} fillOpacity={1} fill="url(#colorRequests)" />
                                    <Area type="monotone" dataKey="latency" stroke="#3B82F6" strokeWidth={2} fill="transparent" strokeDasharray="5 5" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* System Services Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { name: 'Database Cluster', status: 'HEALTHY', uptime: '99.99%', load: '22%', icon: Database, color: 'teal' },
                            { name: 'Storage (S3)', status: 'HEALTHY', uptime: '100%', load: '85%', icon: Server, color: 'blue' },
                            { name: 'Auth Gateway', status: 'HEALTHY', uptime: '99.98%', load: '14%', icon: Lock, color: 'purple' },
                        ].map((svc, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50", `text-${svc.color}-500`)}>
                                        <svc.icon size={16} />
                                    </div>
                                    <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{svc.name}</span>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Uptime</p>
                                        <p className="text-sm font-black text-slate-900">{svc.uptime}</p>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full transition-all", `bg-${svc.color}-500`)} style={{ width: svc.load }} />
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
                                        <span className="text-slate-400">Load Factor</span>
                                        <span className="text-slate-900">{svc.load}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Terminal Logs */}
                    <div className="bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/5">
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                                </div>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Console Output</span>
                            </div>
                            <button className="text-[10px] font-black text-teal-500 uppercase tracking-widest hover:text-teal-400 transition-colors">Clear Logs</button>
                        </div>
                        <div className="p-6 font-mono text-[11px] space-y-3 max-h-[300px] overflow-y-auto no-scrollbar">
                            {LOGS.map(log => (
                                <div key={log.id} className="flex gap-4 group">
                                    <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                                    <span className={cn(
                                        "shrink-0 font-bold",
                                        log.level === 'ERROR' ? "text-red-400" : log.level === 'WARN' ? "text-amber-400" : "text-blue-400"
                                    )}>{log.level}</span>
                                    <span className="text-teal-500/80 shrink-0">@{log.service}</span>
                                    <span className="text-slate-300 transition-colors group-hover:text-white">{log.message}</span>
                                </div>
                            ))}
                            <div className="flex gap-4 animate-pulse">
                                <span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span>
                                <span className="text-teal-500">_</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Security & Access (RIGHT - 35%) */}
                <div className="col-span-12 lg:col-span-4 space-y-8">
                    
                    {/* Security Radar */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                        <h3 className="text-base font-black text-slate-900 uppercase italic mb-6">Security Shield</h3>
                        <div className="space-y-6">
                            <div className="p-5 bg-teal-500/5 border border-teal-500/10 rounded-2xl flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-teal-500/10 flex items-center justify-center mb-4">
                                    <Shield size={32} className="text-teal-500" />
                                </div>
                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Active Firewall</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Filtering 1.2k req/sec</p>
                            </div>
                            
                            <div className="space-y-4">
                                {[
                                    { label: 'Brute Force Protection', status: 'ACTIVE', icon: Lock },
                                    { label: 'SQLi Filter (WAF)', status: 'ACTIVE', icon: Shield },
                                    { label: 'DDOS Mitigation', status: 'STANDBY', icon: Zap },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <item.icon size={16} className="text-slate-400" />
                                            <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight">{item.label}</span>
                                        </div>
                                        <span className={cn(
                                            "text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-widest",
                                            item.status === 'ACTIVE' ? "bg-teal-50 text-teal-600 border-teal-100" : "bg-slate-100 text-slate-400 border-slate-200"
                                        )}>{item.status}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Quick Access Tools */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                        <h3 className="text-base font-black text-slate-900 uppercase italic mb-6">Dev Toolkit</h3>
                        <div className="grid grid-cols-1 gap-3">
                            <button className="flex items-center justify-between px-5 h-14 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all group">
                                <div className="flex items-center gap-3">
                                    <Code2 size={18} className="text-teal-400" />
                                    <span className="text-[11px] font-black uppercase tracking-widest">Environment Config</span>
                                </div>
                                <ChevronRight size={16} className="text-slate-500 group-hover:translate-x-1 transition-transform" />
                            </button>
                            <button className="flex items-center justify-between px-5 h-14 bg-white border border-slate-200 text-slate-900 rounded-2xl hover:bg-slate-50 transition-all group">
                                <div className="flex items-center gap-3">
                                    <Database size={18} className="text-blue-500" />
                                    <span className="text-[11px] font-black uppercase tracking-widest">DB Re-Indexing</span>
                                </div>
                                <RefreshCw size={16} className="text-slate-300 group-hover:rotate-180 transition-transform duration-500" />
                            </button>
                            <button className="flex items-center justify-between px-5 h-14 bg-white border border-slate-200 text-slate-900 rounded-2xl hover:bg-slate-50 transition-all group">
                                <div className="flex items-center gap-3">
                                    <Globe size={18} className="text-purple-500" />
                                    <span className="text-[11px] font-black uppercase tracking-widest">Cache Management</span>
                                </div>
                                <ExternalLink size={16} className="text-slate-300" />
                            </button>
                        </div>
                    </div>

                    {/* Incident Log (Short) */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-base font-black text-slate-900 uppercase italic">Incidents</h3>
                            <AlertTriangle size={18} className="text-amber-500" />
                        </div>
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="w-1 h-12 bg-red-500 rounded-full shrink-0" />
                                <div>
                                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">API Gateway Timeout</p>
                                    <p className="text-[10px] text-slate-500 font-medium">May 22, 14:12 - Resolved in 4m</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-1 h-12 bg-emerald-500 rounded-full shrink-0" />
                                <div>
                                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Zero-Day Patch Applied</p>
                                    <p className="text-[10px] text-slate-500 font-medium">May 19, 09:30 - System-wide</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
}
