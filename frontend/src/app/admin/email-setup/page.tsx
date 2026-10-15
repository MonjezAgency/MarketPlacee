'use client';

import * as React from 'react';
import { MailCheck, Monitor, Smartphone, Send, UserSearch } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button, Card, Notice, PageHeader, Badge, inputCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

const get = async (path: string, init?: RequestInit) => {
    const res = await apiFetch(path, init);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : 'Request failed.');
    return d;
};

/**
 * Email setup checks for the owner/admin: provider configuration (no secret
 * values), a preview of the real templates with catalog data, a consent
 * lookup for one account, and a test send that only goes to YOUR address.
 */
export default function EmailSetupPage() {
    const [status, setStatus] = React.useState<any | null>(null);
    const [template, setTemplate] = React.useState<'product-update' | 'review'>('product-update');
    const [preview, setPreview] = React.useState<any | null>(null);
    const [width, setWidth] = React.useState<'desktop' | 'mobile'>('desktop');
    const [showText, setShowText] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const [email, setEmail] = React.useState('');
    const [consent, setConsent] = React.useState<any | null>(null);
    const [sending, setSending] = React.useState(false);
    const [sent, setSent] = React.useState<any | null>(null);

    React.useEffect(() => { get('/admin/email/status').then(setStatus).catch((e) => setErr(e.message)); }, []);
    React.useEffect(() => { setPreview(null); get(`/admin/email/preview?template=${template}`).then(setPreview).catch((e) => setErr(e.message)); }, [template]);

    const lookup = async () => { setConsent(null); setErr(null); try { setConsent(await get(`/admin/email/consent?email=${encodeURIComponent(email.trim())}`)); } catch (e: any) { setErr(e.message); } };
    const testSend = async () => {
        setSending(true); setSent(null); setErr(null);
        try { setSent(await get('/admin/email/test-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template }) })); }
        catch (e: any) { setErr(e.message); } finally { setSending(false); }
    };

    return (
        <div className="max-w-6xl space-y-5 text-start">
            <PageHeader title="Email setup & preview" description="Check the email provider, preview the real templates, and check one account’s marketing consent before anything is sent." />
            {err && <Notice tone="danger">{err}</Notice>}

            <Card>
                <h2 className="text-[15px] font-semibold text-heading flex items-center gap-2"><MailCheck size={16} className="text-teal" /> Provider</h2>
                {!status ? <div className="mt-3 h-20 rounded-lg bg-surface-2 animate-pulse" /> : (
                    <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-[13.5px]">
                        <div><dt className="text-ink-3">Provider in use</dt><dd className="font-medium">{status.provider === 'resend' ? 'Resend (API)' : status.provider === 'smtp' ? 'SMTP only' : 'None configured'}</dd></div>
                        <div><dt className="text-ink-3">Sender address</dt><dd className="font-medium">{status.resendFrom || 'not set (onboarding@resend.dev)'}</dd></div>
                        <div><dt className="text-ink-3">Sending domain</dt><dd className="font-medium">{status.domainCheck}</dd></div>
                        <div><dt className="text-ink-3">Replies go to</dt><dd className="font-medium">{status.replyTo}</dd></div>
                        {status.senderIssue && <div className="sm:col-span-2"><Notice tone="warning">{status.senderIssue}</Notice></div>}
                    </dl>
                )}
            </Card>

            <Card>
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-heading flex-1">Preview</h2>
                    <select value={template} onChange={(e) => setTemplate(e.target.value as any)} aria-label="Template" className={cn(inputCls, 'w-auto')}>
                        <option value="product-update">Marketplace update (marketing)</option>
                        <option value="review">New review (to supplier)</option>
                    </select>
                    <div role="radiogroup" aria-label="Preview width" className="inline-flex rounded-lg ring-1 ring-line p-0.5">
                        <button role="radio" aria-checked={width === 'desktop'} onClick={() => setWidth('desktop')} className={cn('h-8 px-2.5 rounded-md', width === 'desktop' && 'bg-surface-2')} aria-label="Desktop"><Monitor size={15} /></button>
                        <button role="radio" aria-checked={width === 'mobile'} onClick={() => setWidth('mobile')} className={cn('h-8 px-2.5 rounded-md', width === 'mobile' && 'bg-surface-2')} aria-label="Mobile"><Smartphone size={15} /></button>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setShowText((v) => !v)}>{showText ? 'Show HTML' : 'Show plain text'}</Button>
                </div>
                {preview && (
                    <>
                        <dl className="mt-3 grid gap-1 text-[13px]">
                            <div className="flex gap-2"><dt className="w-20 text-ink-3">Subject</dt><dd className="font-medium">{preview.subject}</dd></div>
                            <div className="flex gap-2"><dt className="w-20 text-ink-3">From</dt><dd>{preview.from} · reply-to {preview.replyTo}</dd></div>
                            <div className="flex gap-2"><dt className="w-20 text-ink-3">Preheader</dt><dd className="text-ink-2">{preview.preheader}</dd></div>
                        </dl>
                        <div className="mt-3 rounded-xl ring-1 ring-line bg-surface-2 p-3 flex justify-center">
                            {showText ? <pre className="w-full max-w-[640px] whitespace-pre-wrap text-[12.5px] bg-surface p-4 rounded-lg ring-1 ring-line">{preview.text}</pre>
                                : <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="bg-white rounded-lg ring-1 ring-line" style={{ width: width === 'mobile' ? 375 : 680, height: 720, maxWidth: '100%' }} />}
                        </div>
                    </>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button variant="primary" icon={<Send size={14} />} loading={sending} onClick={testSend}>Send one test to my own address</Button>
                    <p className="text-[12.5px] text-ink-3">Goes only to the email of the account you’re signed in with (max 3 per hour). Nothing is sent to customers or suppliers from here.</p>
                </div>
                {sent && (
                    <Notice tone={sent.accepted ? 'success' : 'danger'}>
                        {sent.accepted ? <>Accepted by {sent.provider} for {sent.sentTo}{sent.messageId ? <> — message ID <code>{sent.messageId}</code></> : null}. {sent.note}</> : <>Not sent: {sent.error}</>}
                    </Notice>
                )}
            </Card>

            <Card>
                <h2 className="text-[15px] font-semibold text-heading flex items-center gap-2"><UserSearch size={16} className="text-teal" /> Marketing consent of one account</h2>
                <p className="mt-1 text-[12.5px] text-ink-3">Enter the full, exact email. Marketing may only be sent when consent is recorded and the person hasn’t unsubscribed.</p>
                <div className="mt-3 flex gap-2 max-w-xl">
                    <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="name@company.com" aria-label="Email address" className={inputCls} />
                    <Button onClick={lookup} disabled={!email.trim()}>Check</Button>
                </div>
                {consent && (
                    <div className="mt-3 space-y-2 text-[13.5px]">
                        <p className="flex items-center gap-2">{consent.marketingEligible ? <Badge tone="success">May receive marketing</Badge> : <Badge tone="danger">Do not send marketing</Badge>} <span className="text-ink-2">{consent.reason}</span></p>
                        <p className="text-ink-3">Account: {consent.account.exists ? `${consent.account.role}, ${consent.account.status}; marketing emails ${consent.account.marketingEmailsOptIn ? 'ON' : 'off'}${consent.account.preferenceStored ? '' : ' (never set — off by default)'}` : 'no account with this email'}.</p>
                        <p className="text-ink-3">Newsletter: {consent.newsletter ? `${consent.newsletter.status}${consent.newsletter.confirmedAt ? `, confirmed ${new Date(consent.newsletter.confirmedAt).toLocaleDateString('en-GB')}` : ''}${consent.newsletter.unsubscribedAt ? `, unsubscribed ${new Date(consent.newsletter.unsubscribedAt).toLocaleDateString('en-GB')}` : ''}` : 'not subscribed'}.</p>
                    </div>
                )}
            </Card>
        </div>
    );
}
