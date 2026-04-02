'use client';

import React, { useState } from 'react';

import {
    ShieldCheck, ArrowRight, Truck, CreditCard,
    ChevronLeft, Info, CheckCircle2, Package,
    Tag, X, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import StripeCheckout from '@/components/payment/StripeCheckout';

const ADDR_KEY = 'bev-checkout-address';

export default function CheckoutPage() {
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
    const { items, total, clearCart } = useCart();
    const { user } = useAuth();

    // Address state — pre-filled from localStorage (last used) or user profile
    const savedAddr = typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem(ADDR_KEY) || '{}')
        : {};
    const [addrName, setAddrName] = useState<string>(savedAddr.name || user?.name || '');
    const [addrCompany, setAddrCompany] = useState<string>(savedAddr.company || user?.companyName || '');
    const [addrStreet, setAddrStreet] = useState<string>(savedAddr.street || '');
    const [addrCity, setAddrCity] = useState<string>(savedAddr.city || '');
    const [addrPostal, setAddrPostal] = useState<string>(savedAddr.postal || '');

    // Shipping State
    const [shippingRates, setShippingRates] = useState<any[]>([]);
    const [selectedShipping, setSelectedShipping] = useState<any>(null);
    const [isLoadingRates, setIsLoadingRates] = useState(false);

    // Coupon State
    const [couponCode, setCouponCode] = useState('');
    const [couponDiscount, setCouponDiscount] = useState(0);
    const [couponApplied, setCouponApplied] = useState('');
    const [couponError, setCouponError] = useState('');
    const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

    // Fetch Rates on Mount
    React.useEffect(() => {
        const fetchRates = async () => {
            setIsLoadingRates(true);
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/shipping/rates?cartTotal=${total}&destination=Dubai`);
                if (res.ok) {
                    const data = await res.json();
                    setShippingRates(data);
                    if (data.length > 0) setSelectedShipping(data[0]); // default
                }
            } catch (e) {
                console.error("Failed to load shipping rates", e);
            } finally {
                setIsLoadingRates(false);
            }
        };
        fetchRates();
    }, [total]);

    const handleNext = () => {
        // Persist address so next checkout is pre-filled
        localStorage.setItem(ADDR_KEY, JSON.stringify({
            name: addrName,
            company: addrCompany,
            street: addrStreet,
            city: addrCity,
            postal: addrPostal,
        }));
        setStep(s => s + 1);
    };
    const handleBack = () => setStep(s => s - 1);

    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) return;
        setCouponError('');
        setIsValidatingCoupon(true);
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/coupons/validate/${couponCode.trim()}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (!res.ok) { setCouponError(data.message || 'Invalid coupon'); return; }
            setCouponDiscount(data.discountPercent);
            setCouponApplied(data.code);
            setCouponCode('');
        } catch { setCouponError('Could not validate coupon'); }
        finally { setIsValidatingCoupon(false); }
    };

    const removeCoupon = () => { setCouponDiscount(0); setCouponApplied(''); setCouponError(''); };

    const discountAmount = total * (couponDiscount / 100);
    const grandTotal = (total - discountAmount) * 0.95 + (selectedShipping?.cost || 0);

    const handlePlaceOrder = async () => {
        if (!items || items.length === 0) {
            alert('Your cart is empty. Please add items before placing an order.');
            return;
        }
        if (!selectedShipping) {
            alert('Please select a shipping method.');
            return;
        }
        setIsProcessing(true);
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    items: items.map(i => ({ productId: i.id, quantity: i.quantity, price: i.price })),
                    totalAmount: grandTotal,
                    shippingCompany: selectedShipping?.name,
                    shippingCost: selectedShipping?.cost,
                    shippingAddress: {
                        name: addrName,
                        company: addrCompany,
                        street: addrStreet,
                        city: addrCity,
                        postal: addrPostal,
                    },
                })
            });

            if (res.ok) {
                const order = await res.json();
                setCreatedOrderId(order.id);
                setStep(3); // → Stripe payment step
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err?.message || 'Failed to place order. Please try again.');
            }
        } catch (error) {
            alert('Connection error. Please check your connection and try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <main className="min-h-screen bg-muted/20 pt-12 pb-24">
            <div className="container mx-auto px-6">
                {/* Header */}
                <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
                    <div className="space-y-4">
                        <Link href="/cart" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">
                            <ChevronLeft size={16} />
                            Back to Basket
                        </Link>
                        <h1 className="text-4xl">Logistics <span className="text-secondary">Procurement</span></h1>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center gap-3 bg-card border border-border/50 p-2 rounded-2xl premium-shadow">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-500",
                                    step >= i
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                                        : "bg-muted text-muted-foreground"
                                )}>
                                    {i}
                                </div>
                                {i < 3 && (
                                    <div className="w-12 h-1 mx-2 rounded-full bg-muted overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: step > i ? '100%' : '0%' }}
                                            className="h-full bg-primary"
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {step === 4 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-3xl mx-auto bg-card border border-border/50 p-16 rounded-[48px] text-center space-y-8 premium-shadow relative overflow-hidden"
                    >
                        <div className="absolute top-0 start-0 w-full h-2 bg-accent" />
                        <div className="w-24 h-24 bg-accent/10 rounded-[32px] flex items-center justify-center mx-auto text-accent mb-6 animate-pulse">
                            <CheckCircle2 size={48} />
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-5xl font-heading font-black tracking-tight">Order Procurement Initiated</h2>
                            <p className="text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto font-medium">
                                Tracking <span className="text-foreground font-black">#SKU-990-2026</span> is now active.
                                Our logistics partners are preparing your distribution batch.
                            </p>
                        </div>
                        <div className="pt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link href="/dashboard/buyer">
                                <Button variant="outline" size="xl" className="rounded-3xl px-12 font-black">Distribution Center</Button>
                            </Link>
                            <Link href="/">
                                <Button size="xl" className="rounded-3xl px-12 font-black">Source More items</Button>
                            </Link>
                        </div>
                        <div className="absolute bottom-[-10%] right-[-5%] w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                        {/* Main Form Area */}
                        <div className="lg:col-span-2 space-y-10">
                            <AnimatePresence mode="wait">
                                {/* Step 1: Shipping */}
                                {step === 1 && (
                                    <motion.div
                                        key="step1"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="bg-card border border-border/50 p-10 sm:p-12 rounded-[40px] space-y-10 premium-shadow"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                                                <Truck className="text-primary" size={24} />
                                            </div>
                                            <h2 className="text-3xl font-heading font-bold">Distribution & Logistics</h2>
                                        </div>

                                        <div className="space-y-6">
                                            <h3 className="text-lg font-bold">Select Logistics Partner</h3>

                                            {isLoadingRates ? (
                                                <div className="space-y-4">
                                                    {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-3xl animate-pulse" />)}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-4">
                                                    {shippingRates.map((rate) => (
                                                        <div
                                                            key={rate.id}
                                                            onClick={() => setSelectedShipping(rate)}
                                                            className={cn(
                                                                "p-6 border-2 rounded-3xl flex items-center justify-between cursor-pointer transition-all duration-300",
                                                                selectedShipping?.id === rate.id
                                                                    ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                                                                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-6">
                                                                <div className="w-16 h-16 bg-white rounded-xl border border-border flex items-center justify-center p-2 shadow-sm">
                                                                    {/* Mocking logo with text if image missing */}
                                                                    <span className="text-[10px] font-black text-center text-foreground uppercase tracking-tighter leading-tight">
                                                                        {rate.name.split(' ').join('\n')}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <p className="font-heading font-bold text-lg">{rate.name}</p>
                                                                    <p className="text-sm text-muted-foreground font-medium">Estimated Transit: <span className="text-foreground">{rate.estimatedDays} Days</span></p>
                                                                </div>
                                                            </div>
                                                            <div className="text-end">
                                                                <p className="font-heading font-black text-xl text-primary">{formatPrice(rate.cost, false)}</p>
                                                                <div className="mt-2 w-6 h-6 rounded-full border-2 border-border mx-auto flex items-center justify-center">
                                                                    {selectedShipping?.id === rate.id && <div className="w-3 h-3 bg-primary rounded-full animate-in zoom-in" />}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-6 border-t border-border/50">
                                            <h3 className="text-lg font-bold mb-2">Delivery Address</h3>
                                            <p className="text-xs text-muted-foreground mb-6">Saved automatically for your next order.</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <Input label="Contact Name" placeholder="Alex Sterling"
                                                    value={addrName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrName(e.target.value)} />
                                                <Input label="Business / Company" placeholder="Sterling Distribution LLC"
                                                    value={addrCompany} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrCompany(e.target.value)} />
                                                <Input label="Street Address" placeholder="Pier 42, Marine Drive" className="md:col-span-2"
                                                    value={addrStreet} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrStreet(e.target.value)} />
                                                <Input label="City / Zone" placeholder="Dubai Logistics Center"
                                                    value={addrCity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrCity(e.target.value)} />
                                                <Input label="Postal / Warehouse Code" placeholder="7720-DXB"
                                                    value={addrPostal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrPostal(e.target.value)} />
                                            </div>
                                        </div>

                                        <Button onClick={handleNext} size="xl" className="w-full gap-3" disabled={!selectedShipping}>
                                            Confirm Logistics Point
                                            <ArrowRight size={20} />
                                        </Button>
                                    </motion.div>
                                )}

                                {/* Step 2: Review Order */}
                                {step === 2 && (
                                    <motion.div
                                        key="step2"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="bg-card border border-border/50 p-10 sm:p-12 rounded-[40px] space-y-8 premium-shadow"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                                                <ShieldCheck className="text-primary" size={24} />
                                            </div>
                                            <h2 className="text-3xl font-heading font-bold">Review Order</h2>
                                        </div>

                                        {/* Cart items preview */}
                                        <div className="space-y-3 max-h-64 overflow-y-auto">
                                            {items.map(item => (
                                                <div key={item.id} className="flex items-center gap-4 p-3 bg-muted/20 rounded-2xl border border-border/50">
                                                    {item.image ? (
                                                        <img src={item.image} alt="" className="w-12 h-12 rounded-xl object-contain bg-card border border-border/50 p-1" />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                                                            <Package size={16} className="text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold truncate">{item.name}</p>
                                                        <p className="text-xs text-muted-foreground">{item.brand} • Qty: {item.quantity}</p>
                                                    </div>
                                                    <p className="text-sm font-black text-primary shrink-0">{formatPrice(item.price * item.quantity, false)}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="p-5 bg-muted/20 rounded-2xl border border-border/50 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Logistics via</span>
                                                <span className="font-bold">{selectedShipping?.name}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Shipping cost</span>
                                                <span className="font-bold">{formatPrice(selectedShipping?.cost || 0, false)}</span>
                                            </div>
                                            <div className="flex justify-between text-base font-black pt-2 border-t border-border/50">
                                                <span>Total Due</span>
                                                <span className="text-primary">{formatPrice(grandTotal, false)}</span>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <Button variant="outline" size="xl" onClick={handleBack} className="flex-1" disabled={isProcessing}>
                                                Modify
                                            </Button>
                                            <Button onClick={handlePlaceOrder} size="xl" className="flex-[2]" isLoading={isProcessing}>
                                                Proceed to Payment
                                                <ArrowRight size={20} />
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Step 3: Stripe Payment */}
                                {step === 3 && createdOrderId && (
                                    <motion.div
                                        key="step3"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="bg-card border border-border/50 p-10 sm:p-12 rounded-[40px] premium-shadow"
                                    >
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                                                <CreditCard className="text-primary" size={24} />
                                            </div>
                                            <h2 className="text-3xl font-heading font-bold">Secure Payment</h2>
                                        </div>
                                        <StripeCheckout
                                            orderId={createdOrderId}
                                            amount={grandTotal}
                                            onSuccess={() => { clearCart(); setStep(4); }}
                                            onCancel={handleBack}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Sidebar / Summary */}
                        <aside className="space-y-8">
                            <div className="bg-card border border-border/50 p-10 rounded-[40px] premium-shadow space-y-8">
                                <h3 className="font-heading font-bold text-2xl">Ledger Overview</h3>

                                {/* Coupon */}
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Promo Code</p>
                                    {couponApplied ? (
                                        <div className="flex items-center justify-between p-3 bg-accent/10 border border-accent/20 rounded-xl">
                                            <div className="flex items-center gap-2">
                                                <Tag size={14} className="text-accent" />
                                                <span className="text-sm font-black text-accent">{couponApplied}</span>
                                                <span className="text-xs text-accent/80">−{couponDiscount}%</span>
                                            </div>
                                            <button onClick={removeCoupon} className="text-muted-foreground hover:text-red-500 transition-colors">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={couponCode}
                                                onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                                                onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                                                placeholder="PROMO CODE"
                                                className="flex-1 h-10 px-3 bg-muted/30 border border-border/50 rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-primary/20 tracking-widest"
                                            />
                                            <button
                                                onClick={handleApplyCoupon}
                                                disabled={isValidatingCoupon || !couponCode.trim()}
                                                className="h-10 px-4 bg-primary/10 hover:bg-primary/20 text-primary font-black text-xs rounded-xl border border-primary/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                                            >
                                                {isValidatingCoupon ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
                                            </button>
                                        </div>
                                    )}
                                    {couponError && <p className="text-xs text-red-500 font-bold">{couponError}</p>}
                                </div>

                                <div className="space-y-5 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground font-medium">Batch Value</span>
                                        <span className="font-heading font-bold text-base">{formatPrice(total, false)}</span>
                                    </div>
                                    {couponDiscount > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-accent font-medium">Coupon ({couponDiscount}% off)</span>
                                            <span className="text-accent font-heading font-black">-{formatPrice(discountAmount, false)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground font-medium">Sourcing Credit (5%)</span>
                                        <span className="text-accent font-heading font-black">-{formatPrice((total - discountAmount) * 0.05, false)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground font-medium">Logistics Allocation</span>
                                        <span className="font-heading font-bold text-base">{selectedShipping ? formatPrice(selectedShipping.cost, false) : 'Pending'}</span>
                                    </div>
                                    {selectedShipping && (
                                        <div className="flex justify-between items-center ps-4 border-s-2 border-primary/20">
                                            <span className="text-xs text-muted-foreground font-medium shrink-0">Carrier</span>
                                            <span className="font-bold text-xs text-end truncate ps-2">{selectedShipping.name}</span>
                                        </div>
                                    )}
                                    <div className="pt-8 border-t border-border flex justify-between items-end">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Grand Total</span>
                                            <p className="font-heading font-black text-3xl text-primary">{formatPrice(grandTotal, false)}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 bg-primary/5 rounded-3xl flex items-start gap-4 border border-primary/10">
                                    <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-primary/80 leading-relaxed font-medium">
                                        Procurement is subject to regional VAT regulations. Full tax manifests will be generated post-authorization.
                                    </p>
                                </div>
                            </div>
                        </aside>
                    </div>
                )}
            </div>
        </main>
    );
}
