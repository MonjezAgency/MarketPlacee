'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, Monitor, Plus, RefreshCw, Search, Send, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, Button, Card, ConfirmProvider, Dialog, ErrorState, Field, Notice, PageHeader, Skeleton, Thumb, inputCls, selectCls } from '@/components/supplier/ui';
import {
    newsletterApi, type AudienceCount, type AudienceKind, type CampaignDetail, type CampaignDraft, type CampaignPreview, type CampaignTemplate, type EmailProduct,
} from '@/lib/admin-newsletter-api';
import { CampaignStatusBadge, useInt, useTn, useWhen } from './newsletterUi';

const STEPS = ['details', 'audience', 'content', 'preview', 'review'] as const;
type Step = (typeof STEPS)[number];
const TEMPLATES: CampaignTemplate[] = ['ANNOUNCEMENT', 'PRODUCTS', 'BLANK'];
const AUDIENCES: AudienceKind[] = ['NEWSLETTER', 'ACCOUNTS', 'ALL'];
const textareaCls = inputCls.replace('h-10', 'min-h-[120px] py-2');
type SaveFn = (quiet?: boolean) => Promise<string | null>; // i18n-ignore: TypeScript generic, not text
const EMPTY: CampaignDraft = { subject: '', preheader: '', template: 'ANNOUNCEMENT', content: { headline: '', body: '', ctaLabel: '', ctaUrl: '', closing: '', productIds: [] }, audience: { audience: 'NEWSLETTER', roles: [], region: null, source: null } };

export default function CampaignBuilder() {
    return <React.Suspense fallback={null}><ConfirmProvider><Builder /></ConfirmProvider></React.Suspense>;
}

function toDraft(c: CampaignDetail): CampaignDraft {
    const content = c.content || {};
    const spec = c.audienceSpec || { audience: 'NEWSLETTER' as AudienceKind };
    return {
        subject: c.subject || '', preheader: c.preheader || '', template: (c.template || 'BLANK') as CampaignTemplate,
        content: { headline: content.headline || '', body: content.body || '', ctaLabel: content.ctaLabel || '', ctaUrl: content.ctaUrl || '', closing: content.closing || '', productIds: content.productIds || [] },
        audience: { audience: spec.audience || 'NEWSLETTER', roles: spec.roles || [], region: spec.region || null, source: spec.source || null },
    };
}

function Builder() {
    const tn = useTn();
    const router = useRouter();
    const params = useSearchParams();
    const id = params.get('id');
    const [campaign, setCampaign] = React.useState<CampaignDetail | null>(null);
    const [draft, setDraft] = React.useState<CampaignDraft>(EMPTY);
    const [dirty, setDirty] = React.useState(false);
    const [loading, setLoading] = React.useState(!!id);
    const [error, setError] = React.useState<string | null>(null);
    const [step, setStep] = React.useState<Step>('details');
    const [saving, setSaving] = React.useState(false);

    const load = React.useCallback(() => {
        if (!id) { setCampaign(null); setDraft(EMPTY); setLoading(false); return; }
        setLoading(true); setError(null);
        newsletterApi.campaign(id).then((c) => { setCampaign(c); setDraft(toDraft(c)); setDirty(false); }).catch((e) => setError(e?.message || tn('loadFailed'))).finally(() => setLoading(false));
    }, [id, tn]);
    React.useEffect(() => { load(); }, [load]);

    const update = (patch: Partial<CampaignDraft>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
    const updateContent = (patch: Partial<CampaignDraft['content']>) => { setDraft((d) => ({ ...d, content: { ...d.content, ...patch } })); setDirty(true); };

    /** Saves the draft (creates it the first time). Returns the campaign id. */
    const save: SaveFn = async (quiet = false) => {
        setSaving(true);
        try {
            const c = campaign ? await newsletterApi.updateCampaign(campaign.id, draft) : await newsletterApi.createCampaign(draft);
            setCampaign(c); setDirty(false);
            if (!campaign) router.replace(`/admin/newsletter/campaign?id=${c.id}`, { scroll: false });
            if (!quiet) toast.success(tn('draftSaved'));
            return c.id;
        } catch (e: any) { toast.error(e?.message || tn('saveFailed')); return null; } finally { setSaving(false); }
    };
    const goto = async (s: Step) => {
        if (dirty || !campaign) { const ok = await save(true); if (!ok) return; }
        setStep(s);
    };

    if (loading) return <div className="space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (campaign && campaign.status !== 'DRAFT') return <SentView campaign={campaign} onReload={load} />;

    const idx = STEPS.indexOf(step);
    return (
        <div className="space-y-4">
            <Link href="/admin/newsletter?tab=campaigns" className="inline-flex items-center gap-1 text-[13px] text-teal font-medium hover:underline"><ArrowLeft size={14} className="rtl:rotate-180" />{tn('backToCampaigns')}</Link>
            <PageHeader title={campaign ? (draft.subject || tn('untitled')) : tn('newCampaign')} description={tn('builderDesc')}
                actions={<Button loading={saving} disabled={!dirty && !!campaign} onClick={() => save()}>{dirty || !campaign ? tn('saveDraft') : tn('draftSavedShort')}</Button>} />
            <nav aria-label={tn('stepsAria')}>
                <ol className="flex flex-wrap gap-2">
                    {STEPS.map((s, i) => (
                        <li key={s}>
                            <button type="button" aria-current={s === step ? 'step' : undefined} onClick={() => goto(s)}
                                className={cn('h-8 px-3 rounded-full text-[12.5px] font-medium ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal', s === step ? 'bg-heading text-white ring-heading' : i < idx ? 'bg-teal-soft text-teal ring-teal/30' : 'bg-surface text-ink-3 ring-line')}>
                                {i < idx && <Check size={12} className="inline me-1" aria-hidden />}{i + 1}. {tn(`step_${s}`)}
                            </button>
                        </li>
                    ))}
                </ol>
            </nav>

            {step === 'details' && <DetailsStep draft={draft} update={update} />}
            {step === 'audience' && campaign && <AudienceStep draft={draft} update={update} campaignId={campaign.id} dirty={dirty} save={save} />}
            {step === 'content' && <ContentStep draft={draft} update={update} updateContent={updateContent} />}
            {step === 'preview' && campaign && <PreviewStep campaignId={campaign.id} dirty={dirty} save={save} lastTest={campaign.lastTestAt ? `${campaign.lastTestResult || ''}` : null} />}
            {step === 'review' && campaign && <ReviewStep campaign={campaign} draft={draft} dirty={dirty} save={save} onSent={(c) => { setCampaign(c); }} />}

            <div className="flex justify-between gap-2">
                <Button disabled={idx === 0} onClick={() => goto(STEPS[idx - 1])}>{tn('back')}</Button>
                {idx < STEPS.length - 1 && <Button variant="primary" loading={saving} onClick={() => goto(STEPS[idx + 1])}>{tn('next')}</Button>}
            </div>
        </div>
    );
}

function DetailsStep({ draft, update }: { draft: CampaignDraft; update: (p: Partial<CampaignDraft>) => void }) {
    const tn = useTn();
    return (
        <Card title={tn('step_details')} description={tn('detailsDesc')}>
            <div className="space-y-3 max-w-2xl">
                <Field label={tn('fieldSubject')} htmlFor="cb-subject" required hint={tn('subjectHint', { n: draft.subject.length })}>
                    <input id="cb-subject" value={draft.subject} maxLength={200} onChange={(e) => update({ subject: e.target.value })} className={inputCls} />
                </Field>
                <Field label={tn('fieldPreheader')} htmlFor="cb-pre" optional hint={tn('preheaderHint')}>
                    <input id="cb-pre" value={draft.preheader} maxLength={200} onChange={(e) => update({ preheader: e.target.value })} className={inputCls} />
                </Field>
            </div>
        </Card>
    );
}

function AudienceStep({ draft, update, campaignId, dirty, save }: { draft: CampaignDraft; update: (p: Partial<CampaignDraft>) => void; campaignId: string; dirty: boolean; save: SaveFn }) {
    const tn = useTn();
    const int = useInt();
    const [count, setCount] = React.useState<AudienceCount | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [facets, setFacets] = React.useState<{ sources: string[]; regions: string[] }>({ sources: [], regions: [] });
    React.useEffect(() => { newsletterApi.contacts({ pageSize: 10 }).then((d) => setFacets(d.facets)).catch(() => undefined); }, []);

    const refresh = React.useCallback(async () => {
        setLoading(true); setError(null);
        try { if (dirty) await save(true); setCount(await newsletterApi.audience(campaignId)); } catch (e: any) { setError(e?.message || tn('loadFailed')); } finally { setLoading(false); }
    }, [campaignId, dirty, save, tn]);
    // Recount whenever the audience settings change (after they are saved).
    const key = JSON.stringify(draft.audience) + draft.template + (draft.content.productIds || []).join();
    React.useEffect(() => { const h = setTimeout(refresh, 400); return () => clearTimeout(h); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);

    const a = draft.audience;
    const roles = a.roles || [];
    const setRole = (r: string, on: boolean) => update({ audience: { ...a, roles: on ? [...roles, r] : roles.filter((x) => x !== r) } });
    const excluded = count ? Object.entries(count.excluded).filter(([, n]) => (n || 0) > 0) : [];
    return (
        <div className="grid lg:grid-cols-[1fr_22rem] gap-4">
            <Card title={tn('step_audience')} description={tn('audienceDesc')}>
                <fieldset className="space-y-2">
                    <legend className="text-[13px] font-medium text-ink-2 mb-1">{tn('audienceWho')}</legend>
                    {AUDIENCES.map((k) => (
                        <label key={k} className={cn('flex items-start gap-3 rounded-lg ring-1 p-3 cursor-pointer', a.audience === k ? 'ring-teal bg-teal-soft' : 'ring-line hover:bg-surface-2')}>
                            <input type="radio" name="aud" className="mt-1" checked={a.audience === k} onChange={() => update({ audience: { ...a, audience: k } })} />
                            <span><span className="block text-[13.5px] font-medium text-ink">{tn(`aud_${k}`)}</span><span className="block text-[12.5px] text-ink-3">{tn(`audHelp_${k}`)}</span></span>
                        </label>
                    ))}
                </fieldset>
                {a.audience !== 'NEWSLETTER' && (
                    <fieldset className="mt-4">
                        <legend className="text-[13px] font-medium text-ink-2 mb-1">{tn('audienceRoles')}</legend>
                        <div className="flex flex-wrap gap-4">
                            {['CUSTOMER', 'SUPPLIER'].map((r) => (
                                <label key={r} className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRole(r, e.target.checked)} />{tn(`role_${r}`)}</label>
                            ))}
                        </div>
                        <p className="mt-1 text-[12.5px] text-ink-3">{tn('rolesHint')}</p>
                    </fieldset>
                )}
                {a.audience !== 'ACCOUNTS' && (facets.regions.length > 0 || facets.sources.length > 0) && (
                    <div className="mt-4 grid sm:grid-cols-2 gap-3">
                        {facets.regions.length > 0 && <Field label={tn('filterRegion')} htmlFor="cb-region" optional>
                            <select id="cb-region" value={a.region || ''} onChange={(e) => update({ audience: { ...a, region: e.target.value || null } })} className={selectCls}><option value="">{tn('anyRegion')}</option>{facets.regions.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                        </Field>}
                        {facets.sources.length > 0 && <Field label={tn('filterSource')} htmlFor="cb-source" optional>
                            <select id="cb-source" value={a.source || ''} onChange={(e) => update({ audience: { ...a, source: e.target.value || null } })} className={selectCls}><option value="">{tn('anySource')}</option>{facets.sources.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                        </Field>}
                    </div>
                )}
            </Card>
            <Card title={tn('eligibleTitle')} actions={<Button size="sm" variant="ghost" aria-label={tn('recount')} icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} onClick={refresh} />}>
                {error ? <ErrorState message={error} onRetry={refresh} /> : !count ? <Skeleton className="h-24" /> : (
                    <div aria-live="polite" className="space-y-3">
                        <p><span className="text-[28px] font-semibold text-heading tabular-nums">{int(count.eligible)}</span> <span className="text-[13px] text-ink-3">{tn('eligibleOf', { considered: int(count.considered) })}</span></p>
                        {excluded.length > 0 ? (
                            <div>
                                <p className="text-[12.5px] font-medium text-ink-2 mb-1">{tn('excludedWhy')}</p>
                                <ul className="space-y-1 text-[13px]">{excluded.map(([r, n]) => <li key={r} className="flex justify-between gap-2"><span className="text-ink-2">{tn(`reason_${r}`)}</span><span className="tabular-nums text-ink">{int(n || 0)}</span></li>)}</ul>
                            </div>
                        ) : <p className="text-[13px] text-ink-3">{tn('noneExcluded')}</p>}
                        {count.pricedContent && <Notice tone="info">{tn('pricedNotice')}</Notice>}
                        {count.nonProduction && <Notice tone="warning">{tn('nonProdNotice')}</Notice>}
                        <p className="text-[12px] text-ink-3">{tn('eligibleFoot')}</p>
                    </div>
                )}
            </Card>
        </div>
    );
}

function ContentStep({ draft, update, updateContent }: { draft: CampaignDraft; update: (p: Partial<CampaignDraft>) => void; updateContent: (p: Partial<CampaignDraft['content']>) => void }) {
    const tn = useTn();
    const c = draft.content;
    return (
        <Card title={tn('step_content')} description={tn('contentDesc')}>
            <fieldset>
                <legend className="text-[13px] font-medium text-ink-2 mb-2">{tn('templateLabel')}</legend>
                <div className="grid sm:grid-cols-3 gap-2">
                    {TEMPLATES.map((t) => (
                        <label key={t} className={cn('rounded-lg ring-1 p-3 cursor-pointer', draft.template === t ? 'ring-teal bg-teal-soft' : 'ring-line hover:bg-surface-2')}>
                            <input type="radio" name="tpl" className="sr-only" checked={draft.template === t} onChange={() => update({ template: t })} />
                            <span className="block text-[13.5px] font-medium text-ink">{tn(`template_${t}`)}</span>
                            <span className="block text-[12.5px] text-ink-3">{tn(`templateHelp_${t}`)}</span>
                        </label>
                    ))}
                </div>
            </fieldset>
            <div className="mt-4 space-y-3 max-w-3xl">
                <Field label={tn('fieldHeadline')} htmlFor="cb-h" optional><input id="cb-h" value={c.headline || ''} maxLength={160} onChange={(e) => updateContent({ headline: e.target.value })} className={inputCls} /></Field>
                <Field label={tn('fieldBody')} htmlFor="cb-b" hint={tn('bodyHint')}><textarea id="cb-b" value={c.body || ''} maxLength={6000} onChange={(e) => updateContent({ body: e.target.value })} className={textareaCls} /></Field>
                {draft.template === 'PRODUCTS' && <ProductPicker ids={c.productIds || []} onChange={(productIds) => updateContent({ productIds })} />}
                <div className="grid sm:grid-cols-[14rem_1fr] gap-3">
                    <Field label={tn('fieldCtaLabel')} htmlFor="cb-cl" optional><input id="cb-cl" value={c.ctaLabel || ''} maxLength={60} onChange={(e) => updateContent({ ctaLabel: e.target.value })} className={inputCls} /></Field>
                    <Field label={tn('fieldCtaUrl')} htmlFor="cb-cu" optional hint={tn('ctaHint')} error={c.ctaLabel && c.ctaUrl && !/^https?:\/\/\S+$/i.test(c.ctaUrl) ? tn('ctaInvalid') : null}>
                        <input id="cb-cu" type="url" dir="ltr" value={c.ctaUrl || ''} maxLength={500} onChange={(e) => updateContent({ ctaUrl: e.target.value })} className={inputCls} />
                    </Field>
                </div>
                <Field label={tn('fieldClosing')} htmlFor="cb-cls" optional><textarea id="cb-cls" value={c.closing || ''} maxLength={2000} onChange={(e) => updateContent({ closing: e.target.value })} className={inputCls.replace('h-10', 'min-h-[64px] py-2')} /></Field>
            </div>
        </Card>
    );
}

/** Live catalog products only, with the buyer case price shown on the site. */
function ProductPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
    const tn = useTn();
    const { fmt } = useLanguage();
    const money = (n: number | null) => (n === null ? tn('priceOnSite') : fmt.number(n, { style: 'currency', currency: 'EUR' }));
    const [q, setQ] = React.useState('');
    const [results, setResults] = React.useState<EmailProduct[]>([]);
    const [picked, setPicked] = React.useState<EmailProduct[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    React.useEffect(() => {
        const h = setTimeout(() => {
            setLoading(true); setError(null);
            newsletterApi.products(q).then(setResults).catch((e) => setError(e?.message || tn('loadFailed'))).finally(() => setLoading(false));
        }, 250);
        return () => clearTimeout(h);
    }, [q, tn]);
    // Known details for already chosen ids come from the search results or the server preview.
    React.useEffect(() => { setPicked((p) => ids.map((id) => p.find((x) => x.id === id) || results.find((x) => x.id === id)).filter(Boolean) as EmailProduct[]); }, [ids, results]);
    const add = (p: EmailProduct) => { if (!ids.includes(p.id) && ids.length < 6) { setPicked((x) => [...x, p]); onChange([...ids, p.id]); } };
    const remove = (id: string) => onChange(ids.filter((x) => x !== id));
    return (
        <div className="rounded-lg ring-1 ring-line p-3 space-y-3">
            <p className="text-[13px] font-medium text-ink-2">{tn('productsLabel', { count: ids.length })}</p>
            {ids.length > 0 && (
                <ul className="space-y-1.5">
                    {ids.map((id) => { const p = picked.find((x) => x.id === id); return (
                        <li key={id} className="flex items-center gap-2 text-[13px]">
                            <Thumb src={p?.image} alt={p?.name || ''} size={32} />
                            <span className="flex-1 min-w-0 truncate text-ink">{p ? p.name : tn('productChosen')}</span>
                            {p && <span className="tabular-nums text-ink-2">{money(p.casePrice)}</span>}
                            <Button size="sm" variant="ghost" aria-label={tn('removeProduct')} onClick={() => remove(id)} icon={<X size={14} />} />
                        </li>
                    ); })}
                </ul>
            )}
            <div className="relative">
                <label htmlFor="pp-q" className="sr-only">{tn('productSearch')}</label>
                <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                <input id="pp-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tn('productSearchPh')} className={`${inputCls} ps-9`} />
            </div>
            {error ? <ErrorState message={error} /> : loading && !results.length ? <Skeleton className="h-16" /> : results.length === 0 ? <p className="text-[13px] text-ink-3">{tn('noProducts')}</p> : (
                <ul className="max-h-60 overflow-y-auto divide-y divide-line rounded-lg ring-1 ring-line">
                    {results.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
                            <Thumb src={p.image} alt={p.name} size={32} />
                            <span className="flex-1 min-w-0"><span className="block truncate text-ink">{p.name}</span>{p.brand && <span className="block text-[12px] text-ink-3">{p.brand}</span>}</span>
                            <span className="tabular-nums text-ink-2">{money(p.casePrice)}</span>
                            <Button size="sm" variant="secondary" disabled={ids.includes(p.id) || ids.length >= 6} onClick={() => add(p)} icon={<Plus size={13} />}>{ids.includes(p.id) ? tn('added') : tn('add')}</Button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-[12px] text-ink-3">{tn('productsHint')}</p>
        </div>
    );
}

function PreviewFrame({ html, htmlNoPrices, title }: { html: string; htmlNoPrices?: string; title: string }) {
    const [mode, setMode] = React.useState<'desktop' | 'mobile'>('desktop');
    const [buyers, setBuyers] = React.useState(true);
    const tn = useTn();
    const variants = !!htmlNoPrices && htmlNoPrices !== html;
    return (
        <div>
            <div className="flex flex-wrap gap-3 mb-2">
                <div className="flex gap-1" role="group" aria-label={tn('previewWidth')}>
                    <Button size="sm" variant={mode === 'desktop' ? 'primary' : 'secondary'} aria-pressed={mode === 'desktop'} icon={<Monitor size={14} />} onClick={() => setMode('desktop')}>{tn('desktop')}</Button>
                    <Button size="sm" variant={mode === 'mobile' ? 'primary' : 'secondary'} aria-pressed={mode === 'mobile'} icon={<Smartphone size={14} />} onClick={() => setMode('mobile')}>{tn('mobile')}</Button>
                </div>
                {variants && (
                    <div className="flex gap-1" role="group" aria-label={tn('variantAria')}>
                        <Button size="sm" variant={buyers ? 'primary' : 'secondary'} aria-pressed={buyers} onClick={() => setBuyers(true)}>{tn('variantBuyers')}</Button>
                        <Button size="sm" variant={!buyers ? 'primary' : 'secondary'} aria-pressed={!buyers} onClick={() => setBuyers(false)}>{tn('variantOthers')}</Button>
                    </div>
                )}
            </div>
            {variants && <p className="mb-2 text-[12.5px] text-ink-3">{tn('variantNote')}</p>}
            <div className="rounded-xl bg-surface-3 p-3 overflow-x-auto">
                <iframe title={title} sandbox="" srcDoc={variants && !buyers ? htmlNoPrices : html} className="block mx-auto bg-white rounded-lg ring-1 ring-line" style={{ width: mode === 'desktop' ? 680 : 375, maxWidth: '100%', height: 720 }} />
            </div>
        </div>
    );
}

function PreviewStep({ campaignId, dirty, save, lastTest }: { campaignId: string; dirty: boolean; save: SaveFn; lastTest: string | null }) {
    const tn = useTn();
    const [p, setP] = React.useState<CampaignPreview | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [testing, setTesting] = React.useState(false);
    const [test, setTest] = React.useState<{ ok: boolean; text: string } | null>(null);
    const load = React.useCallback(async () => {
        setError(null);
        try { if (dirty) await save(true); setP(await newsletterApi.preview(campaignId)); } catch (e: any) { setError(e?.message || tn('loadFailed')); }
    }, [campaignId, dirty, save, tn]);
    React.useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaignId]);
    const sendTest = async () => {
        setTesting(true); setTest(null);
        try { const r = await newsletterApi.test(campaignId); setTest(r.ok ? { ok: true, text: tn('testAccepted', { to: r.to, provider: r.provider || '—' }) } : { ok: false, text: tn('testFailed', { to: r.to, error: r.error || '' }) }); }
        catch (e: any) { setTest({ ok: false, text: e?.message || tn('actionFailed') }); } finally { setTesting(false); }
    };
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (!p) return <Skeleton className="h-96" />;
    return (
        <div className="grid lg:grid-cols-[1fr_20rem] gap-4">
            <Card title={tn('step_preview')} description={tn('previewDesc')}><PreviewFrame html={p.html} htmlNoPrices={p.htmlNoPrices} title={tn('previewFrameTitle')} /></Card>
            <div className="space-y-4">
                <Card title={tn('checksTitle')}>
                    {p.issues.length === 0 ? <p className="text-[13px] text-emerald-700 flex items-center gap-1.5"><Check size={14} />{tn('noIssues')}</p> : (
                        <ul className="space-y-1.5 text-[13px] text-red-700">{p.issues.map((i) => <li key={i}>{tn(`issue_${i}`)}</li>)}</ul>
                    )}
                    {p.sender && !p.sender.addressConfigured && <div className="mt-3"><Notice tone="warning">{tn('addressMissing')}</Notice></div>}
                    {p.sender && <p className="mt-3 text-[12.5px] text-ink-3">{tn('senderLine', { name: p.sender.name, email: p.sender.contactEmail })}</p>}
                </Card>
                <Card title={tn('testTitle')} description={tn('testDesc')}>
                    <Button icon={<Send size={14} />} loading={testing} onClick={sendTest}>{tn('sendTest')}</Button>
                    {test && <div className="mt-3" aria-live="polite"><Notice tone={test.ok ? 'success' : 'danger'}>{test.text}</Notice></div>}
                    {!test && lastTest && <p className="mt-2 text-[12.5px] text-ink-3">{tn('lastTest', { result: lastTest })}</p>}
                </Card>
            </div>
        </div>
    );
}

function ReviewStep({ campaign, draft, dirty, save, onSent }: { campaign: CampaignDetail; draft: CampaignDraft; dirty: boolean; save: SaveFn; onSent: (c: CampaignDetail) => void }) {
    const tn = useTn();
    const int = useInt();
    const [count, setCount] = React.useState<AudienceCount | null>(null);
    const [preview, setPreview] = React.useState<CampaignPreview | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = React.useState(false);
    const [ack, setAck] = React.useState(false);
    const [sending, setSending] = React.useState(false);
    const [sendError, setSendError] = React.useState<string | null>(null);
    const load = React.useCallback(async () => {
        setError(null);
        try { if (dirty) await save(true); const [c, p] = await Promise.all([newsletterApi.audience(campaign.id), newsletterApi.preview(campaign.id)]); setCount(c); setPreview(p); } catch (e: any) { setError(e?.message || tn('loadFailed')); }
    }, [campaign.id, dirty, save, tn]);
    React.useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaign.id]);
    const doSend = async () => {
        if (!count) return;
        setSending(true); setSendError(null);
        try { const c = await newsletterApi.send(campaign.id, count.eligible); setConfirmOpen(false); toast.success(tn('sendStarted')); onSent(c); }
        catch (e: any) {
            if (e?.body?.code === 'AUDIENCE_CHANGED') { setSendError(tn('audienceChanged', { count: int(e.body.eligible ?? 0) })); load(); }
            else if (e?.body?.issues) setSendError(e.body.issues.map((i: string) => tn(`issue_${i}`)).join(' '));
            else setSendError(e?.message || tn('actionFailed'));
        } finally { setSending(false); }
    };
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (!count || !preview) return <Skeleton className="h-48" />;
    const blocked = preview.issues.length > 0 || count.eligible === 0;
    const row = (label: string, value: React.ReactNode) => <div className="grid grid-cols-[11rem_1fr] gap-2 py-2 border-b border-line last:border-0 text-[13.5px]"><dt className="text-ink-3">{label}</dt><dd className="text-ink min-w-0 break-words">{value}</dd></div>;
    return (
        <Card title={tn('step_review')} description={tn('reviewDesc')}>
            <dl className="max-w-3xl">
                {row(tn('fieldSubject'), draft.subject || <span className="text-red-700">{tn('issue_SUBJECT_MISSING')}</span>)}
                {row(tn('fieldPreheader'), draft.preheader || '—')}
                {row(tn('templateLabel'), tn(`template_${draft.template}`))}
                {row(tn('step_audience'), tn(`aud_${draft.audience.audience}`))}
                {row(tn('eligibleTitle'), <span className="font-semibold tabular-nums">{int(count.eligible)}</span>)}
                {row(tn('excludedTitle'), Object.entries(count.excluded).filter(([, n]) => n).map(([r, n]) => `${tn(`reason_${r}`)}: ${int(n || 0)}`).join(' · ') || '—')}
                {row(tn('lastTestLabel'), campaign.lastTestResult || tn('noTestYet'))}
            </dl>
            {preview.issues.length > 0 && <div className="mt-3"><Notice tone="danger" title={tn('fixBeforeSend')}>{preview.issues.map((i) => tn(`issue_${i}`)).join(' ')}</Notice></div>}
            {count.nonProduction && <div className="mt-3"><Notice tone="warning">{tn('nonProdNotice')}</Notice></div>}
            <div className="mt-4"><Button variant="primary" icon={<Send size={14} />} disabled={blocked} onClick={() => { setAck(false); setSendError(null); setConfirmOpen(true); }}>{tn('sendCampaign')}</Button></div>
            <Dialog open={confirmOpen} onClose={() => !sending && setConfirmOpen(false)} dismissable={!sending} size="sm" title={tn('confirmSendTitle')}
                footer={<><Button disabled={sending} onClick={() => setConfirmOpen(false)}>{tn('cancel')}</Button><Button variant="primary" disabled={!ack} loading={sending} onClick={doSend}>{tn('confirmSend', { count: int(count.eligible) })}</Button></>}>
                <div className="space-y-3 text-[13.5px] text-ink-2">
                    <p>{tn('confirmSendBody', { count: int(count.eligible), subject: draft.subject })}</p>
                    <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>{tn('confirmAck')}</span></label>
                    {sendError && <Notice tone="danger">{sendError}</Notice>}
                </div>
            </Dialog>
        </Card>
    );
}

/** A campaign that has left draft: real counts from the server, never edited. */
function SentView({ campaign, onReload }: { campaign: CampaignDetail; onReload: () => void }) {
    const tn = useTn();
    const int = useInt();
    const when = useWhen();
    const [preview, setPreview] = React.useState<CampaignPreview | null>(null);
    const [resuming, setResuming] = React.useState(false);
    React.useEffect(() => { newsletterApi.preview(campaign.id).then(setPreview).catch(() => setPreview(null)); }, [campaign.id]);
    React.useEffect(() => { if (campaign.status !== 'SENDING') return; const h = setInterval(onReload, 4000); return () => clearInterval(h); }, [campaign.status, onReload]);
    const rs = campaign.recipientStatus || {};
    const resume = async () => { setResuming(true); try { await newsletterApi.resume(campaign.id); onReload(); } catch (e: any) { toast.error(e?.message || tn('actionFailed')); } finally { setResuming(false); } };
    const stat = (label: string, v: React.ReactNode) => <div className="rounded-lg ring-1 ring-line p-3"><dt className="text-[12.5px] text-ink-3">{label}</dt><dd className="text-[18px] font-semibold text-heading tabular-nums">{v}</dd></div>;
    return (
        <div className="space-y-4">
            <Link href="/admin/newsletter?tab=campaigns" className="inline-flex items-center gap-1 text-[13px] text-teal font-medium hover:underline"><ArrowLeft size={14} className="rtl:rotate-180" />{tn('backToCampaigns')}</Link>
            <PageHeader title={campaign.subject || tn('untitled')} eyebrow={<CampaignStatusBadge status={campaign.status} />}
                description={tn('sentMeta', { started: when(campaign.sendStartedAt || campaign.createdAt) || '—', finished: when(campaign.sentAt) || '—' })} />
            {campaign.status === 'SENDING' && <Notice tone="info" action={!campaign.sending ? <Button size="sm" loading={resuming} onClick={resume}>{tn('resume')}</Button> : undefined}>{campaign.sending ? tn('sendingNow') : tn('sendingStalled')}</Notice>}
            {campaign.legacy && <Notice tone="info">{tn('legacyNotice')}</Notice>}
            <Card title={tn('resultsTitle')}>
                <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {stat(tn('colRecipients'), int(campaign.totalCount))}
                    {stat(tn('colAccepted'), int(campaign.legacy ? campaign.sentCount : (rs.ACCEPTED ?? 0)))}
                    {stat(tn('colFailed'), campaign.legacy ? '—' : int((rs.FAILED ?? 0) + (rs.ATTEMPTING && campaign.status !== 'SENDING' ? rs.ATTEMPTING : 0)))}
                    {stat(tn('colSkipped'), campaign.legacy ? '—' : int(rs.SKIPPED ?? 0))}
                    {stat(tn('colPending'), campaign.legacy ? '—' : int((rs.PENDING ?? 0) + (campaign.status === 'SENDING' ? (rs.ATTEMPTING ?? 0) : 0)))}
                </dl>
                <p className="mt-3 text-[12.5px] text-ink-3">{tn('acceptedMeaning')}</p>
                {Object.keys(campaign.skipReasons || {}).length > 0 && (
                    <div className="mt-3"><p className="text-[13px] font-medium text-ink-2">{tn('skippedWhy')}</p>
                        <ul className="mt-1 text-[13px] text-ink-2">{Object.entries(campaign.skipReasons).map(([r, n]) => <li key={r}>{tn(`reason_${r}`)}: {int(n)}</li>)}</ul></div>
                )}
                {campaign.audienceSpec?.excludedTotal ? <p className="mt-2 text-[13px] text-ink-2">{tn('excludedAtStart', { count: int(campaign.audienceSpec.excludedTotal) })}</p> : null}
                {campaign.errors?.length > 0 && <div className="mt-3"><Notice tone="danger" title={tn('providerErrors')}><ul>{campaign.errors.map((e, i) => <li key={i}>{e.error} ({int(e.count)})</li>)}</ul></Notice></div>}
            </Card>
            {preview && <Card title={tn('sentEmail')}><PreviewFrame html={preview.html} title={tn('previewFrameTitle')} /></Card>}
            <p className="text-[12px] text-ink-3"><Badge tone="neutral">{tn('notReported')}</Badge> {tn('deliveryNote')}</p>
        </div>
    );
}
