'use client';

import * as React from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, Button, Dialog, Field, Notice, inputCls, selectCls } from '@/components/supplier/ui';
import { newsletterApi, type ImportMapping, type ImportPreview, type ImportResult, type ParsedImport } from '@/lib/admin-newsletter-api';
import { useInt, useTn } from './newsletterUi';

type Step = 'file' | 'map' | 'preview' | 'done';
const FIELDS: (keyof ImportMapping)[] = ['email', 'name', 'company', 'region'];
const textareaCls = inputCls.replace('h-10', 'min-h-[76px] py-2');

/**
 * Upload → map columns → preview (server validation + duplicates) → confirm.
 * Nothing is written before Confirm; the server re-checks everything then.
 */
export function ImportContactsDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
    const tn = useTn();
    const int = useInt();
    const [step, setStep] = React.useState<Step>('file');
    const [file, setFile] = React.useState<File | null>(null);
    const [parsed, setParsed] = React.useState<ParsedImport | null>(null);
    const [mapping, setMapping] = React.useState<ImportMapping>({ email: null, name: null, company: null, region: null });
    const [preview, setPreview] = React.useState<ImportPreview | null>(null);
    const [result, setResult] = React.useState<ImportResult | null>(null);
    const [hasBasis, setHasBasis] = React.useState(false);
    const [evidence, setEvidence] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => { if (open) { setStep('file'); setFile(null); setParsed(null); setPreview(null); setResult(null); setHasBasis(false); setEvidence(''); setError(null); } }, [open]);

    const parse = async () => {
        if (!file) return;
        setBusy(true); setError(null);
        try { const p = await newsletterApi.parseImport(file); setParsed(p); setMapping({ email: p.suggested.email, name: p.suggested.name, company: p.suggested.company, region: p.suggested.region }); setStep('map'); }
        catch (e: any) { setError(e?.message || tn('importFailed')); } finally { setBusy(false); }
    };
    const runPreview = async () => {
        if (!parsed) return;
        setBusy(true); setError(null);
        try { setPreview(await newsletterApi.previewImport(parsed.rows, mapping)); setStep('preview'); }
        catch (e: any) { setError(e?.message || tn('importFailed')); } finally { setBusy(false); }
    };
    const commit = async () => {
        if (!parsed || !file) return;
        setBusy(true); setError(null);
        try { setResult(await newsletterApi.commitImport(parsed.rows, mapping, hasBasis ? evidence.trim() : null, file.name)); setStep('done'); onDone(); }
        catch (e: any) { setError(e?.message || tn('importFailed')); } finally { setBusy(false); }
    };

    const s = preview?.summary;
    const writable = s ? s.NEW + s.UPDATE : 0;
    const footer = step === 'file' ? <><Button onClick={onClose}>{tn('cancel')}</Button><Button variant="primary" disabled={!file} loading={busy} onClick={parse}>{tn('importRead')}</Button></>
        : step === 'map' ? <><Button onClick={() => setStep('file')}>{tn('back')}</Button><Button variant="primary" disabled={mapping.email === null} loading={busy} onClick={runPreview}>{tn('importCheck')}</Button></>
        : step === 'preview' ? <><Button onClick={() => setStep('map')}>{tn('back')}</Button><Button variant="primary" disabled={!writable || (hasBasis && evidence.trim().length < 5)} loading={busy} onClick={commit}>{tn('importConfirm', { count: int(writable) })}</Button></>
        : <Button variant="primary" onClick={onClose}>{tn('close')}</Button>;

    return (
        <Dialog open={open} onClose={onClose} size="lg" dismissable={!busy} title={tn('importTitle')} description={tn(`importStep_${step}`)} footer={footer}>
            <ol className="flex gap-2 mb-4 text-[12px]" aria-label={tn('importStepsAria')}>
                {(['file', 'map', 'preview', 'done'] as Step[]).map((st, i) => (
                    <li key={st} aria-current={st === step ? 'step' : undefined} className={cn('px-2 py-1 rounded-full ring-1', st === step ? 'bg-teal-soft text-teal ring-teal/30 font-semibold' : 'ring-line text-ink-3')}>{i + 1}. {tn(`importStepName_${st}`)}</li>
                ))}
            </ol>
            {error && <div className="mb-3"><Notice tone="danger">{error}</Notice></div>}

            {step === 'file' && (
                <div className="space-y-3">
                    <label htmlFor="imp-file" className="flex flex-col items-center justify-center gap-2 rounded-xl ring-1 ring-dashed ring-line-strong bg-surface-2 p-6 text-center cursor-pointer hover:bg-surface-3 focus-within:ring-2 focus-within:ring-teal">
                        <FileUp size={22} className="text-ink-3" aria-hidden />
                        <span className="text-[13.5px] font-medium text-ink">{file ? file.name : tn('importChoose')}</span>
                        <span className="text-[12.5px] text-ink-3">{tn('importFormats')}</span>
                        <input id="imp-file" type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    </label>
                    <Notice tone="info">{tn('importConsentNotice')}</Notice>
                </div>
            )}

            {step === 'map' && parsed && (
                <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                        {FIELDS.map((k) => (
                            <Field key={k} label={tn(`map_${k}`)} htmlFor={`map-${k}`} required={k === 'email'} optional={k !== 'email'}>
                                <select id={`map-${k}`} value={mapping[k] ?? ''} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value === '' ? null : Number(e.target.value) })} className={selectCls}>
                                    <option value="">{k === 'email' ? tn('mapChoose') : tn('mapNone')}</option>
                                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h || tn('mapColumn', { n: i + 1 })}</option>)}
                                </select>
                            </Field>
                        ))}
                    </div>
                    <div>
                        <p className="text-[12.5px] text-ink-3 mb-1.5">{tn('mapSample', { count: int(parsed.rows.length) })}</p>
                        <div className="overflow-x-auto rounded-lg ring-1 ring-line">
                            <table className="w-full min-w-[520px] text-[12.5px]">
                                <thead><tr className="bg-surface-2 text-ink-3">{parsed.headers.map((h, i) => <th key={i} className="py-1.5 px-2 text-start font-medium">{h}</th>)}</tr></thead>
                                <tbody>{parsed.rows.slice(0, 5).map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1.5 px-2 text-ink-2 truncate max-w-[12rem]">{c}</td>)}</tr>)}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {step === 'preview' && s && preview && (
                <div className="space-y-4">
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
                        {([['NEW', 'success'], ['UPDATE', 'info'], ['DUPLICATE_IN_FILE', 'warning'], ['INVALID_EMAIL', 'danger']] as const).map(([k]) => (
                            <div key={k} className="rounded-lg ring-1 ring-line p-3"><dt className="text-ink-3">{tn(`outcome_${k}`)}</dt><dd className="text-[18px] font-semibold text-heading tabular-nums">{int(k === 'INVALID_EMAIL' ? s.INVALID_EMAIL + s.MISSING_EMAIL : s[k])}</dd></div>
                        ))}
                    </dl>
                    {s.suppressed > 0 && <Notice tone="warning">{tn('importSuppressedNote', { count: int(s.suppressed) })}</Notice>}
                    {s.accounts > 0 && <p className="text-[13px] text-ink-2">{tn('importAccountsNote', { count: int(s.accounts) })}</p>}
                    <div className="rounded-lg ring-1 ring-line p-3 space-y-2">
                        <label className="flex items-start gap-2 text-[13px] text-ink-2"><input type="checkbox" className="mt-0.5" checked={hasBasis} onChange={(e) => setHasBasis(e.target.checked)} /><span>{tn('importHasBasis')}</span></label>
                        {hasBasis ? (
                            <Field label={tn('fieldEvidence')} htmlFor="imp-evidence" required hint={tn('importEvidenceHint')}>
                                <textarea id="imp-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} className={textareaCls} maxLength={500} />
                            </Field>
                        ) : <p className="text-[12.5px] text-ink-3">{tn('importNoBasis')}</p>}
                    </div>
                    <div className="overflow-x-auto rounded-lg ring-1 ring-line max-h-[16rem]">
                        <table className="w-full min-w-[520px] text-[12.5px]">
                            <thead><tr className="bg-surface-2 text-ink-3"><th className="py-1.5 px-2 text-start font-medium">{tn('colLine')}</th><th className="py-1.5 px-2 text-start font-medium">{tn('fieldEmail')}</th><th className="py-1.5 px-2 text-start font-medium">{tn('colResult')}</th></tr></thead>
                            <tbody>
                                {preview.rows.map((r) => (
                                    <tr key={r.line} className="border-t border-line">
                                        <td className="py-1.5 px-2 tabular-nums text-ink-3">{r.line}</td>
                                        <td className="py-1.5 px-2 text-ink-2">{r.email || '—'}</td>
                                        <td className="py-1.5 px-2 flex flex-wrap gap-1">
                                            <Badge tone={r.outcome === 'NEW' ? 'success' : r.outcome === 'UPDATE' ? 'info' : r.outcome === 'DUPLICATE_IN_FILE' ? 'warning' : 'danger'}>{tn(`outcome_${r.outcome}`)}</Badge>
                                            {r.suppressed && <Badge tone="danger">{tn('reason_UNSUBSCRIBED_OR_BLOCKED')}</Badge>}
                                            {r.account && <Badge tone="brand">{tn('kind_ACCOUNT')}</Badge>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {s.total > preview.rows.length && <p className="text-[12.5px] text-ink-3">{tn('previewTruncated', { shown: int(preview.rows.length), total: int(s.total) })}</p>}
                </div>
            )}

            {step === 'done' && result && (
                <div role="status" className="space-y-2 text-[13.5px] text-ink-2">
                    <p className="font-semibold text-heading">{tn('importDone')}</p>
                    <p>{tn('importDoneCounts', { created: int(result.created), updated: int(result.updated) })}</p>
                    {result.failed.length > 0 && <Notice tone="danger">{tn('importFailedRows', { lines: result.failed.map((f) => f.line).join(', ') })}</Notice>}
                    {!hasBasis && result.created > 0 && <Notice tone="warning">{tn('importDoneNoBasis')}</Notice>}
                </div>
            )}
        </Dialog>
    );
}
