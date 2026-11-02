'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { EyeOff, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Dialog, Field, inputCls } from '@/components/supplier/ui';
import { adminApi } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

/** After publishing, this is staff's control: off the storefront with a comment the supplier reads, and back again. The server enforces the same. */
export default function ProductTakeDown({ product, onDone }: { product: { id: string; name: string; status: string }; onDone: () => void }) {
    const { t } = useLanguage();
    const tu = (k: string, v?: Record<string, string | number>) => t('imageUpload', k, v);
    const [kind, setKind] = React.useState<null | 'pause' | 'remove'>(null);
    const [comment, setComment] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const open = (k: 'pause' | 'remove') => { setComment(''); setError(null); setKind(k); };
    const send = async () => {
        if (!comment.trim()) { setError(tu('commentRequired')); return; }
        setBusy(true);
        try {
            await adminApi.takeDown(product.id, kind!, comment.trim());
            toast.success(tu(kind === 'pause' ? 'toastPaused' : 'toastRemoved'));
            setKind(null); onDone();
        } catch (e: any) { setError(e?.message || tu('errorFailed')); } finally { setBusy(false); }
    };
    const republish = async () => {
        setBusy(true);
        try { await adminApi.republish(product.id); toast.success(tu('toastRepublished')); onDone(); }
        catch (e: any) { toast.error(e?.message || tu('errorFailed')); } finally { setBusy(false); }
    };
    const down = product.status === 'PAUSED' || product.status === 'REMOVED';
    return (
        <>
            {product.status === 'APPROVED' && <Button icon={<EyeOff size={15} />} disabled={busy} onClick={() => open('pause')}>{tu('takeDownPause')}</Button>}
            {!down && product.status !== 'REJECTED' && <Button variant="danger" icon={<Trash2 size={15} />} disabled={busy} onClick={() => open('remove')}>{tu('takeDownRemove')}</Button>}
            {down && <Button variant="primary" icon={<RotateCcw size={15} />} loading={busy} onClick={republish}>{tu('republish')}</Button>}
            <Dialog open={!!kind} onClose={() => setKind(null)} title={tu(kind === 'remove' ? 'removeTitle' : 'pauseTitle', { name: product.name })} description={tu(kind === 'remove' ? 'removeDesc' : 'pauseDesc')}
                footer={<><Button onClick={() => setKind(null)} disabled={busy}>{tu('cancel')}</Button><Button variant="danger" loading={busy} onClick={send}>{tu(kind === 'remove' ? 'removeConfirm' : 'pauseConfirm')}</Button></>}>
                <Field label={tu('commentLabel')} htmlFor="take-down-comment" required hint={tu('commentHint')} error={error ?? undefined}>
                    <textarea id="take-down-comment" data-autofocus value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={2000} className={cn(inputCls, 'h-auto py-2')} />
                </Field>
            </Dialog>
        </>
    );
}
