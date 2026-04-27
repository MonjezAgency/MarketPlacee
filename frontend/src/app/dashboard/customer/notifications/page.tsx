'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, Calendar, Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

    const getIcon = (type: string) => {
        switch (type) {
            case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'ERROR': return <AlertCircle className="w-5 h-5 text-red-500" />;
            case 'WARNING': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-[#0B1F3A] tracking-tight">Notifications</h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">Stay updated with your latest order activities and account alerts.</p>
                </div>
                {unreadCount > 0 && (
                    <button 
                        onClick={markAllRead}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-all"
                    >
                        <CheckCheck size={16} /> Mark all as read
                    </button>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-xl shadow-slate-200/50">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-6">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                            <Bell size={48} />
                        </div>
                        <div className="text-center space-y-1">
                            <h3 className="text-lg font-black text-[#0B1F3A]">All clear!</h3>
                            <p className="text-sm text-slate-500 font-medium">You don't have any notifications right now.</p>
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
                                    !n.read ? "bg-white border-slate-200 shadow-sm" : "bg-slate-50 border-slate-100"
                                )}>
                                    {getIcon(n.type)}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className={cn("text-sm font-black tracking-tight", !n.read ? "text-[#0B1F3A]" : "text-slate-600")}>
                                            {n.title}
                                        </h4>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Calendar size={12} />
                                            {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className={cn("text-sm leading-relaxed", !n.read ? "text-slate-700 font-medium" : "text-slate-500")}>
                                        {n.message}
                                    </p>
                                    {!n.read && (
                                        <button 
                                            onClick={() => markRead(n.id)}
                                            className="mt-3 text-[10px] font-black text-teal-600 uppercase tracking-widest hover:underline"
                                        >
                                            Mark as read
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
