'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, Calendar, Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export default function NotificationsPage() {
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
    const { t, fmt } = useLanguage();

    const getIcon = (type: string) => {
        switch (type) {
            case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'ERROR': return <AlertCircle className="w-5 h-5 text-red-500" />;
            case 'WARNING': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700" data-no-translate>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-heading tracking-tight">{t('buyerAccount', 'nTitle')}</h1>
                    <p className="text-sm text-ink-3 font-medium mt-1">{t('buyerAccount', 'nDesc')}</p>
                </div>
                {unreadCount > 0 && (
                    <button 
                        onClick={markAllRead}
                        className="flex items-center gap-2 px-4 py-2 bg-surface-2 border border-line rounded-xl text-xs font-bold text-ink-2 hover:bg-surface-3 transition-all"
                    >
                        <CheckCheck size={16} /> {t('buyerAccount', 'nMarkAll')}
                    </button>
                )}
            </div>

            <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-xl shadow-slate-200/50">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-6">
                        <div className="w-24 h-24 bg-surface-2 rounded-full flex items-center justify-center text-slate-300">
                            <Bell size={48} />
                        </div>
                        <div className="text-center space-y-1">
                            <h3 className="text-lg font-bold text-heading">{t('buyerAccount', 'nEmptyTitle')}</h3>
                            <p className="text-sm text-ink-3 font-medium">{t('buyerAccount', 'nEmptyText')}</p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {notifications.map((n) => (
                            <motion.div
                                key={n.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={cn(
                                    "p-6 flex items-start gap-6 transition-all group",
                                    !n.read ? "bg-slate-50/50" : "hover:bg-slate-50/30"
                                )}
                            >
                                <div className={cn(
                                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-all",
                                    !n.read ? "bg-surface border-line shadow-sm" : "bg-surface-2 border-line"
                                )}>
                                    {getIcon(n.type)}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <h4 className={cn("text-sm font-bold tracking-tight", !n.read ? "text-heading" : "text-ink-2")}>
                                            {n.title}
                                        </h4>
                                        <span className="text-[10px] font-bold text-ink-4 uppercase tracking-widest flex items-center gap-1.5 shrink-0">
                                            <Calendar size={12} />
                                            {fmt.date(n.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className={cn("text-sm leading-relaxed", !n.read ? "text-ink-2 font-medium" : "text-ink-3")}>
                                        {n.message}
                                    </p>
                                    {!n.read && (
                                        <button 
                                            onClick={() => markRead(n.id)}
                                            className="mt-3 text-[10px] font-bold text-teal-600 uppercase tracking-widest hover:underline"
                                        >
                                            {t('buyerAccount', 'nMarkRead')}
                                        </button>
                                    )}
                                </div>
                                {!n.read && (
                                    <div className="w-2 h-2 rounded-full bg-teal-500 shrink-0 mt-2 shadow-sm shadow-teal-500/50" />
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
