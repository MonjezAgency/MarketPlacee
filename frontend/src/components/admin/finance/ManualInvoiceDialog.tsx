'use client';

import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button, Dialog, Field, Notice, inputCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { AccountPicker, readError, useMoney, useTf, type AccountOption } from './shared';

/**
 * Manual invoice (POST /finance/manual-invoice, ADMIN; OWNER passes).
 * The API accepts exactly { customerId, amount, notes }. Everything else is
 * set by the server (invoice.service.ts createManualInvoice): number, status
 * ISSUED, due date 30 days after creation, the currency column's default
 * (USD) and a flat 5% tax unless the account has an APPROVED tax exemption.
 * No order link, no due-date choice, no currency choice and no PDF upload
 * exist in that API, so the form doesn't offer them.
 */
const RECORDED_CURRENCY = 'USD';
const MAX_AMOUNT = 10_000_000;
const DUE_DAYS = 30;

export function ManualInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const tf = useTf();
    const money = useMoney();
    const [account, setAccount] = React.useState<AccountOption | null>(null);
    const [amount, setAmount] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [touched, setTouched] = React.useState(false);
    const [exempt, setExempt] = React.useState<boolean | null>(null);
    const [busy, setBusy] = React.useState(false);
    const inFlight = React.useRef(false);
    const [error, setError] = React.useState<string | null>(null);
    const [created, setCreated] = React.useState<{ invoiceNumber: string; totalAmount: number; tax: number; currency: string } | null>(null);

    // Whether the server will add tax: it checks for an APPROVED exemption on the account.
    React.useEffect(() => {
        setExempt(null);
        if (!account) return;
        let alive = true;
        apiFetch(`/finance/tax-exemptions?userId=${encodeURIComponent(account.id)}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((list) => { if (alive) setExempt(Array.isArray(list) ? list.some((x: any) => x?.status === 'APPROVED') : null); })
            .catch(() => { if (alive) setExempt(null); });
        return () => { alive = false; };
    }, [account]);

    const n = Number(amount);
    const amountOk = amount.trim() !== '' && Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT && /^\d+(\.\d{1,2})?$/.test(amount.trim());
    const errAccount = touched && !account ? tf('miAccountError') : null;
    const errAmount = touched && !amountOk ? tf('miAmountError', { max: money(MAX_AMOUNT, RECORDED_CURRENCY) }) : null;
    const taxRate = exempt === null ? null : exempt ? 0 : 0.05;
    const tax = taxRate === null || !amountOk ? null : Math.round(n * taxRate * 100) / 100;

    const submit = async () => {
        setTouched(true);
        if (!account || !amountOk || inFlight.current) return;
        inFlight.current = true; setBusy(true); setError(null);
        try {
            const res = await apiFetch('/finance/manual-invoice', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: account.id, amount: Math.round(n * 100) / 100, ...(notes.trim() ? { notes: notes.trim() } : {}) }),
            });
            // A 5xx may come after the record was written: ask to check the list instead of retrying blindly.
            if (!res.ok) throw new Error(res.status >= 500 ? tf('miServerError') : await readError(res, tf('miFailed')));
            const inv = await res.json().catch(() => null);
            if (!inv?.invoiceNumber) throw new Error(tf('miNoConfirmation'));
            setCreated({ invoiceNumber: inv.invoiceNumber, totalAmount: inv.totalAmount, tax: inv.tax, currency: inv.currency || RECORDED_CURRENCY });
            onCreated();
        } catch (e: any) {
            setError(e?.message || tf('miFailed'));
        } finally { inFlight.current = false; setBusy(false); }
    };

    if (created) return (
        <Dialog open onClose={onClose} title={tf('miDoneTitle')} size="sm" footer={<Button variant="primary" onClick={onClose}>{tf('close')}</Button>}>
            <div className="flex items-start gap-3" role="status">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                <div className="text-[14px] text-ink-2">
                    <p>{tf('miDoneBody', { number: created.invoiceNumber })}</p>
                    <p className="mt-1 text-ink-3">{tf('miDoneTotals', { total: money(created.totalAmount, created.currency), tax: money(created.tax, created.currency) })}</p>
                </div>
            </div>
        </Dialog>
    );

    const row = (label: string, value: React.ReactNode) => (
        <div className="flex items-start justify-between gap-4 py-1.5 border-b border-line last:border-0">
            <dt className="text-ink-3">{label}</dt><dd className="text-ink text-end tabular-nums min-w-0">{value}</dd>
        </div>
    );

    return (
        <Dialog open onClose={() => !busy && onClose()} dismissable={!busy} title={tf('miTitle')} description={tf('miLead')} size="md"
            footer={<>
                <Button variant="secondary" disabled={busy} onClick={onClose}>{tf('cancel')}</Button>
                <Button variant="primary" loading={busy} onClick={submit}>{tf('miSubmit')}</Button>
            </>}>
            <div className="space-y-4">
                <Field label={tf('miAccount')} htmlFor="mi-account" required error={errAccount} hint={tf('miAccountHint')}>
                    <AccountPicker id="mi-account" role="CUSTOMER" label={tf('miAccount')} value={account} onChange={setAccount} error={errAccount} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={tf('miAmount')} htmlFor="mi-amount" required error={errAmount} hint={tf('miAmountHint')}>
                        <div className="relative">
                            <input id="mi-amount" inputMode="decimal" dir="ltr" className={cn(inputCls, 'pe-14 tabular-nums')} value={amount} aria-invalid={!!errAmount || undefined}
                                onChange={(e) => setAmount(e.target.value.replace(',', '.'))} placeholder="0.00" />
                            <span aria-hidden className="absolute end-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">{RECORDED_CURRENCY}</span>
                        </div>
                    </Field>
                    <Field label={tf('miCurrency')} htmlFor="mi-currency" hint={tf('miCurrencyHint')}>
                        <input id="mi-currency" className={inputCls} value={RECORDED_CURRENCY} disabled dir="ltr" />
                    </Field>
                </div>
                <Field label={tf('miNotes')} htmlFor="mi-notes" optional hint={tf('miNotesHint')}>
                    <textarea id="mi-notes" rows={3} maxLength={2000} className={cn(inputCls, 'h-auto py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
                <section aria-labelledby="mi-summary" className="rounded-lg bg-surface-2 ring-1 ring-line px-4 py-3 text-[13px]">
                    <h3 id="mi-summary" className="text-[13.5px] font-semibold text-heading mb-1">{tf('miSummary')}</h3>
                    <dl>
                        {row(tf('miSumAccount'), account ? (account.companyName || account.name) : <span className="text-ink-4">{tf('miNotChosen')}</span>)}
                        {row(tf('miSumAmount'), amountOk ? money(n, RECORDED_CURRENCY) : <span className="text-ink-4">—</span>)}
                        {row(tf('miSumTax'), !account ? <span className="text-ink-4">—</span> : exempt === null ? tf('miTaxUnknown') : exempt ? tf('miTaxExempt') : tax !== null ? tf('miTaxDefault', { tax: money(tax, RECORDED_CURRENCY) }) : tf('miTaxRule'))}
                        {row(tf('miSumTotal'), amountOk && tax !== null ? money(n + tax, RECORDED_CURRENCY) : <span className="text-ink-4">—</span>)}
                        {row(tf('miSumStatus'), tf('status_ISSUED'))}
                        {row(tf('miSumDue'), tf('miDueRule', { days: DUE_DAYS }))}
                        {row(tf('miSumOrder'), tf('miNoOrder'))}
                        {row(tf('miSumDocument'), tf('miNoDocument'))}
                    </dl>
                    <p className="mt-2 text-[12.5px] text-ink-3">{tf('miTaxNote')}</p>
                </section>
                {error && <Notice tone="danger">{error}</Notice>}
            </div>
        </Dialog>
    );
}
