'use client';

/**
 * Emergency password reset — operator-facing escape hatch when
 * the normal login flow rejects them with "Invalid email or
 * password" despite correct-looking credentials. Often happens
 * after a partial DB import, a bcrypt-cost mismatch, or simply
 * forgetting which exact password was set.
 *
 * The page calls POST /auth/emergency-reset, which:
 *   1. Requires the SEED_ADMIN_SECRET env var to match.
 *   2. Overwrites the user's password with the supplied value.
 *   3. Forces status=ACTIVE and clears any lockout.
 *
 * This page is intentionally NOT linked from the public auth flow.
 * The operator reaches it directly via /auth/emergency-reset and
 * must paste the secret stored in Railway env to use it.
 */

import * as React from 'react';
import Link from 'next/link';
import { ShieldAlert, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function EmergencyResetPage() {
    const [email, setEmail] = React.useState('Info@atlantisfmcg.com');
    const [newPassword, setNewPassword] = React.useState('');
    const [secret, setSecret] = React.useState('');
    const [role, setRole] = React.useState('OWNER');
    const [showCreate, setShowCreate] = React.useState(false);

    const [isLoading, setIsLoading] = React.useState(false);
    const [result, setResult] = React.useState<any>(null);
    const [error, setError] = React.useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setResult(null);
        if (!email || !newPassword || !secret) {
            setError('All fields are required.');
            return;
        }
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        setIsLoading(true);
        try {
            // Use the Vercel proxy — emergency-reset is in the
            // PUBLIC_PATHS list so it goes through unauthenticated.
            const res = await fetch('/api/proxy/auth/emergency-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    newPassword,
                    secret,
                    ...(showCreate ? { role } : {}),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.ok) {
                setResult(data);
            } else {
                setError(data?.message || `Failed (status ${res.status}).`);
            }
        } catch (err: any) {
            setError(err?.message || 'Network error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-br from-amber-500 to-rose-500 p-8 text-white">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                            <ShieldAlert size={26} />
                        </div>
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-80">Atlantis Operator</p>
                            <h1 className="text-[24px] font-black">Emergency Password Reset</h1>
                        </div>
                    </div>
                    <p className="text-[13px] leading-relaxed opacity-90">
                        Use this only when the normal login keeps showing "Invalid email or password" with correct credentials. Requires the <code className="bg-black/20 px-1.5 py-0.5 rounded">SEED_ADMIN_SECRET</code> env var from Railway.
                    </p>
                </div>

                {result ? (
                    <div className="p-8 space-y-4 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500 mx-auto flex items-center justify-center">
                            <CheckCircle2 size={32} className="text-white" />
                        </div>
                        <h2 className="text-[20px] font-black text-slate-900">
                            {result.action === 'created' ? 'Account created' : 'Password reset'}
                        </h2>
                        <p className="text-[13px] text-slate-600">
                            User <strong>{email}</strong> ({result.role}) is now ACTIVE with the new password.
                        </p>
                        <Link
                            href="/auth/login"
                            className="inline-flex items-center gap-2 h-12 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-[12px] uppercase tracking-widest transition-all"
                        >
                            Go to login →
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-8 space-y-4">
                        {error && (
                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-[13px] text-rose-700 font-bold">
                                {error}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Account email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-[14px] font-bold outline-none focus:bg-white focus:border-amber-500"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">New password</label>
                            <input
                                type="text"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="At least 8 characters"
                                className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-[14px] font-mono font-bold outline-none focus:bg-white focus:border-amber-500"
                                required
                            />
                            <p className="text-[10px] text-slate-400">Type the password you want to use to log in afterwards. It will be hashed server-side.</p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">SEED_ADMIN_SECRET</label>
                            <input
                                type="password"
                                value={secret}
                                onChange={e => setSecret(e.target.value)}
                                placeholder="Paste the value from Railway → Variables"
                                className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-[14px] font-mono outline-none focus:bg-white focus:border-amber-500"
                                required
                                autoComplete="off"
                            />
                        </div>

                        <label className="flex items-center gap-2 text-[12px] font-bold text-slate-600 cursor-pointer pt-1">
                            <input
                                type="checkbox"
                                checked={showCreate}
                                onChange={() => setShowCreate(s => !s)}
                                className="accent-amber-500"
                            />
                            User doesn&apos;t exist yet — create the account
                        </label>

                        {showCreate && (
                            <div className="space-y-1.5 bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <label className="text-[11px] font-black uppercase tracking-widest text-amber-700">Create as role</label>
                                <select
                                    value={role}
                                    onChange={e => setRole(e.target.value)}
                                    className="w-full h-11 px-3 bg-white border border-amber-200 rounded-lg text-[13px] font-bold outline-none"
                                >
                                    <option value="OWNER">OWNER</option>
                                    <option value="ADMIN">ADMIN</option>
                                    <option value="MODERATOR">MODERATOR</option>
                                    <option value="SUPPORT">SUPPORT</option>
                                    <option value="DEVELOPER">DEVELOPER</option>
                                    <option value="LOGISTICS">LOGISTICS</option>
                                    <option value="EDITOR">EDITOR</option>
                                    <option value="SUPPLIER">SUPPLIER</option>
                                    <option value="CUSTOMER">CUSTOMER</option>
                                </select>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-slate-900 hover:bg-amber-500 text-white rounded-xl font-black uppercase text-[13px] tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                            {isLoading ? 'Resetting…' : 'Reset password'}
                        </button>

                        <Link
                            href="/auth/login"
                            className="inline-flex items-center gap-2 text-[12px] font-bold text-slate-500 hover:text-slate-700 mt-2"
                        >
                            <ArrowLeft size={14} /> Back to login
                        </Link>
                    </form>
                )}
            </div>
        </div>
    );
}
