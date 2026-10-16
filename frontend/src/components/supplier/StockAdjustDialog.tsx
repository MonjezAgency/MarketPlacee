'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { supplierApi } from '@/lib/supplier-api';
import { Button, Dialog, Field, inputCls } from '@/components/supplier/ui';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Set a product's available stock (cases). The change and its reason are
 * written to the product's change history on the server.
 */
export default function StockAdjustDialog({ product, onClose, onSaved }: { product: { id: string; name: string; stock: number; reserved?: number } | null; onClose: () => void; onSaved: (stock: number) => void }) {
    const { t } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const [value, setValue] = React.useState('');
    const [reason, setReason] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    React.useEffect(() => { if (product) { setValue(String(product.stock ?? 0)); setReason(''); setErr(null); } }, [product]);
    if (!product) return null;
    const n = Number(value);
    const valid = /^\d+$/.test(value.trim());
    const delta = valid ? n - (product.stock ?? 0) : 0;
    const save = async () => {
        if (!valid) { setErr(tc('errWholeCases')); return; }
        if (delta === 0) { onClose(); return; }
        setBusy(true); setErr(null);
        try {
            const saved = await supplierApi.update(product.id, { stock: n, changeReason: reason.trim() || (delta > 0 ? 'Stock added' : 'Stock reduced') }); // stored history text, kept in English
            toast.success(tc('toastStockSet', { name: product.name, count: saved.stock }));
            onSaved(saved.stock);
        } catch (e: any) { setErr(e.message); }
        finally { setBusy(false); }
    };
    return (
        <Dialog open={!!product} onClose={onClose} size="sm" title={tc('adjustStock')} description={product.name}
            footer={<><Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button><Button variant="primary" loading={busy} onClick={save}>{tc('saveStock')}</Button></>}>
            <div className="space-y-4">
                <Field label={tc('availableToSellCases')} htmlFor="adj-stock" required error={err}
                    hint={valid ? `${delta === 0 ? tc('noChange') : tc('deltaCases', { count: Math.abs(delta), sign: delta > 0 ? '+' : '−' })} · ${product.reserved ? tc('reservedNotIncludedN', { count: product.reserved }) : tc('reservedNotIncluded')}` : undefined}>
                    <input id="adj-stock" data-autofocus inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))} className={inputCls} />
                </Field>
                <Field label={tc('reason')} htmlFor="adj-reason" optional hint={tc('reasonHint')}>
                    <input id="adj-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={inputCls} />
                </Field>
            </div>
        </Dialog>
    );
}
