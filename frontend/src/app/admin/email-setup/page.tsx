'use client';

import * as React from 'react';
import { MailCheck, Monitor, Smartphone, Send, UserSearch } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button, Card, Notice, PageHeader, Badge, inputCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

const get = async (path: string, init?: RequestInit, fallback = 'Request failed.') => {
    const res = await apiFetch(path, init);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : fallback);
    return d;
};

/**
 * Email setup checks for the owner/admin (dictionary section `adminEmailTools`):
 * provider configuration (no secret values), a preview of the real templates
 * with catalog data, a consent lookup for one account, and a test send that
 * only goes to YOUR address. Explanations returned by the server (domain
 * check, sender issue, consent reason, provider note) are shown as sent.
 */
export default function EmailSetupPage() {
    const { t, fmt } = useLanguage();
    const tk = React.useCallback((k: string, v?: Record<string, string | number>) => t('adminEmailTools', k, v), [t]);
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
    const failed = tk('requestFailed');

    React.useEffect(() => { get('/admin/email/status', undefined, failed).then(setStatus).catch((e) => setErr(e.message)); }, [failed]);
    React.useEffect(() => { setPreview(null); get(`/admin/email/preview?template=${template}`, undefined, failed).then(setPreview).catch((e) => setErr(e.message)); }, [template, failed]);

    const lookup = async () => { setConsent(null); setErr(null); try { setConsent(await get(`/admin/email/consent?email=${encodeURIComponent(email.trim())}`, undefined, failed)); } catch (e: any) { setErr(e.message); } };
    const testSend = async () => {
        setSending(true); setSent(null); setErr(null);
        try { setSent(await get('/admin/email/test-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template }) }, failed)); }
        catch (e: any) { setErr(e.message); } finally { setSending(false); }
    };

    const providerLabel = (p: string) => (p === 'resend' ? tk('providerResend') : p === 'smtp' ? tk('providerSmtp') : tk('providerNone'));
    const date = (d: string) => fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric' });
    const acc = consent?.account;
    const nl = consent?.newsletter;

    return (
        <div className="max-w-6xl space-y-5 text-start">
            <PageHeader title={tk('setupTitle')} description={tk('setupIntro')} />
            {err && <Notice tone="danger">{err}</Notice>}

            <Card>
                <h2 className="text-[15px] font-semibold text-heading flex items-center gap-2"><MailCheck size={16} className="text-teal" /> {tk('provider')}</h2>
                {!status ? <div className="mt-3 h-20 rounded-lg bg-surface-2 animate-pulse" /> : (
                    <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-[13.5px]">
                        <div><dt className="text-ink-3">{tk('providerInUse')}</dt><dd className="font-medium">{providerLabel(status.provider)}</dd></div>
                        <div><dt className="text-ink-3">{tk('sender')}</dt><dd className="font-medium">{status.resendFrom ? <bdi dir="ltr">{status.resendFrom}</bdi> : tk('senderUnset')}</dd></div>
                        <div><dt className="text-ink-3">{tk('domain')}</dt><dd className="font-medium">{status.domainCheck}</dd></div>
                        <div><dt className="text-ink-3">{tk('replyTo')}</dt><dd className="font-medium"><bdi dir="ltr">{status.replyTo}</bdi></dd></div>
                        {status.senderIssue && <div className="sm:col-span-2"><Notice tone="warning">{status.senderIssue}</Notice></div>}
                    </dl>
                )}
            </Card>

            <Card>
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-heading flex-1">{tk('preview')}</h2>
                    <select value={template} onChange={(e) => setTemplate(e.target.value as any)} aria-label={tk('templateLabel')} className={cn(inputCls, 'w-auto')}>
                        <option value="product-update">{tk('tplUpdate')}</option>
                        <option value="review">{tk('tplReview')}</option>
                    </select>
                    <div role="radiogroup" aria-label={tk('widthLabel')} className="inline-flex rounded-lg ring-1 ring-line p-0.5">
                        <button type="button" role="radio" aria-checked={width === 'desktop'} onClick={() => setWidth('desktop')} className={cn('h-8 px-2.5 rounded-md', width === 'desktop' && 'bg-surface-2')} aria-label={tk('desktop')}><Monitor size={15} /></button>
                        <button type="button" role="radio" aria-checked={width === 'mobile'} onClick={() => setWidth('mobile')} className={cn('h-8 px-2.5 rounded-md', width === 'mobile' && 'bg-surface-2')} aria-label={tk('mobile')}><Smartphone size={15} /></button>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setShowText((v) => !v)}>{showText ? tk('showHtml') : tk('showText')}</Button>
                </div>
                {preview && (
                    <>
                        <dl className="mt-3 grid gap-1 text-[13px]">
                            <div className="flex gap-2"><dt className="w-24 shrink-0 text-ink-3">{tk('subject')}</dt><dd className="font-medium">{preview.subject}</dd></div>
                            <div className="flex gap-2"><dt className="w-24 shrink-0 text-ink-3">{tk('from')}</dt><dd><bdi dir="ltr">{preview.from}</bdi> · {tk('replyToShort', { address: preview.replyTo })}</dd></div>
                            <div className="flex gap-2"><dt className="w-24 shrink-0 text-ink-3">{tk('preheader')}</dt><dd className="text-ink-2">{preview.preheader}</dd></div>
                        </dl>
                        <div className="mt-3 rounded-xl ring-1 ring-line bg-surface-2 p-3 flex justify-center">
                            {showText ? <pre className="w-full max-w-[640px] whitespace-pre-wrap text-[12.5px] bg-surface p-4 rounded-lg ring-1 ring-line">{preview.text}</pre>
                                : <iframe title={tk('previewFrame')} sandbox="" srcDoc={preview.html} className="bg-white rounded-lg ring-1 ring-line" style={{ width: width === 'mobile' ? 375 : 680, height: 720, maxWidth: '100%' }} />}
                        </div>
                    </>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button variant="primary" icon={<Send size={14} />} loading={sending} onClick={testSend}>{tk('testOwn')}</Button>
                    <p className="text-[12.5px] text-ink-3">{tk('testOwnHint')}</p>
                </div>
                {sent && (
                    <Notice tone={sent.accepted ? 'success' : 'danger'}>
                        {sent.accepted
                            ? <span>{tk('accepted', { provider: sent.provider, email: sent.sentTo })}{sent.messageId ? <> {tk('messageId', { id: sent.messageId })}</> : null} {sent.note}</span>
                            : <span>{tk('notSent', { reason: sent.error || failed })}</span>}
                    </Notice>
                )}
            </Card>

            <Card>
                <h2 className="text-[15px] font-semibold text-heading flex items-center gap-2"><UserSearch size={16} className="text-teal" /> {tk('consentTitle')}</h2>
                <p className="mt-1 text-[12.5px] text-ink-3">{tk('consentHint')}</p>
                <div className="mt-3 flex gap-2 max-w-xl">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email.trim() && lookup()} placeholder={tk('emailLabel')} aria-label={tk('emailLabel')} className={inputCls} />
                    <Button onClick={lookup} disabled={!email.trim()}>{tk('check')}</Button>
                </div>
                {consent && (
                    <div className="mt-3 space-y-2 text-[13.5px]">
                        <p className="flex flex-wrap items-center gap-2">{consent.marketingEligible ? <Badge tone="success">{tk('mayReceive')}</Badge> : <Badge tone="danger">{tk('doNotSend')}</Badge>} <span className="text-ink-2">{consent.reason}</span></p>
                        <p className="text-ink-3">
                            {acc?.exists
                                ? <>{tk('accountLine', { role: acc.role, status: acc.status })} {!acc.preferenceStored ? tk('marketingNeverSet') : acc.marketingEmailsOptIn ? tk('marketingOn') : tk('marketingOff')}</>
                                : tk('noAccount')}
                        </p>
                        <p className="text-ink-3">
                            {nl
                                ? <>{tk('newsletterStatus', { status: nl.status })}{nl.confirmedAt ? <> {tk('newsletterConfirmed', { date: date(nl.confirmedAt) })}</> : null}{nl.unsubscribedAt ? <> {tk('newsletterUnsubscribed', { date: date(nl.unsubscribedAt) })}</> : null}</>
                                : tk('newsletterNone')}
                        </p>
                    </div>
                )}
            </Card>
        </div>
    );
}
