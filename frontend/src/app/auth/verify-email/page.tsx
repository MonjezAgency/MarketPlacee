'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiFetch } from '@/lib/api';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const { t, dir } = useLanguage();
    const token = searchParams.get('token');
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {

        const verify = async () => {
            try {
                const res = await apiFetch(`/auth/verify-email?token=${token}`);
                const data = await res.json();

                if (res.ok) {
                    setStatus('success');
                    setMessage(t('auth', 'verificationSuccessMsg'));
                } else {
                    setStatus('error');
                    setMessage(data.message || t('auth', 'verificationFailed'));
                }
            } catch (err) {
                setStatus('error');
                setMessage(t('auth', 'errorUnexpected'));
            }
        };

        verify();
    }, [token, t]);

    return (
        <div className="min-h-screen bg-[#0A1A2F] flex items-center justify-center p-6" dir={dir}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full bg-[#1A1F26] rounded-3xl p-10 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center space-y-8 relative overflow-hidden"
            >
                {/* Decorative Background Element */}
                <div className="absolute -top-24 -end-24 w-48 h-48 bg-primary/10 blur-3xl rounded-full" />
                <div className="absolute -bottom-24 -start-24 w-48 h-48 bg-secondary/10 blur-3xl rounded-full" />

                {status === 'loading' && (
                    <div className="space-y-6 relative z-10">
                        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
                            <Loader2 className="text-primary w-10 h-10 animate-spin" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-black text-white tracking-tight">{t('auth', 'verifyingEmail')}</h1>
                            <p className="text-white/60 text-sm">{t('auth', 'verificationHoldOn')}</p>
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <div className="space-y-8 relative z-10">
                        <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                            <CheckCircle className="text-emerald-500 w-10 h-10" />
                        </div>
                        <div className="space-y-3">
                            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">{t('auth', 'verificationSuccess')}</h1>
                            <p className="text-white/70 font-medium">{message}</p>
                        </div>
                        <Link
                            href="/auth/login"
                            className="flex items-center justify-center gap-3 w-full py-5 bg-primary text-white font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {t('auth', 'continueToLogin')} <ArrowRight size={18} />
                        </Link>
                    </div>
                )}

                {status === 'error' && (
                    <div className="space-y-8 relative z-10">
                        <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
                            <XCircle className="text-red-500 w-10 h-10" />
                        </div>
                        <div className="space-y-3">
                            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">{t('auth', 'verificationFailed')}</h1>
                            <p className="text-white/60 text-sm font-medium">{message}</p>
                        </div>
                        <div className="space-y-4">
                            <Link
                                href="/auth/register"
                                className="flex items-center justify-center w-full py-5 bg-white/5 hover:bg-white/10 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all border border-white/10 hover:border-white/20"
                            >
                                {t('auth', 'tryRegisterAgain')}
                            </Link>
                            <Link href="/" className="block text-primary font-black uppercase text-[10px] tracking-[0.2em] hover:text-primary/80 transition-colors">
                                {t('auth', 'returnHome')}
                            </Link>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0A1A2F] flex items-center justify-center">
                <Loader2 className="text-primary w-12 h-12 animate-spin" />
            </div>
        }>
            <VerifyEmailContent />
        </Suspense>
    );
}
