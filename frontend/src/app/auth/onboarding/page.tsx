'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Phone, Globe, Briefcase, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';

export default function OnboardingPage() {
    const { user, updateUser } = useAuth();
    const { t, locale } = useLanguage();
    const router = useRouter();
    const isAr = locale === 'ar';

    const [form, setForm] = React.useState({
        companyName: '',
        phone: '',
        country: 'United Arab Emirates',
        address: ''
    });

    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    // Pre-fill if user already has some data
    React.useEffect(() => {
        if (user) {
            setForm(prev => ({
                ...prev,
                companyName: user.companyName || '',
                phone: user.phone || '',
                country: user.country || 'United Arab Emirates'
            }));
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.companyName || !form.phone) {
            setError(isAr ? 'يرجى إكمال جميع الحقول المطلوبة' : 'Please complete all required fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`/api/users/${user?.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(form)
            });

            if (res.ok) {
                // Update local user state
                const updatedUser = await res.json();
                localStorage.setItem('bev-user', JSON.stringify(updatedUser));
                // Force auth context refresh if necessary, or just redirect
                router.push('/auth/pending');
            } else {
                setError(isAr ? 'فشل تحديث البيانات' : 'Failed to update profile details');
            }
        } catch (err) {
            setError(isAr ? 'خطأ في الاتصال' : 'Connection error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0A0D12] flex items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-secondary/10 rounded-full blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-xl w-full bg-slate-900/50 backdrop-blur-xl rounded-[32px] p-10 border border-white/10 shadow-2xl relative z-10"
            >
                <div className="mb-10 text-center">
                    <div className="w-20 h-20 bg-primary/20 rounded-[24px] flex items-center justify-center mx-auto mb-6 border border-primary/30">
                        <Briefcase className="text-primary w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight mb-3">
                        {isAr ? 'إكمال بيانات الشركة' : 'Complete Business Profile'}
                    </h1>
                    <p className="text-slate-400 text-sm max-w-sm mx-auto">
                        {isAr 
                            ? 'نحن بحاجة لبعض التفاصيل الإضافية لإكمال عملية التسجيل وتفعيل حسابك' 
                            : 'We need a few more details to complete your registration and activate your account.'}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm">
                        <ShieldCheck size={18} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                                {isAr ? 'اسم الشركة' : 'Company Name'} *
                            </label>
                            <div className="relative group">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
                                    <Building2 size={18} />
                                </span>
                                <input
                                    type="text"
                                    required
                                    placeholder={isAr ? 'اسم شركتك المسجل' : 'Your registered company'}
                                    value={form.companyName}
                                    onChange={e => setForm({ ...form, companyName: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-primary/50 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                                {isAr ? 'رقم الهاتف' : 'Phone Number'} *
                            </label>
                            <div className="relative group">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
                                    <Phone size={18} />
                                </span>
                                <input
                                    type="tel"
                                    required
                                    placeholder="+971 00 000 0000"
                                    value={form.phone}
                                    onChange={e => setForm({ ...form, phone: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-primary/50 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                            {isAr ? 'الدولة' : 'Country'}
                        </label>
                        <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
                                <Globe size={18} />
                            </span>
                            <select
                                value={form.country}
                                onChange={e => setForm({ ...form, country: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-primary/50 transition-all appearance-none"
                            >
                                <option value="United Arab Emirates" className="bg-slate-900">United Arab Emirates</option>
                                <option value="Saudi Arabia" className="bg-slate-900">Saudi Arabia</option>
                                <option value="Kuwait" className="bg-slate-900">Kuwait</option>
                                <option value="Qatar" className="bg-slate-900">Qatar</option>
                                <option value="Oman" className="bg-slate-900">Oman</option>
                                <option value="Bahrain" className="bg-slate-900">Bahrain</option>
                                <option value="Egypt" className="bg-slate-900">Egypt</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                            {isAr ? 'العنوان الرئيسي' : 'Header Office Address'}
                        </label>
                        <textarea
                            rows={2}
                            placeholder={isAr ? 'العنوان الكامل للشركة' : 'Full company address...'}
                            value={form.address}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-primary/50 transition-all resize-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-5 bg-gradient-to-r from-primary to-secondary text-[#0A0D12] font-black rounded-[20px] shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : (
                            <>
                                {isAr ? 'تأكيد البيانات' : 'Confirm Registration'}
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>

                <p className="mt-8 text-[10px] text-slate-500 text-center uppercase tracking-widest font-black">
                    Verified B2B Procurement Protocol • Secure Handshake
                </p>
            </motion.div>
        </div>
    );
}
