'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Package, Truck, CheckCircle2, Clock, XCircle,
    ArrowLeft, Loader2, MapPin, RefreshCw,
    Download, AlertTriangle, ChevronDown, ChevronUp, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface OrderDetail {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    shippingCompany: string | null;
    shippingCost: number | null;
    createdAt: string;
    items: {
        id: string;
        quantity: number;
        price: number;
        product: { id: string; name: string; images: string[]; supplier: { name: string } };
    }[];
    history: { id: string; previousStatus: string | null; newStatus: string; createdAt: string; reason: string | null }[];
}

const STEPS: { key: OrderStatus | 'CONFIRMED'; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'PENDING', label: 'Order Placed', icon: Clock, desc: 'Awaiting supplier confirmation' },
    { key: 'PROCESSING', label: 'Confirmed', icon: CheckCircle2, desc: 'Supplier is processing your order' },
    { key: 'SHIPPED', label: 'Shipped', icon: Truck, desc: 'On the way to your address' },
    { key: 'DELIVERED', label: 'Delivered', icon: Package, desc: 'Order received successfully' },
];

const STATUS_ORDER: Record<string, number> = {
    PENDING: 0, PROCESSING: 1, SHIPPED: 2, DELIVERED: 3, CANCELLED: -1,
};

const STATUS_COLORS: Record<OrderStatus, string> = {
    PENDING: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    PROCESSING: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    SHIPPED: 'text-primary bg-primary/10 border-primary/20',
    DELIVERED: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    CANCELLED: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const DISPUTE_REASONS = [
    'Item not received',
    'Wrong item delivered',
    'Item arrived damaged',
    'Item not as described',
    'Missing items in order',
    'Quality issue',
    'Other',
];

function buildInvoiceHtml(invoice: any, order: OrderDetail): string {
    const itemRows = order.items
        .map(i => `<tr><td>${i.product.name}</td><td>${i.quantity}</td><td>$${i.price.toFixed(2)}</td><td>$${(i.price * i.quantity).toFixed(2)}</td></tr>`)
        .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Invoice ${invoice.invoiceNumber}</title>
<style>
body{font-family:'Segoe UI',sans-serif;margin:0;padding:40px;color:#0A1A2F;background:#fff}
.header{background:#0A1A2F;color:#fff;padding:32px;border-radius:12px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:center}
.logo{font-size:26px;font-weight:900}.logo span{color:#1BC7C9}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px}
.meta-box{background:#F2F4F7;padding:16px;border-radius:8px}
.meta-box label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#667085;display:block;margin-bottom:4px}
.meta-box p{margin:0;font-weight:700;font-size:14px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#667085;padding:8px 12px;border-bottom:2px solid #E5E7EB}
td{padding:12px;border-bottom:1px solid #F2F4F7;font-size:14px}
.totals{margin-left:auto;width:280px}
.total-row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px}
.total-final{display:flex;justify-content:space-between;padding:16px 0;font-size:18px;font-weight:900;color:#1BC7C9;border-top:2px solid #0A1A2F;margin-top:8px}
.footer{text-align:center;color:#667085;font-size:11px;margin-top:40px;padding-top:16px;border-top:1px solid #E5E7EB}
</style></head><body>
<div class="header">
  <div><div class="logo">Atlan<span>tis</span></div></div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:900">${invoice.invoiceNumber}</div>
    <div style="font-size:12px;color:#B0BCCF;margin-top:4px">Issued: ${new Date(invoice.createdAt).toLocaleDateString()}</div>
  </div>
</div>
<div class="meta">
  <div class="meta-box"><label>Order Reference</label><p>#${order.id.slice(-8).toUpperCase()}</p></div>
  <div class="meta-box"><label>Due Date</label><p>${new Date(invoice.dueDate).toLocaleDateString()}</p></div>
  <div class="meta-box"><label>Payment Status</label><p>${invoice.status}</p></div>
  <div class="meta-box"><label>Currency</label><p>${invoice.currency || 'USD'}</p></div>
</div>
<h2 style="font-size:18px">Order Items</h2>
<table>
  <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="totals">
  <div class="total-row"><span>Subtotal</span><span>$${invoice.amount.toFixed(2)}</span></div>
  <div class="total-row"><span>Tax</span><span>$${invoice.tax.toFixed(2)}</span></div>
  <div class="total-final"><span>Total</span><span>$${invoice.totalAmount.toFixed(2)}</span></div>
</div>
<div class="footer">© 2026 Atlantis Marketplace — atlantisfmcg.com</div>
</body></html>`;
}

export default function OrderTrackingPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [order, setOrder] = React.useState<OrderDetail | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [isDownloading, setIsDownloading] = React.useState(false);

    // Dispute state
    const [showDisputeForm, setShowDisputeForm] = React.useState(false);
    const [disputeReason, setDisputeReason] = React.useState('');
    const [disputeDescription, setDisputeDescription] = React.useState('');
    const [isSubmittingDispute, setIsSubmittingDispute] = React.useState(false);
    const [disputeSuccess, setDisputeSuccess] = React.useState(false);
    const [disputeError, setDisputeError] = React.useState('');
    const [existingDispute, setExistingDispute] = React.useState<any>(null);

    const [isConfirming, setIsConfirming] = React.useState(false);

    const fetchOrder = React.useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const [orderRes, disputesRes] = await Promise.all([
                apiFetch(`/orders/${id}`),
                apiFetch(`/disputes/my`),
            ]);
            if (!orderRes.ok) { setError('Order not found'); return; }
            setOrder(await orderRes.json());
            if (disputesRes.ok) {
                const disputes = await disputesRes.json();
                const found = disputes.find((d: any) => d.orderId === id);
                if (found) setExistingDispute(found);
            }
        } catch { setError('Failed to load order'); }
        finally { setIsLoading(false); }
    }, [id]);

    React.useEffect(() => { fetchOrder(); }, [fetchOrder]);

    const handleDownloadInvoice = async () => {
        if (!order) return;
        setIsDownloading(true);
        try {
            const res = await apiFetch(`/invoices/my`);
            if (!res.ok) { alert('Invoice not available yet. It is generated after delivery.'); return; }
            const invoices: any[] = await res.json();
            const invoice = invoices.find((inv: any) => inv.orderId === order.id);
            if (!invoice) { alert('Invoice not generated yet. It will be available after delivery.'); return; }

            // Safe: use Blob URL instead of document.write
            const html = buildInvoiceHtml(invoice, order);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const win = window.open(url, '_blank');
            if (win) {
                win.addEventListener('load', () => {
                    win.print();
                    URL.revokeObjectURL(url);
                });
            }
        } finally { setIsDownloading(false); }
    };

    const handleSubmitDispute = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!disputeReason || !disputeDescription.trim()) {
            setDisputeError('Please select a reason and describe the issue.');
            return;
        }
        setIsSubmittingDispute(true);
        setDisputeError('');
        try {
            const res = await apiFetch(`/disputes`, {
                method: 'POST',
                body: JSON.stringify({ orderId: id, reason: disputeReason, description: disputeDescription.trim() }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setDisputeError(err.message || 'Failed to open dispute');
                return;
            }
            const dispute = await res.json();
            setExistingDispute(dispute);
            setDisputeSuccess(true);
            setShowDisputeForm(false);
        } catch { setDisputeError('Connection error. Please try again.'); }
        finally { setIsSubmittingDispute(false); }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <XCircle className="w-12 h-12 opacity-20" />
                <p className="font-bold">{error || 'Order not found'}</p>
                <Link href="/dashboard/customer" className="text-primary text-sm font-bold hover:underline">Back to Dashboard</Link>
            </div>
        );
    }

    const currentStep = STATUS_ORDER[order.status] ?? 0;
    const isCancelled = order.status === 'CANCELLED';
    const canDispute = ['SHIPPED', 'DELIVERED'].includes(order.status) && !existingDispute;

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 pt-24 pb-20 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="w-10 h-10 rounded-xl border border-border/50 bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Order Tracking</h1>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                            #{order.id.slice(-8).toUpperCase()} • {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border', STATUS_COLORS[order.status])}>
                        {order.status}
                    </span>
                    {order.status === 'SHIPPED' && (
                        <button 
                            onClick={async () => {
                                if (!window.confirm('Confirm that you have received all items in good condition? This will release the payment to the supplier.')) return;
                                setIsConfirming(true);
                                try {
                                    const res = await apiFetch(`/orders/${id}/confirm-delivery`, { method: 'POST' });
                                    if (res.ok) {
                                        await fetchOrder();
                                        alert('Delivery confirmed. Thank you!');
                                    } else {
                                        const err = await res.json();
                                        alert(err.message || 'Confirmation failed');
                                    }
                                } catch (err) {
                                    alert('Failed to connect to server');
                                } finally {
                                    setIsConfirming(false);
                                }
                            }}
                            disabled={isConfirming}
                            className="h-9 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl border border-emerald-600 transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                            {isConfirming ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            Confirm Delivery
                        </button>
                    )}
                    {order.status === 'DELIVERED' && (
                        <button onClick={handleDownloadInvoice} disabled={isDownloading}
                            className="h-9 px-4 bg-primary/10 hover:bg-primary/20 text-primary font-black text-xs rounded-xl border border-primary/20 transition-all flex items-center gap-1.5 disabled:opacity-50">
                            {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                            Invoice
                        </button>
                    )}
                    <button onClick={fetchOrder} className="w-9 h-9 rounded-xl border border-border/50 bg-card flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Progress Stepper */}
            {!isCancelled ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border/50 rounded-3xl p-8">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-8">Shipment Progress</p>
                    <div className="relative">
                        <div className="absolute top-6 start-6 end-6 h-0.5 bg-border/50" />
                        <div className="absolute top-6 start-6 h-0.5 bg-primary transition-all duration-700"
                            style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }} />
                        <div className="flex justify-between relative z-10">
                            {STEPS.map((step, i) => {
                                const Icon = step.icon;
                                const done = i <= currentStep;
                                const active = i === currentStep;
                                return (
                                    <div key={step.key} className="flex flex-col items-center gap-3 w-24">
                                        <div className={cn('w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all',
                                            done ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30' : 'bg-card border-border/50 text-muted-foreground',
                                            active && 'ring-4 ring-primary/20 scale-110')}>
                                            <Icon size={20} />
                                        </div>
                                        <div className="text-center">
                                            <p className={cn('text-[10px] font-black uppercase tracking-wide', done ? 'text-foreground' : 'text-muted-foreground')}>{step.label}</p>
                                            <p className="text-[9px] text-muted-foreground font-medium mt-0.5 leading-tight hidden md:block">{step.desc}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>
            ) : (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 flex items-center gap-4">
                    <XCircle className="text-red-400 w-10 h-10 shrink-0" />
                    <div>
                        <p className="font-black text-red-400">Order Cancelled</p>
                        <p className="text-sm text-muted-foreground mt-1">This order has been cancelled. Contact support if you have questions.</p>
                    </div>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Order Items */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border/50 rounded-3xl p-6 space-y-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Items ({order.items.length})</p>
                    <div className="space-y-3">
                        {order.items.map(item => (
                            <div key={item.id} className="flex items-center gap-3">
                                {item.product.images?.[0] ? (
                                    <img src={item.product.images[0]} alt={item.product.name} className="w-12 h-12 rounded-xl object-cover border border-border/50 shrink-0" />
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                                        <Package size={16} className="text-muted-foreground" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{item.product.name}</p>
                                    <p className="text-[11px] text-muted-foreground">{item.product.supplier?.name}</p>
                                </div>
                                <div className="text-end shrink-0">
                                    <p className="text-xs font-black text-primary">${(item.price * item.quantity).toFixed(2)}</p>
                                    <p className="text-[10px] text-muted-foreground">Qty: {item.quantity}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Financial Summary */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card border border-border/50 rounded-3xl p-6 space-y-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Summary</p>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-bold">${order.totalAmount.toFixed(2)}</span>
                        </div>
                        {order.shippingCost != null && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Truck size={12} /> {order.shippingCompany || 'Shipping'}
                                </span>
                                <span className="font-bold">${order.shippingCost.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between pt-3 border-t border-border/50">
                            <span className="font-black text-primary">Total</span>
                            <span className="font-black text-primary text-lg">${(order.totalAmount + (order.shippingCost || 0)).toFixed(2)}</span>
                        </div>
                    </div>
                    {order.shippingCompany && (
                        <div className="pt-4 border-t border-border/50 flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin size={14} className="text-primary shrink-0" />
                            <span className="font-bold">{order.shippingCompany}</span>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* History Timeline */}
            {order.history && order.history.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card border border-border/50 rounded-3xl p-6 space-y-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status History</p>
                    <div className="space-y-3">
                        {order.history.map(entry => (
                            <div key={entry.id} className="flex items-start gap-3">
                                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                                <div className="flex-1">
                                    <p className="text-xs font-black">{entry.newStatus}</p>
                                    {entry.reason && <p className="text-[11px] text-muted-foreground">{entry.reason}</p>}
                                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(entry.createdAt).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Dispute Section */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card border border-border/50 rounded-3xl overflow-hidden">
                <div className="p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                <AlertTriangle size={18} className="text-orange-500" />
                            </div>
                            <div>
                                <p className="font-black text-sm">Problem with this order?</p>
                                <p className="text-[11px] text-muted-foreground">Open a dispute and our support team will resolve it</p>
                            </div>
                        </div>
                        {canDispute && !disputeSuccess && (
                            <button onClick={() => setShowDisputeForm(v => !v)}
                                className="flex items-center gap-1.5 h-9 px-4 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-black text-xs rounded-xl border border-orange-500/20 transition-all">
                                {showDisputeForm ? <><ChevronUp size={12} /> Cancel</> : <><ChevronDown size={12} /> Open Dispute</>}
                            </button>
                        )}
                    </div>

                    {/* Existing dispute badge */}
                    {existingDispute && (
                        <div className={cn('mt-4 p-4 rounded-2xl border text-sm',
                            existingDispute.status === 'OPEN' ? 'bg-yellow-500/5 border-yellow-500/20' :
                            existingDispute.status === 'UNDER_REVIEW' ? 'bg-blue-500/5 border-blue-500/20' :
                            existingDispute.status === 'RESOLVED_REFUND' ? 'bg-emerald-500/5 border-emerald-500/20' :
                            'bg-muted/50 border-border/50'
                        )}>
                            <p className="font-black">Dispute #{existingDispute.id.slice(-6).toUpperCase()}</p>
                            <p className="text-muted-foreground mt-1">Reason: {existingDispute.reason}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider',
                                    existingDispute.status === 'OPEN' ? 'bg-yellow-500/20 text-yellow-500' :
                                    existingDispute.status === 'UNDER_REVIEW' ? 'bg-blue-500/20 text-blue-500' :
                                    existingDispute.status === 'RESOLVED_REFUND' ? 'bg-emerald-500/20 text-emerald-500' :
                                    'bg-muted text-muted-foreground'
                                )}>
                                    {existingDispute.status.replace(/_/g, ' ')}
                                </span>
                                {existingDispute.resolution && (
                                    <p className="text-[11px] text-muted-foreground">— {existingDispute.resolution}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {disputeSuccess && !existingDispute && (
                        <div className="mt-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
                            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                Dispute submitted. Our team will review it within 24–48 hours.
                            </p>
                        </div>
                    )}

                    {!canDispute && !existingDispute && !disputeSuccess && (
                        <p className="mt-3 text-[11px] text-muted-foreground">
                            Disputes are available once your order has been shipped or delivered.
                        </p>
                    )}
                </div>

                {/* Dispute Form */}
                <AnimatePresence>
                    {showDisputeForm && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-border/50"
                        >
                            <form onSubmit={handleSubmitDispute} className="p-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        Reason *
                                    </label>
                                    <select
                                        value={disputeReason}
                                        onChange={e => setDisputeReason(e.target.value)}
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary/50"
                                    >
                                        <option value="">Select a reason...</option>
                                        {DISPUTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        Description *
                                    </label>
                                    <textarea
                                        value={disputeDescription}
                                        onChange={e => setDisputeDescription(e.target.value)}
                                        placeholder="Describe what happened in detail..."
                                        rows={4}
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary/50 resize-none"
                                    />
                                </div>
                                {disputeError && (
                                    <p className="text-xs text-red-500 font-bold flex items-center gap-1.5">
                                        <AlertTriangle size={12} /> {disputeError}
                                    </p>
                                )}
                                <button type="submit" disabled={isSubmittingDispute}
                                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-black text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                    {isSubmittingDispute
                                        ? <><Loader2 size={14} className="animate-spin" /> Submitting...</>
                                        : <><Send size={14} /> Submit Dispute</>}
                                </button>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            <Link href="/dashboard/customer" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft size={14} />
                Back to Dashboard
            </Link>
        </div>
    );
}
