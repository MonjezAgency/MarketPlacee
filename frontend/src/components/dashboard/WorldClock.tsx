'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TimezoneInfo {
    label: string;
    tz: string;
    flag: string;
}

const TIMEZONES: TimezoneInfo[] = [
    { label: 'Cairo', tz: 'Africa/Cairo', flag: '🇪🇬' },
    { label: 'London', tz: 'Europe/London', flag: '🇬🇧' },
    { label: 'Amsterdam', tz: 'Europe/Amsterdam', flag: '🇳🇱' },
    { label: 'Bucharest', tz: 'Europe/Bucharest', flag: '🇷🇴' },
    { label: 'Bali', tz: 'Asia/Makassar', flag: '🇮🇩' },
    { label: 'New York', tz: 'America/New_York', flag: '🇺🇸' },
];

export function WorldClock() {
    const [times, setTimes] = useState<Record<string, string>>({});
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const updateTimes = () => {
            const newTimes: Record<string, string> = {};
            TIMEZONES.forEach(({ tz, label }) => {
                newTimes[label] = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).format(new Date());
            });
            setTimes(newTimes);
        };

        updateTimes();
        const interval = setInterval(updateTimes, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="h-10 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center gap-2 transition-all group"
            >
                <Clock size={16} className="text-teal-400 group-hover:rotate-12 transition-transform" />
                <span className="text-[12px] font-bold text-white/90 tabular-nums">
                    {times['Cairo'] || '--:--'}
                </span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                        <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute top-full right-0 mt-2 w-64 bg-[#0A1A2F] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden p-2"
                        >
                            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Global Operations</span>
                                <Globe size={12} className="text-teal-500 opacity-50" />
                            </div>
                            <div className="space-y-1">
                                {TIMEZONES.map((tz) => (
                                    <div key={tz.label} className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/5 transition-colors group">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm grayscale group-hover:grayscale-0 transition-all">{tz.flag}</span>
                                            <span className="text-xs font-medium text-white/70">{tz.label}</span>
                                        </div>
                                        <span className="text-xs font-black text-teal-400 tabular-nums">{times[tz.label]}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
