'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
    Activity, Server, Database, Cpu, HardDrive,
    Wifi, GitBranch, AlertTriangle, Shield, Terminal,
    RefreshCw, CheckCircle2, XCircle, Clock, Zap,
    Globe, BarChart3, Code2, Box, ArrowUpRight,
    ArrowDownRight, Eye, Bug, Rocket, Gauge,
    Layers, RadioTower, Lock,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { useAuth } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/config';

const API_URL = API_BASE_URL;

// ── Mock data (will be replaced with live API calls) ─────────────────────────

const RESPONSE_TIME_DATA = [
    { time: '00:00', api: 120, db: 45 },
    { time: '04:00', api: 95, db: 38 },
    { time: '08:00', api: 180, db: 62 },
    { time: '12:00', api: 210, db: 78 },
    { time: '16:00', api: 165, db: 55 },
    { time: '20:00', api: 140, db: 48 },
    { time: 'Now', api: 130, db: 42 },
];

const ERROR_RATE_DATA = [
    { day: 'Mon', errors: 12, warnings: 34 },
    { day: 'Tue', errors: 8, warnings: 28 },
    { day: 'Wed', errors: 15, warnings: 42 },
    { day: 'Thu', errors: 5, warnings: 18 },
    { day: 'Fri', errors: 22, warnings: 55 },
    { day: 'Sat', errors: 3, warnings: 12 },
    { day: 'Sun', errors: 7, warnings: 20 },
];

const RECENT_DEPLOYMENTS = [
    { id: 1, version: 'v2.14.3', env: 'Production', status: 'success', time: '2 hours ago', changes: 12, by: 'CI/CD' },
    { id: 2, version: 'v2.14.2', env: 'Staging', status: 'success', time: '5 hours ago', changes: 8, by: 'Monjez' },
    { id: 3, version: 'v2.14.1', env: 'Production', status: 'success', time: '1 day ago', changes: 24, by: 'CI/CD' },
    { id: 4, version: 'v2.14.0', env: 'Staging', status: 'failed', time: '2 days ago', changes: 31, by: 'Monjez' },
    { id: 5, version: 'v2.13.9', env: 'Production', status: 'success', time: '3 days ago', changes: 15, by: 'CI/CD' },
];

const SECURITY_ALERTS = [
    { id: 1, level: 'WARN', type: 'Rate Limit', desc: 'Unusual spike from IP 192.168.1.45', time: '15 min ago' },
    { id: 2, level: 'INFO', type: 'Auth', desc: 'New admin login from Cairo, Egypt', time: '1 hour ago' },
    { id: 3, level: 'CRITICAL', type: 'XSS Attempt', desc: 'Blocked XSS payload on /products/search', time: '3 hours ago' },
    { id: 4, level: 'WARN', type: 'Brute Force', desc: '5 failed login attempts for admin@monjez.com', time: '6 hours ago' },
    { id: 5, level: 'INFO', type: 'KYC', desc: 'KYC document auto-flagged low liveness score', time: '12 hours ago' },
];

const RECENT_ERRORS = [
    { id: 1, code: 500, endpoint: 'POST /api/orders', msg: 'Database connection pool exhausted', time: '30 min ago', count: 3 },
    { id: 2, code: 404, endpoint: 'GET /api/products/invalid-id', msg: 'Product not found', time: '1 hour ago', count: 12 },
    { id: 3, code: 429, endpoint: 'POST /api/auth/login', msg: 'Rate limit exceeded', time: '2 hours ago', count: 45 },
    { id: 4, code: 503, endpoint: 'POST /api/payments/create', msg: 'Stripe gateway timeout', time: '5 hours ago', count: 2 },
];

function HealthIndicator({ name, status, latency, Icon }: { name: string; status: 'healthy' | 'degraded' | 'down'; latency?: string; Icon: React.ElementType }) {
    const colors = {
        healthy: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        degraded: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        down: 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    const dotColors = {
        healthy: 'bg-emerald-500',
        degraded: 'bg-amber-500',
        down: 'bg-red-500',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("p-5 rounded-2xl border transition-all hover:scale-[1.02]", colors[status])}
        >
            <div className="flex items-center justify-between mb-3">
                <Icon size={20} />
                <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", dotColors[status])} />
            </div>
            <p className="text-sm font-black">{name}</p>
            <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{status}</span>
                {latency && <span className="text-[10px] font-bold opacity-50">{latency}</span>}
            </div>
        </motion.div>
    );
}

function MetricCard({ icon: Icon, label, value, delta, deltaType, color }: {
    icon: React.ElementType; label: string; value: string; delta?: string;
    deltaType?: 'up' | 'down'; color: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 hover:scale-[1.02] transition-all group relative overflow-hidden"
        >
            <div className="absolute top-4 end-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Icon size={60} />
            </div>
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4", color)}>
                <Icon size={18} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
            <p className="text-3xl font-black font-heading tracking-tight">{value}</p>
            {delta && (
                <div className={cn("flex items-center gap-1 mt-2 text-xs font-bold",
                    deltaType === 'up' ? 'text-emerald-500' : 'text-red-500'
                )}>
                    {deltaType === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{delta}</span>
                </div>
            )}
        </motion.div>
    );
}

export default function TechDashboardPage() {
    const { user } = useAuth();
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [systemStats, setSystemStats] = React.useState({
        uptime: '99.97%',
        avgResponseTime: '142ms',
        totalRequests: '1.2M',
        errorRate: '0.03%',
        dbConnections: '18/100',
        activeUsers: '342',
        queueJobs: '12',
        cacheHitRate: '94.2%',
    });
    const [healthChecks, setHealthChecks] = React.useState<{
        name: string; status: 'healthy' | 'degraded' | 'down'; latency?: string; icon: React.ElementType;
    }[]>([
        { name: 'API Server', status: 'healthy', latency: '42ms', icon: Server },
        { name: 'PostgreSQL', status: 'healthy', latency: '8ms', icon: Database },
        { name: 'Redis Cache', status: 'healthy', latency: '2ms', icon: Zap },
        { name: 'WebSocket', status: 'healthy', latency: '15ms', icon: RadioTower },
        { name: 'Email SMTP', status: 'degraded', latency: '1.2s', icon: Globe },
        { name: 'Stripe API', status: 'healthy', latency: '180ms', icon: Lock },
        { name: 'File Storage', status: 'healthy', latency: '95ms', icon: HardDrive },
        { name: 'Auth Service', status: 'healthy', latency: '22ms', icon: Shield },
    ]);

    // Try to fetch real health data
    React.useEffect(() => {
        const fetchHealth = async () => {
            try {
                
                const headers = {  };

                // Try to fetch from health endpoint
                const [healthRes] = await Promise.allSettled([
                    fetch(`${API_URL}/health`, { headers }).then(r => r.json()),
                ]);

                // If we get data, use it
                if (healthRes.status === 'fulfilled' && healthRes.value) {
                    // Update system stats if available
                }
            } catch {
                // Use mock data
            }
        };
        fetchHealth();
    }, []);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await new Promise(r => setTimeout(r, 1500));
        setIsRefreshing(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-2xl text-white shadow-lg shadow-blue-500/20">
                            <Terminal size={22} />
                        </div>
                        <h1 className="text-3xl font-black font-heading tracking-tighter uppercase">
                            Tech Operations Center
                        </h1>
                    </div>
                    <p className="text-sm text-muted-foreground font-bold">
                        System monitoring, deployments, security, and infrastructure health — all in one place.
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="h-11 px-6 flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground text-xs font-black hover:opacity-90 transition-all disabled:opacity-50"
                >
                    <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                    Refresh All
                </button>
            </div>

            {/* System Health Grid */}
            <div>
                <div className="flex items-center gap-2 mb-5">
                    <Activity size={16} className="text-secondary" />
                    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Service Health</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {healthChecks.map((check, i) => (
                        <HealthIndicator key={i} name={check.name} status={check.status} latency={check.latency} Icon={check.icon} />
                    ))}
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard icon={Gauge} label="System Uptime" value={systemStats.uptime} delta="+0.02%" deltaType="up" color="bg-emerald-500/10 text-emerald-500" />
                <MetricCard icon={Zap} label="Avg Response" value={systemStats.avgResponseTime} delta="-12ms" deltaType="up" color="bg-blue-500/10 text-blue-500" />
                <MetricCard icon={Globe} label="Total Requests" value={systemStats.totalRequests} delta="+18.4% this week" deltaType="up" color="bg-secondary/10 text-secondary" />
                <MetricCard icon={Bug} label="Error Rate" value={systemStats.errorRate} delta="-0.01%" deltaType="up" color="bg-accent/10 text-accent" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Response Time Chart */}
                <div className="glass-card-strong p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-black font-heading tracking-tighter uppercase">Response Time</h3>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">API vs Database Latency</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-secondary" />
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">API</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-primary" />
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Database</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={RESPONSE_TIME_DATA}>
                                <defs>
                                    <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorDb" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.1)" />
                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} unit="ms" />
                                <Tooltip
                                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '1rem' }}
                                    labelStyle={{ fontWeight: 900 }}
                                />
                                <Area type="monotone" dataKey="api" stroke="hsl(var(--secondary))" strokeWidth={3} fillOpacity={1} fill="url(#colorApi)" />
                                <Area type="monotone" dataKey="db" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorDb)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Error Rate Chart */}
                <div className="glass-card-strong p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-black font-heading tracking-tighter uppercase">Error Distribution</h3>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">Errors & Warnings (7 Days)</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500" />
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Errors</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500" />
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Warnings</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={ERROR_RATE_DATA}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.1)" />
                                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} />
                                <Tooltip
                                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '1rem' }}
                                />
                                <Bar dataKey="errors" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={20} />
                                <Bar dataKey="warnings" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Infrastructure Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-6 border-s-4 border-secondary">
                    <div className="flex items-center gap-2 mb-3">
                        <Database size={16} className="text-secondary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">DB Pool</span>
                    </div>
                    <p className="text-2xl font-black font-heading">{systemStats.dbConnections}</p>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-secondary rounded-full" style={{ width: '18%' }} />
                    </div>
                </div>
                <div className="glass-card p-6 border-s-4 border-primary">
                    <div className="flex items-center gap-2 mb-3">
                        <Eye size={16} className="text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Users</span>
                    </div>
                    <p className="text-2xl font-black font-heading">{systemStats.activeUsers}</p>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: '34%' }} />
                    </div>
                </div>
                <div className="glass-card p-6 border-s-4 border-accent">
                    <div className="flex items-center gap-2 mb-3">
                        <Layers size={16} className="text-accent" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Queue Jobs</span>
                    </div>
                    <p className="text-2xl font-black font-heading">{systemStats.queueJobs}</p>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: '12%' }} />
                    </div>
                </div>
                <div className="glass-card p-6 border-s-4 border-emerald-500">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap size={16} className="text-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cache Hit Rate</span>
                    </div>
                    <p className="text-2xl font-black font-heading">{systemStats.cacheHitRate}</p>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '94%' }} />
                    </div>
                </div>
            </div>

            {/* Deployments + Security Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Recent Deployments */}
                <div className="glass-card-strong p-8 border-t-4 border-secondary">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                                <Rocket size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black font-heading tracking-tighter uppercase">Deployments</h3>
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CI/CD Pipeline History</p>
                            </div>
                        </div>
                        <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            5 this week
                        </span>
                    </div>
                    <div className="space-y-3">
                        {RECENT_DEPLOYMENTS.map((dep) => (
                            <div key={dep.id} className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 hover:bg-muted/50 transition-all border border-transparent hover:border-border group">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center",
                                        dep.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                    )}>
                                        {dep.status === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black">{dep.version}</span>
                                            <span className={cn(
                                                "text-[9px] font-black px-2 py-0.5 rounded-full border uppercase",
                                                dep.env === 'Production'
                                                    ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                            )}>
                                                {dep.env}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                                            {dep.changes} changes · by {dep.by} · {dep.time}
                                        </p>
                                    </div>
                                </div>
                                <GitBranch size={16} className="text-muted-foreground/30 group-hover:text-secondary transition-colors" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Security Alerts */}
                <div className="glass-card-strong p-8 border-t-4 border-red-500">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                                <Shield size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black font-heading tracking-tighter uppercase">Security Feed</h3>
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Threat Detection & Alerts</p>
                            </div>
                        </div>
                        <a href="/admin/security" className="text-xs font-black text-primary hover:underline">View All Logs →</a>
                    </div>
                    <div className="space-y-3">
                        {SECURITY_ALERTS.map((alert) => (
                            <div key={alert.id} className={cn(
                                "p-4 rounded-2xl border transition-all hover:scale-[1.01]",
                                alert.level === 'CRITICAL' ? 'bg-red-500/5 border-red-500/20' :
                                alert.level === 'WARN' ? 'bg-amber-500/5 border-amber-500/20' :
                                'bg-muted/30 border-border/50'
                            )}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                            alert.level === 'CRITICAL' ? 'bg-red-500/10 text-red-500' :
                                            alert.level === 'WARN' ? 'bg-amber-500/10 text-amber-500' :
                                            'bg-blue-500/10 text-blue-500'
                                        )}>
                                            {alert.level === 'CRITICAL' ? <AlertTriangle size={14} /> :
                                             alert.level === 'WARN' ? <AlertTriangle size={14} /> :
                                             <Activity size={14} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={cn(
                                                    "text-[9px] font-black px-2 py-0.5 rounded-full border uppercase",
                                                    alert.level === 'CRITICAL' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                    alert.level === 'WARN' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                    'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                )}>
                                                    {alert.level}
                                                </span>
                                                <span className="text-[10px] font-black text-muted-foreground">{alert.type}</span>
                                            </div>
                                            <p className="text-xs font-bold text-foreground/80">{alert.desc}</p>
                                        </div>
                                    </div>
                                    <span className="text-[9px] text-muted-foreground font-bold shrink-0 mt-1">{alert.time}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Recent Errors Log */}
            <div className="glass-card-strong p-8 border-t-4 border-accent">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                            <Bug size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black font-heading tracking-tighter uppercase">Error Tracker</h3>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Recent API Errors & Exceptions</p>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-start">
                        <thead>
                            <tr className="border-b border-border/50">
                                <th className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3 text-start">Code</th>
                                <th className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3 text-start">Endpoint</th>
                                <th className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3 text-start">Message</th>
                                <th className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3 text-start">Count</th>
                                <th className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3 text-start">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {RECENT_ERRORS.map((err) => (
                                <tr key={err.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                                    <td className="p-3">
                                        <span className={cn(
                                            "text-xs font-black px-2.5 py-1 rounded-lg",
                                            err.code >= 500 ? 'bg-red-500/10 text-red-500' :
                                            err.code >= 400 ? 'bg-amber-500/10 text-amber-500' :
                                            'bg-blue-500/10 text-blue-500'
                                        )}>
                                            {err.code}
                                        </span>
                                    </td>
                                    <td className="p-3 text-xs font-mono font-bold text-foreground/70">{err.endpoint}</td>
                                    <td className="p-3 text-xs font-bold text-foreground/60">{err.msg}</td>
                                    <td className="p-3">
                                        <span className="text-xs font-black bg-muted/50 px-2 py-0.5 rounded-full">{err.count}×</span>
                                    </td>
                                    <td className="p-3 text-[10px] text-muted-foreground font-bold">{err.time}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Access Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <a href="/admin/security" className="glass-card p-6 text-center hover:scale-[1.03] transition-all group cursor-pointer">
                    <Shield size={24} className="mx-auto mb-3 text-muted-foreground group-hover:text-primary transition-colors" />
                    <p className="text-xs font-black uppercase tracking-widest">Security Logs</p>
                </a>
                <a href="/admin/settings" className="glass-card p-6 text-center hover:scale-[1.03] transition-all group cursor-pointer">
                    <Cpu size={24} className="mx-auto mb-3 text-muted-foreground group-hover:text-secondary transition-colors" />
                    <p className="text-xs font-black uppercase tracking-widest">System Settings</p>
                </a>
                <a href="/dashboard/support" className="glass-card p-6 text-center hover:scale-[1.03] transition-all group cursor-pointer">
                    <Terminal size={24} className="mx-auto mb-3 text-muted-foreground group-hover:text-accent transition-colors" />
                    <p className="text-xs font-black uppercase tracking-widest">Support Center</p>
                </a>
                <a href="/admin" className="glass-card p-6 text-center hover:scale-[1.03] transition-all group cursor-pointer">
                    <BarChart3 size={24} className="mx-auto mb-3 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
                    <p className="text-xs font-black uppercase tracking-widest">Admin Overview</p>
                </a>
            </div>
        </div>
    );
}
