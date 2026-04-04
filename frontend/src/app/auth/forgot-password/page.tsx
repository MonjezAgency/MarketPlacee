'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowRight, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!email) {
            setError('Please enter your work email address.');
            return;
        }

        setLoading(true);
        try {
            await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`, { email });
            setSuccess(true);
            toast.success('Reset link sent!');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to send reset link');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050B18] flex items-center justify-center p-6 relative overflow-hidden">
            {/* Animated Background Gradients */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FF7A1A]/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[150px] animate-pulse" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-[450px] z-10"
            >
                {/* Logo Section */}
                <div className="text-center mb-10">
                    <Link href="/" className="inline-block group">
                        <motion.span
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            whileHover={{ scale: 1.05 }}
                            className="font-black text-4xl tracking-tighter text-white"
                        >
                            Market<span className="text-[#FF7A1A]">Place</span>
                        </motion.span>
                    </Link>
                    <p className="text-gray-400 mt-2 font-medium">Wholesale Sourcing Excellence</p>
                </div>

                {/* Form Card */}
                <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-10 shadow-2xl overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

                    <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                        Reset Password <Sparkles className="text-[#FF7A1A] w-6 h-6" />
                    </h1>
                    <p className="text-gray-400 text-sm font-medium mb-8">
                        Enter your work email address and we'll send you a secure link to reset your password.
                    </p>

                    {error && (
                        <motion.div
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6"
                        >
                            <p className="text-red-400 text-sm font-bold flex items-center gap-2">
                                <span className="bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px]">!</span>
                                {error}
                            </p>
                        </motion.div>
                    )}

                    {success ? (
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center space-y-4"
                        >
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                            </div>
                            <h3 className="text-xl font-black text-white">Check Your Inbox</h3>
                            <p className="text-sm font-medium text-gray-400 leading-relaxed">
                                We've sent a secure password reset link to <span className="text-white">{email}</span>. The link will expire in 15 minutes.
                            </p>
                            <Link href="/auth/login" className="mt-4 block w-full bg-white/10 hover:bg-white/20 text-white py-4 rounded-xl font-bold transition-all">
                                Return to Login
                            </Link>
                        </motion.div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-black text-gray-300 uppercase tracking-widest ms-1">Work Email</label>
                                <div className="relative">
                                    <Mail className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="name@company.com"
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl ps-12 pe-4 py-4 text-white outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/10 transition-all placeholder:text-gray-600 font-medium"
                                    />
                                </div>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#FF7A1A] hover:bg-[#e66c17] text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-[#FF7A1A]/20 flex items-center justify-center gap-3 disabled:opacity-50 transition-all"
                            >
                                {loading ? (
                                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>Send Reset Link <ArrowRight size={20} /></>
                                )}
                            </motion.button>
                        </form>
                    )}

                    <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400 border-t border-white/10 pt-8">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        Secure 256-bit Encryption
                    </div>
                </div>

                {/* Footer Link */}
                <p className="text-center mt-8 text-gray-500 font-medium tracking-tight">
                    Remember your password? {' '}
                    <Link href="/auth/login" className="text-white font-black hover:text-[#FF7A1A] underline-offset-8 hover:underline transition-all">
                        Sign In Instead
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
