'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck, Smartphone, Mail, CheckCircle2, AlertCircle,
    Loader2, Lock, QrCode, Copy, Eye, EyeOff, KeyRound
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { apiFetch } from '@/lib/api';

export default function SecuritySettingsPage() {

    // Status
    const [twoFactorEnabled, setTwoFactorEnabled] = React.useState(false);
    const [loading, setLoading] = React.useState(true);

    // TOTP setup flow
    const [totpStep, setTotpStep] = React.useState<'idle' | 'setup' | 'verify' | 'done'>('idle');
    const [qrCode, setQrCode] = React.useState('');
    const [secret, setSecret] = React.useState('');
    const [totpToken, setTotpToken] = React.useState('');
    const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
    const [showSecret, setShowSecret] = React.useState(false);

    // Disable flow
    const [disableToken, setDisableToken] = React.useState('');
    const [disabling, setDisabling] = React.useState(false);
    const [showDisableForm, setShowDisableForm] = React.useState(false);

    // Email OTP test
    const [emailOtpStep, setEmailOtpStep] = React.useState<'idle' | 'sent' | 'verified'>('idle');
    const [emailOtpCode, setEmailOtpCode] = React.useState('');
    const [sendingOtp, setSendingOtp] = React.useState(false);

    const [toast, setToast] = React.useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [busy, setBusy] = React.useState(false);

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 4000);
    };

    React.useEffect(() => {
        apiFetch(`/auth/2fa/status`)
            .then(r => r.json())
            .then(d => { setTwoFactorEnabled(d.twoFactorEnabled); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const startTotpSetup = async () => {
        setBusy(true);
        try {
            const res = await apiFetch(`/auth/2fa/setup`, { method: 'POST' });
            const data = await res.json();
            setQrCode(data.qrCodeUrl);
            setSecret(data.secret);
            setTotpStep('setup');
        } catch { showToast('error', 'Failed to start 2FA setup'); }
        setBusy(false);
    };

    const enableTotp = async () => {
        if (totpToken.length !== 6) { showToast('error', 'Enter the 6-digit code from your authenticator app'); return; }
        setBusy(true);
        try {
            const res = await apiFetch(`/auth/2fa/enable`, {
                method: 'POST',
                body: JSON.stringify({ token: totpToken }),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            const data = await res.json();
            setBackupCodes(data.backupCodes || []);
            setTwoFactorEnabled(true);
            setTotpStep('done');
            showToast('success', 'Google Authenticator 2FA enabled!');
        } catch (err: any) { showToast('error', err.message || 'Invalid code'); }
        setBusy(false);
    };

    const disableTotp = async () => {
        if (!disableToken.trim()) { showToast('error', 'Enter your current 2FA code'); return; }
        setDisabling(true);
        try {
            const res = await apiFetch(`/auth/2fa/disable`, {
                method: 'POST',
                body: JSON.stringify({ token: disableToken }),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            setTwoFactorEnabled(false);
            setShowDisableForm(false);
            setDisableToken('');
            setTotpStep('idle');
            showToast('success', '2FA disabled.');
        } catch (err: any) { showToast('error', err.message || 'Invalid code'); }
        setDisabling(false);
    };

    const sendEmailOtp = async () => {
        setSendingOtp(true);
        try {
            const res = await apiFetch(`/auth/email-otp/send`, { method: 'POST' });
            if (!res.ok) throw new Error();
            setEmailOtpStep('sent');
            showToast('success', 'Verification code sent to your email');
        } catch { showToast('error', 'Failed to send code'); }
        setSendingOtp(false);
    };

    const verifyEmailOtp = async () => {
        if (emailOtpCode.length !== 6) { showToast('error', 'Enter the 6-digit code'); return; }
        try {
            const res = await apiFetch(`/auth/email-otp/verify`, {
                method: 'POST',
                body: JSON.stringify({ code: emailOtpCode }),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            setEmailOtpStep('verified');
            showToast('success', 'Email OTP verified successfully!');
        } catch (err: any) { showToast('error', err.message || 'Invalid code'); }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => showToast('success', 'Copied!'));
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="max-w-2xl mx-auto space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black">Security Settings</h1>
                    <p className="text-sm text-muted-foreground">Two-factor authentication and login verification</p>
                </div>
            </div>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className={cn("flex items-center gap-3 p-4 rounded-xl text-sm font-bold border",
                            toast.type === 'success' ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-700 dark:text-emerald-400"
                                : "bg-red-50 dark:bg-red-950/30 border-red-200 text-red-700 dark:text-red-400")}>
                        {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Google Authenticator (TOTP) Card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Smartphone size={20} className="text-primary" />
                        </div>
                        <div>
                            <p className="font-black text-sm">Google Authenticator (TOTP)</p>
                            <p className="text-xs text-muted-foreground">Time-based one-time passwords via any authenticator app</p>
                        </div>
                    </div>
                    <span className={cn(
                        "text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider",
                        twoFactorEnabled ? "text-emerald-500 bg-emerald-500/10" : "text-muted-foreground bg-muted"
                    )}>
                        {twoFactorEnabled ? '✓ Active' : 'Off'}
                    </span>
                </div>

                <div className="p-5">
                    {/* Enabled state */}
                    {twoFactorEnabled && totpStep !== 'done' && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">Your account is protected with Google Authenticator.</p>
                            {!showDisableForm ? (
                                <button onClick={() => setShowDisableForm(true)}
                                    className="px-5 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors">
                                    Disable 2FA
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-sm font-bold text-foreground">Enter your current authenticator code to disable:</p>
                                    <input
                                        type="text" inputMode="numeric" maxLength={6}
                                        value={disableToken} onChange={e => setDisableToken(e.target.value)}
                                        placeholder="6-digit code"
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-primary/50 tracking-widest text-center"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowDisableForm(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
                                        <button onClick={disableTotp} disabled={disabling}
                                            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                                            {disabling ? <Loader2 size={14} className="animate-spin" /> : null} Confirm Disable
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Setup flow */}
                    {!twoFactorEnabled && totpStep === 'idle' && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">Add an extra layer of security. You'll need an authenticator app like Google Authenticator, Authy, or 1Password.</p>
                            <button onClick={startTotpSetup} disabled={busy}
                                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors">
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={16} />} Enable Google Authenticator
                            </button>
                        </div>
                    )}

                    {totpStep === 'setup' && (
                        <div className="space-y-5">
                            <p className="text-sm font-bold">Step 1: Scan this QR code with your authenticator app</p>
                            {qrCode && (
                                <div className="flex justify-center">
                                    <div className="p-4 bg-white rounded-2xl border border-border shadow-sm">
                                        <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                                    </div>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground font-bold">Can't scan? Enter this code manually:</p>
                                <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-xl">
                                    <code className="flex-1 text-xs font-mono font-bold text-foreground break-all">
                                        {showSecret ? secret : secret.replace(/./g, '•')}
                                    </code>
                                    <button onClick={() => setShowSecret(v => !v)} className="text-muted-foreground hover:text-foreground">
                                        {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                    <button onClick={() => copyToClipboard(secret)} className="text-muted-foreground hover:text-primary">
                                        <Copy size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-bold">Step 2: Enter the 6-digit code from your app</p>
                                <input
                                    type="text" inputMode="numeric" maxLength={6}
                                    value={totpToken} onChange={e => setTotpToken(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-2xl font-mono outline-none focus:border-primary/50 tracking-[0.5em] text-center"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setTotpStep('idle'); setQrCode(''); setSecret(''); }}
                                    className="flex-1 py-3 border border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
                                <button onClick={enableTotp} disabled={busy || totpToken.length !== 6}
                                    className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-black disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Verify & Enable
                                </button>
                            </div>
                        </div>
                    )}

                    {totpStep === 'done' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-xl">
                                <CheckCircle2 className="text-emerald-500 w-6 h-6 shrink-0" />
                                <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">2FA enabled successfully!</p>
                            </div>
                            {backupCodes.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-black">Backup Codes — Save these!</p>
                                        <button onClick={() => copyToClipboard(backupCodes.join('\n'))}
                                            className="text-xs text-primary font-bold flex items-center gap-1 hover:underline">
                                            <Copy size={12} /> Copy All
                                        </button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Each code can only be used once. Store them securely.</p>
                                    <div className="grid grid-cols-4 gap-2">
                                        {backupCodes.map((code, i) => (
                                            <code key={i} className="p-2 bg-muted rounded-lg text-xs font-mono text-center font-bold">{code}</code>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Email OTP Card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <Mail size={20} className="text-blue-500" />
                        </div>
                        <div>
                            <p className="font-black text-sm">Email Verification Code (OTP)</p>
                            <p className="text-xs text-muted-foreground">One-time code sent to your registered email</p>
                        </div>
                    </div>
                    <span className={cn(
                        "text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider",
                        emailOtpStep === 'verified' ? "text-emerald-500 bg-emerald-500/10" : "text-blue-500 bg-blue-500/10"
                    )}>
                        {emailOtpStep === 'verified' ? '✓ Verified' : 'Available'}
                    </span>
                </div>
                <div className="p-5 space-y-4">
                    <p className="text-sm text-muted-foreground">Send a one-time code to your email address for additional verification.</p>

                    {emailOtpStep === 'idle' && (
                        <button onClick={sendEmailOtp} disabled={sendingOtp}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-600 transition-colors">
                            {sendingOtp ? <Loader2 size={14} className="animate-spin" /> : <Mail size={16} />} Send Code to Email
                        </button>
                    )}

                    {emailOtpStep === 'sent' && (
                        <div className="space-y-3">
                            <p className="text-sm font-bold">Enter the 6-digit code sent to your email:</p>
                            <input
                                type="text" inputMode="numeric" maxLength={6}
                                value={emailOtpCode} onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000"
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-2xl font-mono outline-none focus:border-primary/50 tracking-[0.5em] text-center"
                            />
                            <div className="flex gap-2">
                                <button onClick={sendEmailOtp} disabled={sendingOtp}
                                    className="flex-1 py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors">
                                    Resend
                                </button>
                                <button onClick={verifyEmailOtp} disabled={emailOtpCode.length !== 6}
                                    className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-black disabled:opacity-50 hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
                                    <KeyRound size={14} /> Verify Code
                                </button>
                            </div>
                        </div>
                    )}

                    {emailOtpStep === 'verified' && (
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-xl">
                            <CheckCircle2 className="text-emerald-500 w-5 h-5 shrink-0" />
                            <div>
                                <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">Email verified!</p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-500">Your email address is confirmed and active.</p>
                            </div>
                            <button onClick={() => { setEmailOtpStep('idle'); setEmailOtpCode(''); }}
                                className="ml-auto text-xs text-muted-foreground hover:text-foreground font-bold">
                                Test Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
