'use client';

import * as React from 'react';
import { SupportChat } from '@/components/chat/SupportChat';
import { useAuth } from '@/lib/auth';
import { MessageCircle, Headphones, ShieldCheck, Clock, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BuyerSupportPage() {
    const { user } = useAuth();

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            <header className="h-24 border-b border-slate-200 bg-white px-8 flex items-center justify-between sticky top-0 z-40">
                <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-[#0B1F3A] tracking-tight">Support Center</h1>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Direct communication with Atlantis HQ</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 rounded-xl border border-teal-100">
                            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                            <span className="text-[11px] font-black text-teal-700 uppercase tracking-wider">Agents Online</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-8 py-10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Chat Area */}
                    <div className="lg:col-span-8">
                        <div className="bg-white border border-slate-200 rounded-[32px] shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col h-[700px]">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-[#0B1F3A] flex items-center justify-center text-white">
                                        <Headphones size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Atlantis Official Support</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Verified Corporate Account</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-500">
                                    <Clock size={12} />
                                    Avg. Response: 15m
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <SupportChat isSupport={false} isLight={true} />
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Info */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white border border-slate-200 rounded-[32px] p-8 space-y-6">
                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-4">Support Protocol</h3>
                            
                            <div className="space-y-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                                        <ShieldCheck size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Secure Channel</p>
                                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">
                                            All conversations are encrypted and monitored for quality assurance.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                                        <Zap size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Instant Escalation</p>
                                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">
                                            Type "AGENT" at any time to bypass the AI and speak with a human.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Common Topics</p>
                                <div className="flex flex-wrap gap-2">
                                    {['Shipping Rates', 'Payment Terms', 'Bulk Orders', 'Product Sourcing'].map(tag => (
                                        <span key={tag} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-gradient-to-br from-[#0B1F3A] to-[#152D4F] rounded-[32px] p-8 text-white relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                <MessageCircle size={120} />
                            </div>
                            <div className="relative z-10">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-teal-400 mb-4">Direct Access</p>
                                <h4 className="text-xl font-black tracking-tight leading-tight mb-4">
                                    Need immediate business assistance?
                                </h4>
                                <p className="text-[11px] text-slate-300 font-medium leading-relaxed mb-6">
                                    Our logistics and procurement teams are standing by to assist with your wholesale needs.
                                </p>
                                <button className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl shadow-teal-500/20">
                                    Speak to an Expert
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>
        </div>
    );
}
