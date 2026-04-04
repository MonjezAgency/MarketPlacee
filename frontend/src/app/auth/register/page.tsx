'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Mail, Lock, User, Phone, ShieldCheck,
    ArrowRight, CheckCircle2, Building2,
    Eye, EyeOff, Globe, Link as LinkIcon,
    Tag, CreditCard, RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { signIn } from 'next-auth/react';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';

const EU_COUNTRIES = [
    'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Czech Republic',
    'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
    'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands',
    'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden'
];

function RegisterForm() {
    const searchParams = useSearchParams();
    const inviteEmail = searchParams.get('email') || '';
    const inviteToken = searchParams.get('invite') || '';
    const inviteRole = searchParams.get('role') || '';
    const [form, setForm] = useState({
        name: '', email: inviteEmail, phone: '', companyName: '', website: '', socialLinks: '', password: '', role: inviteRole || 'customer',
        vatNumber: '', taxId: '', country: '', bankAddress: '', iban: '', swiftCode: ''
    });
    const [viesStatus, setViesStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
    const [viesInfo, setViesInfo] = useState<{ name?: string, address?: string }>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // CAPTCHA state
    const generateCaptcha = useCallback(() => ({
        a: Math.floor(Math.random() * 12) + 1,
        b: Math.floor(Math.random() * 12) + 1,
    }), []);
    const [captcha, setCaptcha] = useState(() => ({ a: 7, b: 3 }));
    const [captchaAnswer, setCaptchaAnswer] = useState('');
    const [captchaError, setCaptchaError] = useState(false);
    useEffect(() => { setCaptcha(generateCaptcha()); }, [generateCaptcha]);

    const router = useRouter();
    const { register } = useAuth();
    const { locale } = useLanguage();

    const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

    const handleVatCheck = async (vat: string) => {
        if (vat.length < 3) return;
        setViesStatus('loading');
        try {
            // Simple split of country code and number (e.g. DE123456789)
            const countryCode = vat.substring(0, 2).toUpperCase();
            const vatNumber = vat.substring(2);

            const response = await fetch(`${'/api'}/auth/validate-vat?countryCode=${countryCode}&vatNumber=${vatNumber}`);
            const data = await response.json();

            if (data.valid) {
                setViesStatus('valid');
                setViesInfo({ name: data.name, address: data.address });
            } else {
                setViesStatus('invalid');
            }
        } catch (err) {
            // If API is unreachable, accept the VAT and mark for manual review
            setViesStatus('valid');
            setViesInfo({ name: '(Will be verified manually by admin)' });
        }
    };

    const handleRegister = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Strict Validation for Mandatory Fields
        if (!form.name || !form.email || !form.password || !form.phone || !form.companyName || !form.country) {
            setError('Please fill in all required business fields (Name, Email, Phone, Company, Country).');
            return;
        }

        if (form.taxId !== 'NOT_APPLICABLE' && !form.taxId) {
            setError('Please provide a Tax ID or check "No Tax ID/VAT"');
            return;
        }

        if (form.password.length < 6) { setError('Passwords must be at least 6 characters.'); return; }

        const isStrong = form.password.length >= 8 && /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) && /[0-9]/.test(form.password) && /[^A-Za-z0-9]/.test(form.password);
        if (!isStrong) { setError('Please meet all password requirements before submitting.'); return; }

        // CAPTCHA validation
        if (parseInt(captchaAnswer.trim()) !== captcha.a + captcha.b) {
            setCaptchaError(true);
            setCaptcha(generateCaptcha());
            setCaptchaAnswer('');
            setError('Incorrect verification answer. Please try the new challenge.');
            return;
        }

        setLoading(true);
        const submitRegister = async () => {
            const success = await register({
                name: form.name,
                email: form.email,
                phone: form.phone,
                companyName: form.companyName,
                website: form.website,
                socialLinks: form.socialLinks,
                password: form.password,
                role: form.role,
                inviteToken: inviteToken || undefined,
                vatNumber: form.vatNumber,
                taxId: form.taxId,
                country: form.country,
                bankAddress: form.role === 'supplier' ? form.bankAddress : undefined,
                iban: form.iban,
                swiftCode: form.swiftCode,
                locale,
            });

            if (!success) {
                if (typeof success === 'string') {
                    setError(success);
                } else {
                    setError('Unable to reach the registration server.');
                }
                setLoading(false);
                return;
            }
            setIsSuccess(true);
            setLoading(false);

            // If invited user, redirect to dashboard after 2 seconds
            if (inviteToken) {
                setTimeout(() => {
                    const dashboardPath = form.role === 'supplier' ? '/supplier' : '/';
                    router.push(dashboardPath);
                }, 2500);
            }
        };
        submitRegister();
    };

    const isEUCountry = EU_COUNTRIES.some(
        eu => form.country.toLowerCase().includes(eu.toLowerCase())
    );

    const inputClass = "w-full bg-slate-50 border-2 border-slate-50 rounded-[20px] px-6 py-4 text-[#0A1A2F] text-sm font-bold outline-none focus:bg-white focus:border-[#1BC7C9]/30 focus:shadow-[0_0_0_8px_rgba(255,138,0,0.05)] transition-all placeholder:text-slate-300";
    const labelClass = "text-[10px] font-black uppercase tracking-[0.2em] text-[#0A1A2F]/40 ms-2";

    return (
        <div className="force-light min-h-screen bg-white flex overflow-hidden font-sans" style={{ colorScheme: 'light' }}>
            {/* Left Side: Onboarding Content */}
            <motion.div
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="hidden lg:flex lg:w-[40%] relative bg-[#0A1A2F] items-center justify-center p-16 overflow-hidden"
            >
                <div className="absolute top-0 start-0 w-full h-full bg-gradient-to-br from-[#1BC7C9]/10 via-transparent to-blue-500/5" />

                <div className="relative z-10 space-y-12">
                    <Link href="/" className="inline-block mb-12">
                        <span className="font-heading font-black text-4xl tracking-tighter text-white">
                            Atlan<span className="text-[#1BC7C9]">tis</span>
                        </span>
                    </Link>

                    <div className="space-y-6">
                        <h2 className="text-4xl font-black text-white leading-tight">Scale Your <span className="text-[#1BC7C9]">Distribution</span> Globally.</h2>
                        <p className="text-[#B0B0C8] text-lg font-medium leading-relaxed">Join 500+ verified enterprise partners sourcing premium inventory through our secure B2B framework.</p>
                    </div>

                    <div className="space-y-8 pt-12 border-t border-white/10">
                        {[
                            { title: 'Verified Profiles', desc: 'Secure KYC validation for every partner.' },
                            { title: 'Smart Logistics', desc: 'Automated bulk shipping and warehousing.' },
                            { title: 'Net-Terms Credit', desc: 'Flexible financing for scale-up orders.' }
                        ].map((item, i) => (
                            <div key={i} className="flex gap-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#1BC7C9] mt-2.5 shrink-0 shadow-[0_0_10px_#1BC7C9]" />
                                <div>
                                    <h4 className="text-white font-black text-xs uppercase tracking-widest mb-1">{item.title}</h4>
                                    <p className="text-[#6B6B8D] text-sm">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Right Side: Form Panel */}
            <div className="w-full lg:w-[60%] flex items-center justify-center p-4 sm:p-8 md:p-12 lg:p-20 bg-[#F8FAFC] overflow-y-auto hide-scrollbar">
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="w-full max-w-2xl bg-white p-6 sm:p-0 sm:bg-transparent rounded-2xl sm:rounded-none shadow-sm sm:shadow-none"
                >
                    {isSuccess ? (
                        <div className="flex flex-col items-center text-center py-20 space-y-8">
                            <div className="w-24 h-24 rounded-[32px] bg-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                                <CheckCircle2 size={48} className="text-white" />
                            </div>
                            <div className="space-y-3">
                                <h1 className="text-4xl font-black text-[#0A1A2F] tracking-tight">Onboarding Initiated.</h1>
                                <p className="text-[#64748B] text-lg font-medium">Your enterprise profile is now under priority review.</p>
                            </div>
                            <div className="p-10 bg-white border border-slate-100 rounded-[40px] w-full text-start space-y-6 shadow-xl shadow-slate-200/50">
                                <div className="flex items-start gap-6">
                                    <div className="w-12 h-12 rounded-2xl bg-[#0A1A2F]/5 flex items-center justify-center shrink-0">
                                        <ShieldCheck size={24} className="text-[#0A1A2F]" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xs uppercase tracking-[0.2em] text-[#0A1A2F]">Identity Validation</h4>
                                        <p className="text-sm text-[#64748B] font-medium mt-2 leading-relaxed">Our compliance team is verifying your business credentials and tax documentation.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-6">
                                    <div className="w-12 h-12 rounded-2xl bg-[#1BC7C9]/10 flex items-center justify-center shrink-0">
                                        <Mail size={24} className="text-[#1BC7C9]" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xs uppercase tracking-[0.2em] text-[#1BC7C9]">Approval Protocol</h4>
                                        <p className="text-sm text-[#64748B] font-medium mt-2 leading-relaxed">You will receive an activation encrypted link once the review phase is completed.</p>
                                    </div>
                                </div>
                            </div>
                            <Link href="/" className="h-16 px-12 bg-[#0A1A2F] text-white text-xs font-black uppercase tracking-[0.3em] rounded-2xl hover:bg-[#162a44] transition-all flex items-center shadow-xl">
                                Return to Atlantis
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="mb-8 md:mb-12">
                                <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
                                    <div className="h-1 w-12 bg-[#1BC7C9] rounded-full" />
                                    <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.3em] text-[#1BC7C9]">Onboarding Flow</span>
                                </div>
                                <h1 className="text-3xl md:text-4xl font-black text-[#0A1A2F] tracking-tight text-center md:text-start">Register Business.</h1>
                                <p className="text-[#64748B] text-sm md:text-base font-medium mt-2 text-center md:text-start">Professional onboarding for verified B2B partners.</p>
                            </div>

                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-red-50 border border-red-100 rounded-2xl p-6 mb-10 text-red-700 text-sm font-bold"
                                >
                                    {error}
                                </motion.div>
                            )}

                            {/* Google Sign-up Button */}
                            {!inviteToken && (
                                <div className="mb-8">
                                    <button
                                        type="button"
                                        onClick={() => signIn('google', { callbackUrl: '/auth/google-sync' })}
                                        className="w-full h-14 bg-white border-2 border-slate-100 hover:border-slate-200 rounded-[20px] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest text-[#0A1A2F] transition-all hover:shadow-md"
                                    >
                                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                        </svg>
                                        Continue with Google
                                    </button>
                                    <div className="flex items-center gap-4 mt-6 mb-0">
                                        <div className="flex-1 h-px bg-slate-100" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Or register with email</span>
                                        <div className="flex-1 h-px bg-slate-100" />
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleRegister} className="space-y-10">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className={labelClass}>Full Name <span className="text-[#1BC7C9]">*</span></label>
                                        <input className={inputClass} placeholder="Authorized Signatory" value={form.name} onChange={e => update('name', e.target.value)} />
                                    </div>
                                    <div className="space-y-3">
                                        <label className={labelClass}>Work Email <span className="text-[#1BC7C9]">*</span></label>
                                        <input className={inputClass} placeholder="business@company.com" value={form.email} disabled={!!inviteEmail} onChange={e => update('email', e.target.value)} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className={labelClass}>Phone Context <span className="text-[#1BC7C9]">*</span></label>
                                        <input className={inputClass} placeholder="+20..." value={form.phone} onChange={e => update('phone', e.target.value)} />
                                    </div>
                                    <div className="space-y-3">
                                        <label className={labelClass}>Legal Entity <span className="text-[#1BC7C9]">*</span></label>
                                        <input className={inputClass} placeholder="Company Name" value={form.companyName} onChange={e => update('companyName', e.target.value)} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className={labelClass}>Corporate URL</label>
                                        <input className={inputClass} placeholder="https://..." value={form.website} onChange={e => update('website', e.target.value)} />
                                    </div>
                                    <div className="space-y-3">
                                        <label className={labelClass}>Linked Services</label>
                                        <input className={inputClass} placeholder="LinkedIn / Portfolio" value={form.socialLinks} onChange={e => update('socialLinks', e.target.value)} />
                                    </div>
                                </div>

                                {/* Business Identity & Tax */}
                                <div className="space-y-6 pt-6 border-t border-slate-100">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#0A1A2F]">Business Identity & Tax</h3>
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                                            <input
                                                type="checkbox"
                                                id="noTaxId"
                                                checked={form.taxId === 'NOT_APPLICABLE'}
                                                onChange={e => {
                                                    const isChecked = e.target.checked;
                                                    update('taxId', isChecked ? 'NOT_APPLICABLE' : '');
                                                    if (isChecked) {
                                                        update('vatNumber', '');
                                                        update('bankAddress', '');
                                                        update('iban', '');
                                                        update('swiftCode', '');
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-slate-300 text-[#1BC7C9] focus:ring-[#1BC7C9]"
                                            />
                                            <label htmlFor="noTaxId" className="text-[9px] font-black uppercase tracking-widest text-slate-400 cursor-pointer select-none">
                                                No Tax ID / VAT
                                            </label>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className={labelClass}>Operating Country <span className="text-[#1BC7C9]">*</span></label>
                                            <select 
                                                className={inputClass} 
                                                value={form.country} 
                                                onChange={e => update('country', e.target.value)}
                                            >
                                                <option value="">Select Country</option>
                                                <option value="Egypt">Egypt</option>
                                                <option value="Saudi Arabia">Saudi Arabia</option>
                                                <option value="UAE">UAE</option>
                                                <option value="Germany">Germany</option>
                                                <option value="France">France</option>
                                                <option value="USA">USA</option>
                                                <option value="UK">UK</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        {form.taxId !== 'NOT_APPLICABLE' && (
                                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                                <label className={labelClass}>Tax ID Number <span className="text-[#1BC7C9]">*</span></label>
                                                <input className={inputClass} placeholder="National Tax ID" value={form.taxId} onChange={e => update('taxId', e.target.value)} />
                                            </div>
                                        )}
                                    </div>

                                    {form.taxId !== 'NOT_APPLICABLE' && isEUCountry && (
                                        <div className="space-y-3 relative animate-in fade-in slide-in-from-top-2">
                                            <label className={labelClass}>VIES Valid Number (VAT)</label>
                                            <div className="relative">
                                                <input
                                                    className={cn(inputClass,
                                                        viesStatus === 'valid' && "border-emerald-500/30 bg-emerald-50/30",
                                                        viesStatus === 'invalid' && "border-red-500/30 bg-red-50/30"
                                                    )}
                                                    placeholder="e.g. DE123456789"
                                                    value={form.vatNumber}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        update('vatNumber', val);
                                                        if (val.length >= 3) handleVatCheck(val);
                                                        else setViesStatus('idle');
                                                    }}
                                                />
                                                <div className="absolute end-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                    {viesStatus === 'loading' && <div className="w-4 h-4 border-2 border-[#0A1A2F]/20 border-t-[#0A1A2F] rounded-full animate-spin" />}
                                                    {viesStatus === 'valid' && <CheckCircle2 size={20} className="text-emerald-500" />}
                                                    {viesStatus === 'invalid' && <span className="text-[10px] font-bold text-red-500 uppercase">Invalid</span>}
                                                </div>
                                            </div>
                                            {viesStatus === 'valid' && viesInfo.name && (
                                                <p className="text-[10px] font-bold text-emerald-600 ms-2 animate-in fade-in slide-in-from-top-1">
                                                    Verified: {viesInfo.name}
                                                </p>
                                            )}
                                            <p className="text-[9px] text-slate-400 font-medium ms-2">
                                                Real-time validation via <Link href="https://ec.europa.eu/taxation_customs/vies/#/vat-validation" target="_blank" className="underline hover:text-[#0A1A2F]">EU VIES</Link>
                                            </p>
                                        </div>
                                    )}

                                    {form.taxId === 'NOT_APPLICABLE' && (
                                        <div className="p-6 bg-slate-50 border-2 border-dashed border-slate-100 rounded-[32px] flex items-center gap-4 animate-in fade-in zoom-in-95">
                                            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                                                <Tag className="text-[#1BC7C9] w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#0A1A2F]">Personal Account Mode</h4>
                                                <p className="text-xs text-slate-400 font-medium mt-1">Tax identification skipped. Suitable for individuals or non-VAT entities.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Financial Details */}
                                {form.taxId !== 'NOT_APPLICABLE' && (
                                    <div className="space-y-6 pt-6 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-4">
                                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#0A1A2F]">Financial Details (Payouts)</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <label className={labelClass}>IBAN</label>
                                                <input className={inputClass} placeholder="International Bank Account Number" value={form.iban} onChange={e => update('iban', e.target.value)} />
                                            </div>
                                            <div className="space-y-3">
                                                <label className={labelClass}>Swift / BIC Code</label>
                                                <input className={inputClass} placeholder="Bank Identifier Code" value={form.swiftCode} onChange={e => update('swiftCode', e.target.value)} />
                                            </div>
                                        </div>
                                        {form.role === 'supplier' && (
                                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                                <label className={labelClass}>Bank Full Address</label>
                                                <textarea
                                                    className={cn(inputClass, "min-h-[100px] resize-none py-4")}
                                                    placeholder="Complete street address of your bank branch"
                                                    value={form.bankAddress}
                                                    onChange={e => update('bankAddress', e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <label className={labelClass}>Account Security</label>
                                    <div className="relative group">
                                        <input
                                            type={showPass ? 'text' : 'password'}
                                            className={inputClass + ' pe-16'}
                                            placeholder="Complexity-compliant password"
                                            value={form.password}
                                            onChange={e => update('password', e.target.value)}
                                        />
                                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute end-6 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#0A1A2F] transition-colors">
                                            {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { label: '8+ Characters', met: form.password.length >= 8 },
                                            { label: 'Uppercase & Lowercase', met: /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) },
                                            { label: 'Global Symbol', met: /[0-9]/.test(form.password) || /[^A-Za-z0-9]/.test(form.password) }
                                        ].map((req, idx) => (
                                            <span key={idx} className={`text-[9px] font-black uppercase tracking-wider px-4 py-2 rounded-full border transition-all ${req.met ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                {req.met && <CheckCircle2 size={10} className="inline me-1.5 -mt-0.5" />}
                                                {req.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {!inviteToken && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                                        <label className={labelClass}>Platform Operation Mode</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                type="button"
                                                onClick={() => update('role', 'customer')}
                                                className={`h-20 rounded-[24px] text-xs font-black uppercase tracking-widest border-2 transition-all flex flex-col items-center justify-center gap-1 ${form.role === 'customer' ? 'bg-[#0A1A2F] border-[#0A1A2F] text-white shadow-xl shadow-[#0A1A2F]/20' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                                            >
                                                <span className="text-lg">📦</span>
                                                Procurement Layer (Buyer)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => update('role', 'supplier')}
                                                className={`h-20 rounded-[24px] text-xs font-black uppercase tracking-widest border-2 transition-all flex flex-col items-center justify-center gap-1 ${form.role === 'supplier' ? 'bg-[#1BC7C9] border-[#1BC7C9] text-white shadow-xl shadow-[#1BC7C9]/20' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                                            >
                                                <span className="text-lg">🏢</span>
                                                Provisioning Layer (Supplier)
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* CAPTCHA Widget */}
                                <div className={cn(
                                    "p-5 rounded-[20px] border-2 transition-all",
                                    captchaError
                                        ? "border-red-200 bg-red-50/50"
                                        : "border-slate-100 bg-slate-50"
                                )}>
                                    <div className="flex items-center justify-between mb-3">
                                        <label className={labelClass}>Human Verification</label>
                                        <button
                                            type="button"
                                            onClick={() => { setCaptcha(generateCaptcha()); setCaptchaAnswer(''); setCaptchaError(false); }}
                                            className="text-slate-300 hover:text-[#1BC7C9] transition-colors"
                                            title="Refresh challenge"
                                        >
                                            <RefreshCw size={14} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 h-12 bg-white border-2 border-slate-100 rounded-[14px] flex items-center justify-center font-black text-[#0A1A2F] text-base tracking-widest select-none">
                                            {captcha.a} + {captcha.b} = ?
                                        </div>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            placeholder="Answer"
                                            value={captchaAnswer}
                                            onChange={e => { setCaptchaAnswer(e.target.value); setCaptchaError(false); }}
                                            className={cn(
                                                "w-28 h-12 bg-white border-2 rounded-[14px] px-4 text-center text-[#0A1A2F] font-black text-sm outline-none transition-all",
                                                captchaError
                                                    ? "border-red-300 focus:border-red-400"
                                                    : "border-slate-100 focus:border-[#1BC7C9]/40"
                                            )}
                                        />
                                    </div>
                                    {captchaError && (
                                        <p className="text-[10px] font-bold text-red-500 mt-2 ms-1">Incorrect answer. New challenge generated.</p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-14 md:h-20 bg-[#0A1A2F] hover:bg-[#162a44] text-white rounded-xl md:rounded-[24px] font-black uppercase tracking-[0.4em] text-[10px] md:text-xs transition-all shadow-2xl shadow-[#0A1A2F]/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-4 mt-8 group/btn relative overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000" />
                                    {loading ? (
                                        <div className="w-5 h-5 md:w-6 md:h-6 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <span>Create Profile</span>
                                            <ArrowRight size={20} className="transition-transform group-hover/btn:translate-x-1" />
                                        </>
                                    )}
                                </button>
                            </form>

                            <div className="mt-16 pt-8 border-t border-slate-100 text-center">
                                <p className="text-sm text-[#64748B] font-medium">
                                    Registered Partner?{' '}
                                    <Link href="/auth/login" className="text-[#1BC7C9] font-black uppercase tracking-widest text-xs hover:underline ms-2">
                                        Authenticate
                                    </Link>
                                </p>
                            </div>
                        </>
                    )}
                </motion.div>
            </div>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC] flex justify-center items-center text-[#0A1A2F] font-black uppercase tracking-[0.4em] text-xs">Synchronizing Atlantis Node...</div>}>
            <RegisterForm />
        </Suspense>
    );
}


