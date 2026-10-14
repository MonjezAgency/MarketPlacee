'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { supplierApi } from '@/lib/supplier-api';
import { Button, Dialog, Field, inputCls, int } from '@/components/supplier/ui';

/**
 * Set a product's available stock (cases). The change and its reason are
 * written to the product's change history on the server.
 */
export default function StockAdjustDialog({ product, onClose, onSaved }: { product: { id: string; name: string; stock: number; reserved?: number } | null; onClose: () => void; onSaved: (stock: number) => void }) {
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
        if (!valid) { setErr('Enter a whole number of cases (0 or more).'); return; }
        if (delta === 0) { onClose(); return; }
        setBusy(true); setErr(null);
        try {
            const saved = await supplierApi.update(product.id, { stock: n, changeReason: reason.trim() || (delta > 0 ? 'Stock added' : 'Stock reduced') });
            toast.success(`Stock for “${product.name}” set to ${int(saved.stock)} cases`);
            onSaved(saved.stock);
        } catch (e: any) { setErr(e.message); }
        finally { setBusy(false); }
    };
    return (
        <Dialog open={!!product} onClose={onClose} size="sm" title="Adjust stock" description={product.name}
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save stock</Button></>}>
            <div className="space-y-4">
                <Field label="Available to sell (cases)" htmlFor="adj-stock" required error={err}
                    hint={valid ? `${delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${int(delta)} cases`}. Cases already reserved on open orders${product.reserved ? ` (${int(product.reserved)})` : ''} are not included.` : undefined}>
                    <input id="adj-stock" data-autofocus inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))} className={inputCls} />
                </Field>
                <Field label="Reason" htmlFor="adj-reason" optional hint="Saved in the product’s change history, e.g. “New delivery received” or “Stock count correction”.">
                    <input id="adj-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={inputCls} />
                </Field>
            </div>
        </Dialog>
    );
}
