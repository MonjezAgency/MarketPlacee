'use client';
import { apiFetch } from '@/lib/api';


import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    UserPlus,
    Link as LinkIcon,
    Mail,
    Copy,
    CheckCircle,
    Timer,
    ShieldCheck,
    Send,
    Trash2,
    PauseCircle,
    PlayCircle,
    Loader2,
    Sparkles,
    AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/config';

const API_URL = API_BASE_URL;

interface InviteToken {
    token: string;
    role: 'supplier' | 'customer';
    email?: string;
    expiresAt: string;
    used: boolean;
    paused?: boolean;
    emailSent?: boolean;
}

export default function AdminInvitePage() {
    const [role, setRole] = React.useState<'supplier' | 'customer'>('supplier');
    const [email, setEmail] = React.useState('');
    const [generatedLink, setGeneratedLink] = React.useState('');
    const [copied, setCopied] = React.useState(false);
    const [invites, setInvites] = React.useState<InviteToken[]>([]);
    const [isSendingEmail, setIsSendingEmail] = React.useState(false);
    const [emailResult, setEmailResult] = React.useState<{ success: boolean; message: string; previewUrl?: string } | null>(null);

    React.useEffect(() => {
        const saved = localStorage.getItem('marketplace-invites') || '[]';
        setInvites(JSON.parse(saved));
    }, []);

    const generateInvite = () => {
        const token = `SECURE-${role.toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const newInvite: InviteToken = {
            token,
            role,
            email: email || undefined,
            expiresAt,
            used: false
        };

        const updated = [newInvite, ...invites];
        setInvites(updated);
        localStorage.setItem('marketplace-invites', JSON.stringify(updated));

        const link = `${window.location.origin}/auth/register?invite=${token}&role=${role}${email ? `&email=${encodeURIComponent(email)}` : ''}`;
        setGeneratedLink(link);
        setEmailResult(null);
    };

    const sendInviteEmail = async () => {
        if (!email) {
            setEmailResult({ success: false, message: 'Please enter a partner email address first.' });
            return;
        }
        if (!generatedLink) {
            setEmailResult({ success: false, message: 'Please generate an invite link first.' });
            return;
        }

        setIsSendingEmail(true);
        setEmailResult(null);

        try {
            const res = await apiFetch(`/admin/team/send-invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    
                },
                body: JSON.stringify({
                    email,
                    role,
                    inviteLink: generatedLink,
                }),
            });

            const data = await res.json();

            if (res.ok && data.success !== false) {
                setEmailResult({
                    success: true,
                    message: `Invitation email sent to ${email}!`,
                    previewUrl: data.previewUrl || undefined,
                });

                // Mark invite as email sent
                const updated = invites.map(inv =>
                    inv.email === email && !inv.emailSent ? { ...inv, emailSent: true } : inv
                );
                setInvites(updated);
                localStorage.setItem('marketplace-invites', JSON.stringify(updated));
            } else if (res.status === 401) {
                setEmailResult({
                    success: false,
                    message: 'Your session has expired. Please log out and sign in again.',
                });
            } else {
                setEmailResult({
                    success: false,
                    message: data.error || data.message || 'Failed to send email. Check backend connection.',
                });
            }
        } catch (err) {
            console.error('Send invite email error:', err);
            setEmailResult({
                success: false,
                message: 'Failed to send email. Please check backend connection and SMTP settings.',
            });
        } finally {
            setIsSendingEmail(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const deleteInvite = (token: string) => {
        const updated = invites.filter(inv => inv.token !== token);
        setInvites(updated);
        localStorage.setItem('marketplace-invites', JSON.stringify(updated));
    };

    const togglePause = (token: string) => {
        const updated = invites.map(inv => inv.token === token ? { ...inv, paused: !inv.paused } : inv);
        setInvites(updated);
        localStorage.setItem('marketplace-invites', JSON.stringify(updated));
    };

    return (
        <div className="max-w-5xl mx-auto space-y-12">
            {/* Header */}
            <div className="space-y-1">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Invite Center</h1>
                <p className="text-muted-foreground font-medium">Generate secure, single-use onboarding links and send branded invitation emails.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Generation Form */}
                <div className="bg-card p-8 rounded-3xl border border-border/50 space-y-8 shadow-sm">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Select Target Role</label>
                            <div className="flex gap-3">
                                {['supplier', 'customer'].map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => setRole(r as 'supplier' | 'customer')}
                                        className={cn(
                                            "flex-1 py-4 rounded-xl font-black text-sm border transition-all uppercase tracking-tighter",
                                            role === r
                                                ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                                                : "bg-muted/50 text-muted-foreground border-border/50 hover:border-border"
                                        )}
                                    >
                                        {r === 'supplier' ? '🏢 ' : '📦 '}{r}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Partner Emails</label>
                            <textarea
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com, info@partner.io ..."
                                className="w-full h-24 bg-muted rounded-xl border border-border/50 p-4 outline-none focus:border-primary/50 text-foreground font-medium resize-none"
                            />
                            <p className="text-[10px] text-muted-foreground italic">Separate multiple emails with commas or new lines.</p>
                        </div>

                        <button
                            onClick={generateInvite}
                            className="w-full py-5 bg-primary text-primary-foreground font-black rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/10 flex items-center justify-center gap-3"
                        >
                            <UserPlus size={20} strokeWidth={3} /> Generate Secure Link
                        </button>
                    </div>

                    <AnimatePresence>
                        {generatedLink && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="pt-8 border-t border-border/50 space-y-5"
                            >
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                                    <ShieldCheck className="text-emerald-400" size={20} />
                                    <span className="text-[11px] text-emerald-400 font-black uppercase tracking-widest">Token Secured (24h Expiry)</span>
                                </div>
                                <div className="flex items-center gap-2 group">
                                    <div className="flex-1 h-12 bg-black/40 rounded-xl px-4 flex items-center font-mono text-xs text-primary truncate border border-border/50">
                                        {generatedLink}
                                    </div>
                                    <button
                                        onClick={copyToClipboard}
                                        className="h-12 w-12 bg-muted/50 hover:bg-muted text-foreground rounded-xl flex items-center justify-center transition-all border border-border/50"
                                        title="Copy Link"
                                    >
                                        {copied ? <CheckCircle size={18} className="text-emerald-400" /> : <Copy size={18} />}
                                    </button>
                                </div>

                                {/* Send Email Button */}
                                <button
                                    onClick={sendInviteEmail}
                                    disabled={isSendingEmail || !email}
                                    className={cn(
                                        "w-full py-4 rounded-xl font-black text-sm flex items-center justify-center gap-3 transition-all",
                                        email
                                            ? "bg-gradient-to-r from-[#FF8A00] to-[#FF6B00] text-white shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-95"
                                            : "bg-muted text-muted-foreground cursor-not-allowed"
                                    )}
                                >
                                    {isSendingEmail ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" /> Sending to Pool...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={18} /> Send Bulk Invitations
                                        </>
                                    )}
                                </button>

                                {/* Email Result */}
                                <AnimatePresence>
                                    {emailResult && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className={cn(
                                                "p-4 rounded-xl border flex items-start gap-3 text-sm",
                                                emailResult.success
                                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                                    : "bg-red-500/10 border-red-500/20 text-red-400"
                                            )}
                                        >
                                            {emailResult.success ? (
                                                <Sparkles size={18} className="shrink-0 mt-0.5" />
                                            ) : (
                                                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                                            )}
                                            <div>
                                                <p className="font-bold">{emailResult.message}</p>
                                                {emailResult.previewUrl && (
                                                    <a
                                                        href={emailResult.previewUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs underline mt-1 inline-block opacity-80 hover:opacity-100"
                                                    >
                                                        👀 Preview email in browser (Ethereal)
                                                    </a>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* History */}
                <div className="space-y-6">
                    <h2 className="text-xl font-black text-foreground flex items-center gap-3">
                        <Timer className="text-primary" /> Atlantis Invites
                    </h2>

                    <div className="space-y-4 max-h-[500px] overflow-y-auto no-scrollbar pb-10">
                        {invites.length > 0 ? invites.map((invite, i) => (
                            <div key={invite.token} className="p-5 bg-card rounded-2xl border border-border/50 flex items-center justify-between group hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center font-black text-[10px] uppercase",
                                        invite.role === 'supplier' ? "bg-primary/10 text-primary" : "bg-blue-500/10 text-blue-400"
                                    )}>
                                        {invite.role[0]}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-foreground uppercase tracking-tight truncate max-w-[150px]">
                                            {invite.email || 'Open Invite'}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-muted-foreground font-medium">Exp: {new Date(invite.expiresAt).toLocaleDateString()}</span>
                                            {invite.emailSent && (
                                                <span className="text-[9px] font-bold text-[#FF8A00] flex items-center gap-0.5">
                                                    <Mail size={9} /> Sent
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {invite.used ? (
                                        <div className="px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                                            <span className="text-[9px] font-black text-emerald-400 uppercase">Onboarded</span>
                                        </div>
                                    ) : (
                                        <div className="px-3 py-1 bg-amber-500/10 rounded-full border border-amber-500/20">
                                            <span className="text-[9px] font-black text-amber-400 uppercase italic">
                                                {invite.paused ? 'Paused' : 'Pending'}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 border-s border-border/50 ps-3 ms-1">
                                        {!invite.used && (
                                            <button
                                                onClick={() => togglePause(invite.token)}
                                                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
                                                title={invite.paused ? "Resume Invite" : "Pause Invite"}
                                            >
                                                {invite.paused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteInvite(invite.token)}
                                            className="p-1.5 text-red-500/40 hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10 group/btn"
                                            title="Delete Invite"
                                        >
                                            <Trash2 size={16} className="group-hover/btn:scale-110 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-20 bg-muted/50 rounded-3xl border border-dashed border-border/50">
                                <LinkIcon size={40} className="mx-auto text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground text-sm font-medium">No active invite tokens found.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
