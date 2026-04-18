'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bot, Play, RefreshCw, AlertTriangle, CheckCircle, Clock, TrendingUp, Zap, Shield, Activity } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import toast from 'react-hot-toast';

interface AgentIssue {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    entityId?: string;
    entityType?: string;
    autoFixed: boolean;
    fixDescription?: string;
}

interface AgentReport {
    id: string;
    timestamp: string;
    issuesFound: number;
    actionsToken: string[];
    summary: string;
    details: AgentIssue[];
}

const SEVERITY_CONFIG = {
    CRITICAL: { color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-500' },
    HIGH:     { color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-500' },
    MEDIUM:   { color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-500' },
    LOW:      { color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-500' },
};

export default function AiAgentPage() {
    const [reports, setReports] = useState<AgentReport[]>([]);
    const [scanning, setScanning] = useState(false);
    const [selectedReport, setSelectedReport] = useState<AgentReport | null>(null);

    const loadReports = useCallback(async () => {
        try {
            const res = await apiFetch('/ai-agent/reports');
            if (res.ok) {
                const data = await res.json();
                setReports(data?.data ?? data ?? []);
            }
        } catch {}
    }, []);

    useEffect(() => {
        loadReports();
        const interval = setInterval(loadReports, 60000);
        return () => clearInterval(interval);
    }, [loadReports]);

    const triggerScan = async () => {
        setScanning(true);
        try {
            const res = await apiFetch('/ai-agent/scan', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                const report = data?.data ?? data;
                setReports(prev => [report, ...prev.slice(0, 49)]);
                setSelectedReport(report);
                toast.success(`Scan complete: ${report.issuesFound} issue(s) found`);
            } else {
                toast.error('Scan failed');
            }
        } catch {
            toast.error('Failed to connect to AI Agent');
        } finally {
            setScanning(false);
        }
    };

    const latest = selectedReport ?? reports[0] ?? null;
    const totalFixed = latest?.details?.filter(i => i.autoFixed).length ?? 0;

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-foreground">AI Monitoring Agent</h1>
                        <p className="text-sm text-muted-foreground">Automated marketplace health scanner & issue resolver</p>
                    </div>
                </div>
                <button
                    onClick={triggerScan}
                    disabled={scanning}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                >
                    {scanning ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Scanning...</>
                    ) : (
                        <><Play className="w-4 h-4" /> Run Scan Now</>
                    )}
                </button>
            </div>

            {/* Stats */}
            {latest && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Issues Found', value: latest.issuesFound, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                        { label: 'Auto-Fixed', value: totalFixed, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
                        { label: 'Actions Taken', value: latest.actionsToken.length, icon: Zap, color: 'text-violet-500', bg: 'bg-violet-500/10' },
                        { label: 'Total Scans', value: reports.length, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    ].map((stat) => (
                        <div key={stat.label} className="bg-card border border-border/50 rounded-2xl p-5">
                            <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
                                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                            </div>
                            <p className="text-2xl font-black text-foreground">{stat.value}</p>
                            <p className="text-xs text-muted-foreground font-medium mt-1">{stat.label}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* AI Summary */}
            {latest && (
                <div className="bg-gradient-to-br from-violet-500/10 to-purple-600/5 border border-violet-500/20 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-3">
                        <Bot className="w-5 h-5 text-violet-500" />
                        <span className="font-bold text-sm text-violet-400 uppercase tracking-wider">AI Analysis</span>
                        <span className="text-xs text-muted-foreground">
                            {new Date(latest.timestamp).toLocaleString()}
                        </span>
                    </div>
                    <p className="text-foreground text-sm leading-relaxed">{latest.summary}</p>
                </div>
            )}

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Issue List */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
                        <Shield className="w-5 h-5 text-violet-500" />
                        {latest ? `Issues from last scan (${latest.details?.length ?? 0})` : 'No scans yet'}
                    </h2>

                    {!latest && (
                        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
                            <Bot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                            <p className="text-muted-foreground font-medium">Run a scan to see marketplace health status</p>
                        </div>
                    )}

                    {latest?.details?.length === 0 && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-8 text-center">
                            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                            <p className="text-green-600 font-bold">All systems healthy! No issues detected.</p>
                        </div>
                    )}

                    {latest?.details?.map((issue, i) => {
                        const cfg = SEVERITY_CONFIG[issue.severity];
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className={`border rounded-xl p-4 ${cfg.bg}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1">
                                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{issue.severity}</span>
                                                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{issue.type.replace(/_/g, ' ')}</span>
                                                {issue.entityType && (
                                                    <span className="text-xs text-muted-foreground">{issue.entityType}</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-foreground mt-1">{issue.description}</p>
                                            {issue.autoFixed && issue.fixDescription && (
                                                <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" /> {issue.fixDescription}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {issue.autoFixed && (
                                        <span className="text-xs bg-green-500/20 text-green-600 px-2 py-1 rounded-lg font-bold flex-shrink-0">Auto-fixed</span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Scan History */}
                <div className="space-y-4">
                    <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
                        <Clock className="w-5 h-5 text-violet-500" />
                        Scan History
                    </h2>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                        {reports.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-8">No scans recorded yet</p>
                        )}
                        {reports.map((report, i) => (
                            <button
                                key={report.id}
                                onClick={() => setSelectedReport(report)}
                                className={`w-full text-left p-4 rounded-xl border transition-all ${
                                    selectedReport?.id === report.id
                                        ? 'bg-violet-500/10 border-violet-500/30'
                                        : 'bg-card border-border/50 hover:border-violet-500/20'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(report.timestamp).toLocaleString()}
                                    </span>
                                    {i === 0 && <span className="text-[10px] bg-violet-500/20 text-violet-500 px-2 py-0.5 rounded-full font-bold">Latest</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-sm font-bold ${report.issuesFound > 0 ? 'text-orange-500' : 'text-green-500'}`}>
                                        {report.issuesFound} issue{report.issuesFound !== 1 ? 's' : ''}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {report.actionsToken.length} action{report.actionsToken.length !== 1 ? 's' : ''} taken
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Guardrails Notice */}
            <div className="bg-muted/30 border border-border/50 rounded-xl p-4 flex items-start gap-3">
                <Shield className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-bold text-foreground">Safety Guardrails Active</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        The AI Agent can only send notifications, flag issues for review, and log alerts. It cannot transfer money, change user roles, delete data, or modify orders. All financial decisions require manual admin approval.
                    </p>
                </div>
            </div>
        </div>
    );
}
