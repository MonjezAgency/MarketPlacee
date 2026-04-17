'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('Authenticating...');
    const [error, setError] = useState('');
    // 2FA step state
    const [step, setStep] = useState<1 | 2>(1);
    const [partialToken, setPartialToken] = useState('');
    const [twoFACode, setTwoFACode] = useState('');
    const router = useRouter();
    const { login, verify2FALogin } = useAuth();
    const { t } = useLanguage();

    const redirectByRole = (role: string) => {
        const upper = role.toUpperCase();
        const teamRoles = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];
        if (teamRoles.includes(upper)) router.push('/admin');
        else if (upper === 'SUPPLIER') router.push('/supplier');
        else router.push('/');
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email || !password) { setError(t('auth', 'errorFillFields')); return; }

        setLoading(true);
        setLoadingMsg('Authenticating...');
        // Show "waking up" message after 6s so the user knows it's not frozen
        const slowTimer = setTimeout(() => setLoadingMsg('Waking up the server… please wait'), 3000);
        try {
            const result = await login(email, password);
            clearTimeout(slowTimer);

            if (result.requiresTwoFactor && result.partialToken) {
                setPartialToken(result.partialToken);
                setStep(2);
                setLoading(false);
                return;
            }

            if (!result.success) {
                setError(result.message || t('auth', 'errorInvalidCredentials'));
                setLoading(false);
                return;
            }

            if (!result.user?.role) {
                setError(t('auth', 'errorUnexpected'));
                setLoading(false);
                return;
            }

            redirectByRole(result.user.role);
        } catch (err: any) {
            clearTimeout(slowTimer);
            setError(err.message || t('auth', 'errorUnexpected'));
            setLoading(false);
        }
    };

    const handle2FAVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!twoFACode.trim()) { setError('يرجى إدخال رمز التحقق'); return; }

        setLoading(true);
        try {
            const result = await verify2FALogin(partialToken, twoFACode.trim());
            if (!result.success) {
                setError(result.message || 'رمز التحقق غير صحيح');
                setTwoFACode('');
                setLoading(false);
                return;
            }
            redirectByRole(result.user!.role);
        } catch (err: any) {
            setError(err.message || t('auth', 'errorUnexpected'));
            setLoading(false);
        }
    };

    return (
        <div className="force-light min-h-screen bg-white flex overflow-hidden font-sans" style={{ colorScheme: 'light' }}>
            {/* Left Side: Brand Visual Panel */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-[#0A1A2F] items-center justify-center p-12 overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 end-0 w-[800px] h-[800px] bg-[#FF8A00] opacity-[0.05] blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 start-0 w-[600px] h-[600px] bg-blue-500 opacity-[0.03] blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2" />

                <div className="relative z-10 max-w-lg">
                    <div className="mb-12">
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#FF8A00] bg-[#FF8A00]/10 px-4 py-2 rounded-full">
                            {t('auth', 'enterpriseB2B')}
                        </span>
                    </div>

                    <h2 className="text-5xl font-black text-white leading-tight mb-8">
                        {t('auth', 'futureBeverageSourcing')}
                    </h2>

                    <div className="space-y-6 text-[#B0B0C8] text-lg leading-relaxed">
                        <div className="flex items-start gap-4">
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-1">
                                <ShieldCheck size={14} className="text-emerald-500" />
                            </div>
                            <p>{t('auth', 'militaryGradeSecurity')}</p>
                        </div>
                        <p>{t('auth', 'streamlineSupplyChain')}</p>
                    </div>

                    {/* Mini Dashboard Teaser */}
                    <div className="mt-16 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-[40px] p-8 shadow-2xl">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-400/40" />
                                <div className="w-3 h-3 rounded-full bg-yellow-400/40" />
                                <div className="w-3 h-3 rounded-full bg-green-400/40" />
                            </div>
                            <div className="h-6 w-24 bg-white/5 rounded-full" />
                        </div>
                        <div className="space-y-4">
                            <div className="h-4 w-full bg-white/5 rounded-full" />
                            <div className="h-4 w-3/4 bg-white/5 rounded-full" />
                            <div className="h-8 w-1/4 bg-[#FF8A00]/20 rounded-full mt-6" />
                        </div>
                    </div>
                </div>

                {/* Vertical Brand Label */}
                <div className="absolute start-12 bottom-12 overflow-hidden">
                    <span className="text-[100px] font-black text-white/[0.02] select-none leading-none">ATLANTIS</span>
                </div>
            </div>

            {/* Right Side: Form Panel */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24 bg-[#F8FAFC]">
                <div className="w-full max-w-md bg-white p-6 sm:p-0 sm:bg-transparent rounded-2xl sm:rounded-none shadow-sm sm:shadow-none">
                    {/* Logo Mobile */}
                    <div className="lg:hidden mb-12 text-center">
                        <Link href="/" className="inline-block group">
                            <span className="font-heading font-black text-4xl tracking-tighter text-[#0A1A2F]">
                                Atlan<span className="text-[#FF8A00]">tis</span>
                            </span>
                        </Link>
                    </div>

                    <div className="mb-8 md:mb-10 text-center sm:text-start">
                        <h1 className="text-3xl md:text-4xl font-black text-[#0A1A2F] mb-2 md:mb-3 tracking-tight">{t('auth', 'loginTitle')}</h1>
                        <p className="text-slate-500 text-sm md:text-lg font-medium">{t('auth', 'loginSubtitle')}</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-8 flex items-start gap-4">
                            <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-red-600 font-black text-xs">!</span>
                            </div>
                            <p className="text-red-700 text-sm font-bold leading-snug">{error}</p>
                        </div>
                    )}

                    {/* ── Step 2: 2FA Verification ── */}
                    {step === 2 && (
                        <form onSubmit={handle2FAVerify} className="space-y-6">
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-4 mb-2">
                                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                                    <KeyRound size={16} className="text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-amber-800 text-sm font-black">التحقق بخطوتين مفعّل</p>
                                    <p className="text-amber-700 text-xs mt-1 font-medium">أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة الخاص بك</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 tracking-widest uppercase ms-1">رمز التحقق</label>
                                <div className="relative">
                                    <KeyRound className="absolute start-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        autoFocus
                                        value={twoFACode}
                                        onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                                        placeholder="000000"
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-[24px] ps-14 pe-6 py-5 text-2xl text-[#0A1A2F] font-black tracking-[0.5em] text-center outline-none focus:border-[#FF8A00]/30 focus:shadow-[0_0_0_8px_rgba(255,138,0,0.05)] transition-all placeholder:text-slate-200 placeholder:tracking-normal"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || twoFACode.length < 6}
                                className="group relative w-full h-[72px] bg-[#0A1A2F] hover:bg-[#FF8A00] text-white rounded-[24px] font-black text-sm tracking-[0.2em] uppercase overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#FF8A00]/20"
                            >
                                <div className="flex items-center justify-center gap-3">
                                    {loading ? (
                                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <span>تأكيد</span>
                                            <ArrowRight size={20} />
                                        </>
                                    )}
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => { setStep(1); setError(''); setTwoFACode(''); setPartialToken(''); }}
                                className="w-full text-center text-xs text-slate-400 hover:text-[#0A1A2F] font-bold tracking-widest uppercase transition-colors"
                            >
                                ← رجوع
                            </button>
                        </form>
                    )}

                    {/* ── Step 1: Email + Password ── */}
                    {step === 1 && <form onSubmit={handleLogin} className="space-y-8">
                        <div className="space-y-2">
                            <label className="block text-[10px] md:text-xs font-black text-slate-400 tracking-widest uppercase mb-2 ms-1">{t('auth', 'emailLabel')}</label>
                            <div className="relative">
                                <Mail className="absolute start-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#FF8A00] transition-colors" size={20} />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@atlantis.com"
                                    className="w-full bg-white sm:bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-[24px] ps-14 pe-6 py-4 md:py-5 text-sm md:text-base text-[#0A1A2F] font-bold outline-none focus:border-[#FF8A00]/30 focus:shadow-[0_0_0_8px_rgba(255,138,0,0.05)] transition-all placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        <div className="relative group">
                            <div className="flex justify-between items-center mb-2 md:mb-3 ms-1 pe-1">
                                <label className="block text-[10px] md:text-xs font-black text-slate-400 tracking-widest uppercase">{t('auth', 'passwordLabel')}</label>
                                <a href="/auth/forgot-password" className="text-[10px] md:text-xs font-black text-[#FF8A00] tracking-widest uppercase hover:text-[#0A1A2F] transition-colors">{t('auth', 'recovery')}</a>
                            </div>
                            <div className="relative">
                                <Lock className="absolute start-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#FF8A00] transition-colors" size={20} />
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-white sm:bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-[24px] ps-14 pe-14 py-4 md:py-5 text-sm md:text-base text-[#0A1A2F] font-bold outline-none focus:border-[#FF8A00]/30 focus:shadow-[0_0_0_8px_rgba(255,138,0,0.05)] transition-all placeholder:text-slate-300 tracking-[0.2em] focus:tracking-normal"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    className="absolute end-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0A1A2F] transition-colors"
                                >
                                    {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full h-14 md:h-[72px] bg-[#0A1A2F] hover:bg-[#FF8A00] text-white rounded-xl sm:rounded-[24px] font-black text-xs md:text-sm tracking-[0.2em] uppercase overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#FF8A00]/20"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                            <div className="flex items-center justify-center gap-3">
                                {loading ? (
                                    <span className="flex items-center gap-2.5">
                                        <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />
                                        <span className="text-xs tracking-wide">{loadingMsg}</span>
                                    </span>
                                ) : (
                                    <>
                                        <span>{t('auth', 'authenticate')}</span>
                                        <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
                                    </>
                                )}
                            </div>
                        </button>
                    </form>}

                    {/* Divider + Google — hidden during 2FA step */}
                    {step === 1 && <>
                    <div className="flex items-center gap-4 mt-8">
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Or</span>
                        <div className="flex-1 h-px bg-slate-100" />
                    </div>

                    <button
                        type="button"
                        onClick={() => signIn('google', { callbackUrl: '/auth/google-sync' })}
                        className="w-full h-14 mt-4 bg-white border-2 border-slate-100 hover:border-slate-200 rounded-xl sm:rounded-[24px] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest text-[#0A1A2F] transition-all hover:shadow-md"
                    >
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Continue with Google
                    </button>
                    </>}

                    <div className="mt-8 text-center">
                        <p className="text-[#64748B] font-medium text-sm">
                            {t('auth', 'partnershipInquiry')}{' '}
                            <Link href="/auth/register" className="text-[#FF8A00] font-black hover:underline ms-1 uppercase text-xs tracking-widest">
                                {t('auth', 'createBrandProfile')}
                            </Link>
                        </p>
                    </div>

                    {/* Social/Trust Badges Placeholder */}
                    <div className="mt-16 pt-8 border-t border-slate-100">
                        <div className="flex justify-center items-center gap-8 opacity-[0.4] grayscale hover:grayscale-0 transition-all duration-700">
                            <div className="h-4 w-16 bg-slate-300 rounded" />
                            <div className="h-4 w-16 bg-slate-300 rounded" />
                            <div className="h-4 w-16 bg-slate-300 rounded" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


