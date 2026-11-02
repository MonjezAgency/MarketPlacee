'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ImagePlus, Pencil, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Skeleton, Thumb, inputCls, type Tone } from '@/components/supplier/ui';
import { useLanguage } from '@/contexts/LanguageContext';
import { importApi, type ImportTarget, type UploadDetail, type UploadRow } from './api';

const POLL_MS = 4000;

const ERRORS: Record<string, string> = { BUSY: 'errorBusy', DUPLICATE_EAN: 'errorDuplicate', INVALID_EAN: 'errorInvalidEan', NOT_AN_IMAGE: 'errorNotImage', TOO_LARGE: 'errorTooLarge' };
const running = (r: UploadRow) => r.state === 'queued' || r.state === 'running';
const takenDown = (r: UploadRow) => r.productStatus === 'PAUSED' || r.productStatus === 'REMOVED';

/** What became of each row of an upload, what is wrong in plain words, and the two things a supplier can do about it. */
export default function UploadStatus({ target, id }: { target: ImportTarget; id: string }) {
    const { t, fmt } = useLanguage();
    const tu = (k: string, v?: Record<string, string | number>) => t('imageUpload', k, v);
    const api = React.useMemo(() => importApi(target), [target]);
    const [data, setData] = React.useState<UploadDetail | null>(null);
    const [failed, setFailed] = React.useState(false);
    const [fixing, setFixing] = React.useState<UploadRow | null>(null);
    const [ean, setEan] = React.useState('');
    const [busy, setBusy] = React.useState<string | null>(null);
    const [fixError, setFixError] = React.useState<string | null>(null);
    const fileFor = React.useRef<string | null>(null);
    const fileInput = React.useRef<HTMLInputElement>(null);

    const load = React.useCallback(() => api.upload(id).then((d) => { setData(d); setFailed(false); return d; }).catch(() => { setFailed(true); return null; }), [api, id]);
    React.useEffect(() => { load(); }, [load]);
    const live = !data || !data.finished;
    React.useEffect(() => {
        if (!live) return;
        const h = setInterval(load, POLL_MS);
        return () => clearInterval(h);
    }, [live, load]);

    const message = (e: any) => tu(ERRORS[e?.body?.code] ?? 'errorFailed');
    const run = async (rowId: string, call: () => unknown) => {
        setBusy(rowId);
        try { await call(); toast.success(tu('toastQueued')); await load(); return true; }
        catch (e) { toast.error(message(e)); return false; }
        finally { setBusy(null); }
    };
    const saveEan = async () => {
        if (!fixing) return;
        setBusy(fixing.id); setFixError(null);
        try { await api.fixEan(fixing.id, ean); toast.success(tu('toastQueued')); setFixing(null); await load(); }
        catch (e) { setFixError(message(e)); }
        finally { setBusy(null); }
    };
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; const rowId = fileFor.current;
        e.target.value = '';
        if (file && rowId) run(rowId, () => api.rowPhoto(rowId, file));
    };

    if (failed && !data) return <ErrorState message={tu('loadError')} onRetry={load} />;
    if (!data) return <Skeleton className="h-48" />;
    if (!data.rows.length) return <Card><EmptyState title={tu('empty')} /></Card>;

    const rows = data.rows;
    const count = (o: string) => rows.filter((r) => r.outcome === o).length;
    const done = rows.filter((r) => !running(r)).length;
    const tiles: [string, number, string][] = [[tu('tilePublished'), count('published'), 'text-emerald-700'], [tu('tilePending'), count('published_image_pending'), 'text-amber-800'], [tu('tileAttention'), count('needs_attention'), 'text-red-700']];

    const badge = (r: UploadRow): [Tone, string] => running(r) ? ['info', 'statusChecking']
        : takenDown(r) ? ['danger', 'statusTakenDown']
            : r.outcome === 'published' ? ['success', 'statusPublished']
                : r.outcome === 'published_image_pending' ? ['warning', 'statusPending'] : ['danger', 'statusAttention'];
    const detail = (r: UploadRow) => {
        if (running(r)) return '';
        if (takenDown(r)) return r.comment ? tu('msgStaff', { comment: r.comment }) : '';
        const code = r.ean ?? '';
        if (r.outcome === 'published') return r.imageState === 'bg_pending' ? tu('imageBg') : r.imageState === 'kept' ? tu('imageFromSeller') : '';
        if (r.outcome === 'published_image_pending') return tu('imageWaiting');
        switch (r.reason) {
            case 'invalid_ean': return tu('msgInvalidEan');
            case 'not_verified': return tu('msgNotVerified', { ean: code });
            case 'photo_too_small': return tu('msgTooSmall', { ean: code });
            case 'missing_fields': return tu('msgMissing', { fields: (r.params?.missing ?? []).join(', ') });
            default: return tu('msgNoImage', { ean: code });
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                {tiles.map(([label, value, tone]) => (
                    <div key={label} className="rounded-xl ring-1 ring-line p-3">
                        <p className="text-[12.5px] text-ink-3">{label}</p>
                        <p className={`text-[24px] font-semibold tabular-nums ${value ? tone : 'text-ink-3'}`}>{fmt.number(value)}</p>
                    </div>
                ))}
            </div>
            <p className="text-[13.5px] text-ink-2" role="status">
                {data.finished ? tu('finished', { total: fmt.number(rows.length) }) : tu('working', { done: fmt.number(done), total: fmt.number(rows.length) })}
                {data.fileName ? <span className="text-ink-3"> · <span data-no-translate>{tu('fileLabel', { file: data.fileName })}</span></span> : null}
            </p>
            <Card bodyClassName="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full lg:min-w-[720px] text-[13.5px]">
                        <thead className="hidden lg:table-header-group">
                            <tr className="text-start text-[12.5px] text-ink-3 border-b border-line">
                                <th scope="col" className="px-4 py-2.5 text-start font-medium">{tu('colProduct')}</th>
                                <th scope="col" className="px-4 py-2.5 text-start font-medium">{tu('colEan')}</th>
                                <th scope="col" className="px-4 py-2.5 text-start font-medium">{tu('colStatus')}</th>
                                <th scope="col" className="px-4 py-2.5 text-start font-medium">{tu('colDetails')}</th>
                            </tr>
                        </thead>
                        <tbody className="block lg:table-row-group divide-y divide-line">
                            {rows.map((r) => {
                                const [tone, key] = badge(r);
                                const text = detail(r);
                                const attention = !running(r) && !takenDown(r) && r.outcome === 'needs_attention';
                                const missing = r.reason === 'missing_fields';
                                return (
                                    <tr key={r.id} className="block lg:table-row align-top py-1.5 lg:py-0">
                                        <td className="block lg:table-cell px-4 py-1.5 lg:py-3">
                                            <span className="flex items-center gap-2.5 min-w-0">
                                                <Thumb src={r.image} alt="" size={40} />
                                                <span className="font-medium text-ink break-words" data-no-translate>{r.name}</span>
                                            </span>
                                        </td>
                                        <td className="block lg:table-cell px-4 py-1.5 lg:py-3 tabular-nums whitespace-nowrap" data-no-translate><bdi dir="ltr">{r.ean || '—'}</bdi></td>
                                        <td className="block lg:table-cell px-4 py-1.5 lg:py-3"><Badge tone={tone} dot>{tu(key)}</Badge></td>
                                        <td className="block lg:table-cell px-4 py-1.5 lg:py-3 lg:max-w-[22rem]">
                                            {text && <p className="text-ink-2">{text}</p>}
                                            {attention && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {missing ? (
                                                        <>
                                                            {r.productId && <Link href={target === 'catalog' ? `/admin/products/${r.productId}` : `/supplier/products/${r.productId}/edit`}><Button size="sm" icon={<Pencil size={14} />}>{tu('actionEdit')}</Button></Link>}
                                                            <Button size="sm" icon={<RefreshCw size={14} />} loading={busy === r.id} disabled={!!busy} onClick={() => run(r.id, () => api.recheck(r.id))}>{tu('actionRecheck')}</Button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Button size="sm" icon={<Pencil size={14} />} disabled={!!busy} onClick={() => { setEan(r.ean ?? ''); setFixError(null); setFixing(r); }}>{tu('actionFixEan')}</Button>
                                                            <Button size="sm" icon={<ImagePlus size={14} />} loading={busy === r.id} disabled={!!busy} onClick={() => { fileFor.current = r.id; fileInput.current?.click(); }}>{tu('actionUpload')}</Button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" aria-label={tu('actionUpload')} onChange={onFile} />
            <Dialog open={!!fixing} onClose={() => setFixing(null)} title={tu('fixTitle')} description={fixing ? tu('fixDesc', { name: fixing.name }) : undefined}
                footer={<><Button onClick={() => setFixing(null)} disabled={!!busy}>{tu('cancel')}</Button><Button variant="primary" loading={!!busy} disabled={!ean.trim()} onClick={saveEan}>{tu('fixSubmit')}</Button></>}>
                <Field label={tu('fixLabel')} htmlFor="row-ean" required error={fixError ?? undefined}>
                    <input id="row-ean" data-autofocus dir="ltr" inputMode="numeric" value={ean} onChange={(e) => setEan(e.target.value)} className={inputCls} />
                </Field>
            </Dialog>
        </div>
    );
}
