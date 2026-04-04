'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, ArrowRight, ShieldCheck, Sparkles, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';

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
            setError('Invalid or missing reset token.');
        }
    }, [token]);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        setLoading(true);
        try {
            await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`, {
                token,
                password
            });
            setSuccess(true);
            toast.success('Password reset successful!');
            setTimeout(() => router.push('/auth/login'), 3000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050B18] flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FF7A1A]/10 rounded-full blur-[120px] animate-pulse" />
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
                            Market<span className="text-[#FF7A1A]">Place</span>
                        </span>
                    </Link>
                </div>

                <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-10 shadow-2xl relative">
                    <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                        New Password <Sparkles className="text-[#FF7A1A] w-6 h-6" />
                    </h1>
                    <p className="text-gray-400 text-sm font-medium mb-8">
                        Please enter your new secure password below.
                    </p>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 text-red-400 text-sm font-bold">
                            {error}
                        </div>
                    )}

                    {success ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                            </div>
                            <h3 className="text-xl font-black text-white">Success!</h3>
                            <p className="text-gray-400">Your password has been reset. Redirecting to login...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-black text-gray-300 uppercase tracking-widest">New Password</label>
                                <div className="relative">
                                    <Lock className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl ps-12 pe-12 py-4 text-white outline-none focus:border-[#FF7A1A] transition-all"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute end-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Lock size={20} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-black text-gray-300 uppercase tracking-widest">Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-[#FF7A1A] transition-all"
                                    placeholder="••••••••"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !!error}
                                className="w-full bg-[#FF7A1A] hover:bg-[#e66c17] text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-[#FF7A1A]/20 flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {loading ? <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : 'Reset Password'}
                            </button>
                        </form>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#050B18] flex items-center justify-center"><div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" /></div>}>
            <ResetPasswordContent />
        </Suspense>
    );
}
