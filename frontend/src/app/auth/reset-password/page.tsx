'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, ArrowRight, ShieldCheck, Sparkles, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

function ResetPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) {
            setError('Invalid reset link. Please request a new password reset.');
        }
    }, [token]);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        // Match backend regex: 8+ chars, 1 upper, 1 lower, 1 digit, 1 special
        const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/.test(password);
        if (!isStrong) {
            setError('Password does not meet security requirements.');
            return;
        }

        setLoading(true);
        try {
            const { apiFetch } = await import('@/lib/api');
            const res = await apiFetch('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token, newPassword: password }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Failed to reset password');
            }
            setSuccess(true);
            toast.success('Password reset successful!');
            setTimeout(() => router.push('/auth/login'), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden font-sans">
            {/* Background Aesthetics */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[150px] animate-pulse" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-[450px] z-10"
            >
                <div className="text-center mb-10">
                    <Link href="/" className="inline-block group">
                        <span className="font-black text-4xl tracking-tighter text-white">
                            Atlan<span className="text-[#1BC7C9]">tis</span>
                        </span>
                    </Link>
                </div>

                <div className="bg-[#0F172A]/80 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#1BC7C9] to-transparent opacity-50" />
                    
                    <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                        New Password <Sparkles className="text-[#1BC7C9] w-6 h-6" />
                    </h1>
                    <p className="text-slate-400 text-sm font-medium mb-8">
                        Please enter your new secure password below.
                    </p>

                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 text-red-400 text-sm font-bold flex items-center gap-3"
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            {error}
                        </motion.div>
                    )}

                    {success ? (
                        <div className="text-center py-8 space-y-6">
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/20">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-white">Security Updated</h3>
                                <p className="text-slate-400">Your password has been reset successfully. We're taking you to the login page...</p>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ms-1">New Password</label>
                                <div className="relative group">
                                    <Lock className="absolute start-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#1BC7C9] transition-colors" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-white/5 rounded-2xl ps-14 pe-14 py-4 text-white outline-none focus:border-[#1BC7C9]/50 focus:bg-slate-900 transition-all text-base tracking-widest placeholder:tracking-normal placeholder:text-slate-600"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute end-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                                
                                {/* Password Requirements Guide */}
                                <div className="grid grid-cols-2 gap-2 mt-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                                    {[
                                        { label: '8+ Characters', met: password.length >= 8 },
                                        { label: 'Uppercase', met: /[A-Z]/.test(password) },
                                        { label: 'Number', met: /\d/.test(password) },
                                        { label: 'Symbol', met: /[!@#$%^&*]/.test(password) }
                                    ].map((req, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={cn(
                                                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                                req.met ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-700"
                                            )} />
                                            <span className={cn(
                                                "text-[10px] font-bold uppercase tracking-tight",
                                                req.met ? "text-emerald-400" : "text-slate-500"
                                            )}>
                                                {req.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ms-1">Confirm Identity</label>
                                <div className="relative group">
                                    <ShieldCheck className="absolute start-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#1BC7C9] transition-colors" />
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-white/5 rounded-2xl ps-14 pe-6 py-4 text-white outline-none focus:border-[#1BC7C9]/50 focus:bg-slate-900 transition-all text-base tracking-widest placeholder:tracking-normal placeholder:text-slate-600"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !password || !confirmPassword}
                                className="w-full relative group overflow-hidden rounded-2xl"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-[#1BC7C9] to-blue-500 opacity-100 group-hover:scale-105 transition-transform duration-500" />
                                <div className="relative py-5 bg-transparent text-white font-black text-sm uppercase tracking-[0.3em] flex items-center justify-center gap-3 disabled:opacity-50">
                                    {loading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            Secure Account <ArrowRight size={18} />
                                        </>
                                    )}
                                </div>
                            </button>
                        </form>
                    )}
                </div>

                <div className="mt-8 text-center">
                    <Link href="/auth/login" className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] hover:text-[#1BC7C9] transition-colors">
                        Back to Security Login
                    </Link>
                </div>
            </motion.div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#020617] flex items-center justify-center"><div className="w-8 h-8 border-4 border-white/30 border-t-[#1BC7C9] rounded-full animate-spin" /></div>}>
            <ResetPasswordContent />
        </Suspense>
    );
}
