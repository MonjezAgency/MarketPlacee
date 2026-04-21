'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function PendingApprovalPage() {
    const { user, logout } = useAuth();

    return (
        <div className="min-h-screen bg-[#131921] flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full bg-[#1A1F26] rounded-2xl p-8 border border-white/10 shadow-2xl text-center space-y-6"
            >
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <Clock className="text-primary w-10 h-10" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-black text-white tracking-tight">Registration Pending</h1>
                    <p className="text-white/60 text-sm">
                        Hello <span className="text-white font-bold">{user?.name}</span>, your account is currently being reviewed by our administration team.
                    </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4 text-start border border-white/5">
                    <div className="flex items-center gap-3 text-white/80 text-sm mb-2">
                        <Mail size={16} className="text-primary" />
                        <span>Notification Email</span>
                    </div>
                    <p className="text-[12px] text-white/40 leading-relaxed">
                        We will send an email to <span className="text-white/70 font-medium">{user?.email}</span> once your request is processed. This typically takes 24-48 hours.
                    </p>
                </div>

                <div className="pt-4 space-y-3">
                    <Link
                        href="/"
                        className="flex items-center justify-center gap-2 text-primary font-bold hover:underline py-2"
                    >
                        <ArrowLeft size={16} /> Back to Storefront
                    </Link>
                    <button
                        onClick={async () => {
                            await logout();
                            window.location.href = '/auth/login';
                        }}
                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-colors border border-white/10"
                    >
                        Logout
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
