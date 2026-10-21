'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { Button, Dialog, ErrorState, Field, Notice, Skeleton, inputCls } from '@/components/supplier/ui';
import { newsletterApi, type ContactDetail } from '@/lib/admin-newsletter-api';
import { EligibilityBadge, KindBadge, useTn, useWhen } from './newsletterUi';

const textareaCls = inputCls.replace('h-10', 'min-h-[76px] py-2');

/** Add one contact by hand. Sendable only when the admin records the consent basis. */
export function AddContactDialog({ open, onClose, onSaved, onOpenExisting }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; onOpenExisting: (id: string) => void }) {
    const tn = useTn();
    const [f, setF] = React.useState({ email: '', name: '', company: '', region: '', evidence: '', hasBasis: false });
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [dupId, setDupId] = React.useState<string | null>(null);
    React.useEffect(() => { if (open) { setF({ email: '', name: '', company: '', region: '', evidence: '', hasBasis: false }); setError(null); setDupId(null); } }, [open]);
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim());
    const basisOk = !f.hasBasis || f.evidence.trim().length >= 5;

    const save = async () => {
        setBusy(true); setError(null); setDupId(null);
        try {
            const r = await newsletterApi.addContact({ email: f.email.trim(), name: f.name, company: f.company, region: f.region, consentEvidence: f.hasBasis ? f.evidence.trim() : undefined });
            toast.success(tn('contactAdded'));
            onSaved(r.id);
        } catch (e: any) {
            if (e?.status === 409 && e?.body?.message?.id) setDupId(e.body.message.id);
            else if (e?.status === 409 && e?.body?.id) setDupId(e.body.id);
            setError(e?.status === 409 ? tn('duplicateContact') : (e?.message || tn('saveFailed')));
        } finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onClose={onClose} title={tn('addTitle')} description={tn('addDesc')}
            footer={<><Button onClick={onClose}>{tn('cancel')}</Button><Button variant="primary" loading={busy} disabled={!emailOk || !basisOk} onClick={save}>{tn('addSave')}</Button></>}>
            <div className="space-y-3">
                <Field label={tn('fieldEmail')} htmlFor="ac-email" required><input id="ac-email" type="email" autoComplete="off" value={f.email} onChange={set('email')} className={inputCls} /></Field>
                <div className="grid sm:grid-cols-2 gap-3">
                    <Field label={tn('fieldName')} htmlFor="ac-name" optional><input id="ac-name" value={f.name} onChange={set('name')} className={inputCls} /></Field>
                    <Field label={tn('fieldCompany')} htmlFor="ac-company" optional><input id="ac-company" value={f.company} onChange={set('company')} className={inputCls} /></Field>
                </div>
                <Field label={tn('fieldRegion')} htmlFor="ac-region" optional><input id="ac-region" value={f.region} onChange={set('region')} className={inputCls} /></Field>
                <label className="flex items-start gap-2 text-[13px] text-ink-2">
                    <input type="checkbox" className="mt-0.5" checked={f.hasBasis} onChange={set('hasBasis')} />
                    <span>{tn('hasBasisLabel')}</span>
                </label>
                {f.hasBasis ? (
                    <Field label={tn('fieldEvidence')} htmlFor="ac-evidence" required hint={tn('evidenceHint')} error={f.evidence && !basisOk ? tn('evidenceShort') : null}>
                        <textarea id="ac-evidence" value={f.evidence} onChange={set('evidence')} className={textareaCls} maxLength={500} />
                    </Field>
                ) : <Notice tone="warning">{tn('noBasisNotice')}</Notice>}
                {error && <div role="alert" className="text-[13px] text-red-700">{error} {dupId && <button type="button" className="text-teal font-medium hover:underline" onClick={() => onOpenExisting(dupId)}>{tn('openExisting')}</button>}</div>}
            </div>
        </Dialog>
    );
}

/** One contact: identity, account match, consent record and history. */
export function ContactDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
    const tn = useTn();
    const when = useWhen();
    const [c, setC] = React.useState<ContactDetail | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [edit, setEdit] = React.useState({ name: '', company: '', region: '' });
    const [evidence, setEvidence] = React.useState('');
    const [busy, setBusy] = React.useState<string | null>(null);
    const load = React.useCallback(() => {
        if (!id) return;
        setError(null);
        newsletterApi.contact(id).then((d) => { setC(d); setEdit({ name: d.name || '', company: d.company || '', region: d.region || '' }); setEvidence(''); }).catch((e) => setError(e?.message || tn('loadFailed')));
    }, [id, tn]);
    React.useEffect(() => { setC(null); load(); }, [load]);

    const saveDetails = async () => {
        if (!c) return;
        setBusy('details');
        try { setC(await newsletterApi.updateContact(c.id, edit)); toast.success(tn('saved')); onChanged(); } catch (e: any) { toast.error(e?.message || tn('saveFailed')); } finally { setBusy(null); }
    };
    const saveConsent = async (value: string | null) => {
        if (!c) return;
        setBusy('consent');
        try { setC(await newsletterApi.recordConsent(c.id, value)); setEvidence(''); toast.success(tn('saved')); onChanged(); } catch (e: any) { toast.error(e?.message || tn('saveFailed')); } finally { setBusy(null); }
    };
    const dt = (label: string, value: React.ReactNode) => (
        <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5 border-b border-line last:border-0 text-[13px]"><dt className="text-ink-3">{label}</dt><dd className="text-ink min-w-0 break-words">{value ?? <span className="text-ink-3">{tn('notRecorded')}</span>}</dd></div>
    );
    return (
        <Dialog open={!!id} onClose={onClose} size="lg" title={c?.email || tn('contactTitle')} description={c ? <span className="inline-flex flex-wrap gap-1.5 mt-1"><KindBadge kind={c.kind} /><EligibilityBadge row={c} /></span> : undefined}
            footer={<Button onClick={onClose}>{tn('close')}</Button>}>
            {error ? <ErrorState message={error} onRetry={load} /> : !c ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div> : (
                <div className="space-y-5">
                    {!c.eligible && <Notice tone={c.reason === 'UNSUBSCRIBED' ? 'danger' : 'warning'} title={tn(`reason_${c.reason}`)}>{tn(`reasonHelp_${c.reason}`)}</Notice>}

                    {c.account && (
                        <section aria-labelledby="cd-acc">
                            <h3 id="cd-acc" className="text-[13.5px] font-semibold text-heading mb-1">{tn('accountSection')}</h3>
                            <p className="text-[12.5px] text-ink-3 mb-2">{tn('accountMatchNote')}</p>
                            <dl>
                                {dt(tn('accName'), c.account.name)}
                                {dt(tn('accCompany'), c.account.companyName)}
                                {dt(tn('accRole'), tn(`role_${c.account.role}`))}
                                {dt(tn('accStatus'), c.account.status)}
                                {dt(tn('accRegistered'), when(c.account.createdAt))}
                                {dt(tn('accEmailVerified'), c.account.emailVerified ? tn('yes') : tn('no'))}
                            </dl>
                        </section>
                    )}

                    <section aria-labelledby="cd-consent">
                        <h3 id="cd-consent" className="text-[13.5px] font-semibold text-heading mb-2">{tn('consentSection')}</h3>
                        <dl>
                            {dt(tn('colBasis'), c.basis ? tn(`basis_${c.basis}`) : tn('basisNone'))}
                            {dt(tn('confirmedAt'), when(c.confirmedAt))}
                            {dt(tn('signupAt'), when(c.consentAt))}
                            {dt(tn('evidence'), c.consentEvidence)}
                            {dt(tn('evidenceRecordedAt'), when(c.consentRecordedAt))}
                            {dt(tn('unsubscribedAt'), when(c.unsubscribedAt))}
                            {dt(tn('suppression'), c.suppression ? `${tn(`reason_${c.suppression.reason}`)} · ${when(c.suppression.at)}` : null)}
                            {dt(tn('colSource'), c.source)}
                            {dt(tn('colAdded'), when(c.createdAt))}
                            {dt(tn('lastImported'), when(c.lastImportedAt))}
                        </dl>
                        {!c.suppression && c.status !== 'UNSUBSCRIBED' && !c.confirmedAt && (
                            <div className="mt-3 space-y-2">
                                <Field label={c.consentEvidence ? tn('replaceEvidence') : tn('recordEvidence')} htmlFor="cd-evidence" hint={tn('evidenceHint')}>
                                    <textarea id="cd-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} className={textareaCls} maxLength={500} />
                                </Field>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="primary" disabled={evidence.trim().length < 5} loading={busy === 'consent'} onClick={() => saveConsent(evidence.trim())}>{tn('saveEvidence')}</Button>
                                    {c.consentEvidence && <Button size="sm" variant="secondary" loading={busy === 'consent'} onClick={() => saveConsent(null)}>{tn('withdrawEvidence')}</Button>}
                                </div>
                            </div>
                        )}
                    </section>

                    <section aria-labelledby="cd-details">
                        <h3 id="cd-details" className="text-[13.5px] font-semibold text-heading mb-2">{tn('detailsSection')}</h3>
                        <div className="grid sm:grid-cols-3 gap-3">
                            <Field label={tn('fieldName')} htmlFor="cd-name"><input id="cd-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputCls} /></Field>
                            <Field label={tn('fieldCompany')} htmlFor="cd-company"><input id="cd-company" value={edit.company} onChange={(e) => setEdit({ ...edit, company: e.target.value })} className={inputCls} /></Field>
                            <Field label={tn('fieldRegion')} htmlFor="cd-region"><input id="cd-region" value={edit.region} onChange={(e) => setEdit({ ...edit, region: e.target.value })} className={inputCls} /></Field>
                        </div>
                        <div className="mt-2"><Button size="sm" loading={busy === 'details'} onClick={saveDetails}>{tn('saveDetails')}</Button></div>
                    </section>

                    <section aria-labelledby="cd-history">
                        <h3 id="cd-history" className="text-[13.5px] font-semibold text-heading mb-2">{tn('historySection')}</h3>
                        {c.events.length === 0 ? <p className="text-[13px] text-ink-3">{tn('historyEmpty')}</p> : (
                            <ol className="space-y-1.5">
                                {c.events.map((e, i) => (
                                    <li key={i} className="flex flex-wrap gap-x-2 text-[13px]"><span className="text-ink-3 tabular-nums">{when(e.at)}</span><span className="text-ink">{tn(`event_${e.type}`)}</span>{e.source && <span className="text-ink-3">({e.source})</span>}</li>
                                ))}
                            </ol>
                        )}
                    </section>
                </div>
            )}
        </Dialog>
    );
}
