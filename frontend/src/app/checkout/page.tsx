'use client';

import { withStepUp } from '@/components/security/StepUp';
import React, { useState } from 'react';

import {
    ShieldCheck, ArrowRight, Truck, CreditCard,
    ChevronLeft, Info, CheckCircle2, Package,
    Tag, X, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatPrice, formatEUR } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { DeliveryBreakdown } from '@/components/orders/DeliveryBreakdown';
import { quoteCart, toServerItem, listDestinations, checkDestination, type CartQuote, type DestinationCheck } from '@/lib/wholesale';


const ADDR_KEY = 'bev-checkout-address';

export default function CheckoutPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
    const { items: cartItems, total: cartTotalAll, removeItem } = useCart();
    // ?scope=standard | load:<id> | loads — checkout one order from the cart.
    const [scope, setScope] = useState<string | null>(null);
    React.useEffect(() => { setScope(new URLSearchParams(window.location.search).get('scope')); }, []);
    const items = React.useMemo(() => cartItems.filter((i) =>
        scope === 'standard' ? !i.mixedLoadId
        : scope === 'loads' ? !!i.mixedLoadId
        : scope?.startsWith('load:') ? i.mixedLoadId === scope.slice(5)
        : true), [cartItems, scope]);
    const cartTotal = scope ? items.reduce((s, i) => s + i.price * i.quantity, 0) : cartTotalAll;
    // Only the checked-out order leaves the cart.
    const clearCart = () => items.forEach((i) => removeItem(i.id));
    // Server quote — prices, promo and total come from the backend, never the browser.
    const [quote, setQuote] = useState<CartQuote | null>(null);
    const [quoteError, setQuoteError] = useState('');
    // Older backend without /orders/quote: fall back to cart prices (server still records the order).
    const [legacyPricing, setLegacyPricing] = useState(false);
    // One key per checkout attempt: a retried or double-clicked submit returns the same order.
    const idempotencyKey = React.useRef(`co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`);
    const total = quote?.subtotal ?? cartTotal;
    const { user } = useAuth();
    const { currency } = useCurrency();
    const { t } = useLanguage();

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
    // Fixed-EUR coupons: the amount (the server quote decides what is actually taken off).
    const [couponAmountOff, setCouponAmountOff] = useState<number | null>(null);
    const [couponScoped, setCouponScoped] = useState(false);
    const [couponApplied, setCouponApplied] = useState('');
    const [couponError, setCouponError] = useState('');
    const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
    const [isDetectingLocation, setIsDetectingLocation] = useState(false);

    // Fetch rates from Shipping Agent — re-runs when address country/city changes
    const fetchShippingRates = React.useCallback(async (country: string, city: string) => {
        if (!country && !city) return;
        setIsLoadingRates(true);
        try {
            const quantities: Record<string, number> = {};
            items.forEach(i => { quantities[i.id] = i.quantity; });

            const res = await apiFetch('/shipping/agent-rates', {
                method: 'POST',
                body: JSON.stringify({
                    productIds: items.map(i => i.id),
                    quantities,
                    destinationCity: city || 'Unknown',
                    destinationCountry: country || 'Romania',
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setShippingRates(data);
                if (data.length > 0) setSelectedShipping(data[0]);
            }
        } catch (e) {
            // Fallback to legacy endpoint
            try {
                const res = await apiFetch(`/shipping/rates?cartTotal=${total}&destination=${city || 'Romania'}`);
                if (res.ok) {
                    const data = await res.json();
                    setShippingRates(data);
                    if (data.length > 0) setSelectedShipping(data[0]);
                }
            } catch (_) {}
        } finally {
            setIsLoadingRates(false);
        }
    }, [items, total]);

    // Initial fetch on mount with default Romania (EU client)
    React.useEffect(() => {
        fetchShippingRates('Romania', '');
    }, []);

    // Re-fetch rates when user finishes typing the country (debounced)
    const [addrCountry, setAddrCountry] = React.useState<string>(savedAddr.country || '');
    React.useEffect(() => {
        if (!addrCountry) return;
        const timeout = setTimeout(() => fetchShippingRates(addrCountry, addrCity), 800);
        return () => clearTimeout(timeout);
    }, [addrCountry, addrCity]);

    // Delivery destination — checked against the backend delivery policy as soon as it's chosen,
    // and again when the order is placed.
    const [destinations, setDestinations] = useState<{ code: string; name: string; supported: boolean }[]>([]);
    const [destCheck, setDestCheck] = useState<DestinationCheck | null>(null);
    const [destChecking, setDestChecking] = useState(false);
    React.useEffect(() => { listDestinations().then((d) => setDestinations(d.countries)).catch(() => setDestinations([])); }, []);
    React.useEffect(() => {
        if (!addrCountry.trim()) { setDestCheck(null); return; }
        setDestChecking(true);
        const t = setTimeout(() => {
            checkDestination(addrCountry)
                .then(setDestCheck)
                .catch(() => setDestCheck(null)) // the server re-checks on submit either way
                .finally(() => setDestChecking(false));
        }, 250);
        return () => clearTimeout(t);
    }, [addrCountry]);
    const destBlocked = !!destCheck && !destCheck.supported;

    const handleNext = () => {
        if (!addrName.trim()) { alert('Please enter your contact name.'); return; }
        if (!addrStreet.trim()) { alert('Please enter your street address.'); return; }
        if (!addrCity.trim()) { alert('Please enter your city.'); return; }
        if (!addrPostal.trim()) { alert('Please enter your postal code.'); return; }
        if (!addrCountry.trim()) { alert('Please choose your delivery country.'); return; }
        if (destBlocked) return;
        // Persist address so next checkout is pre-filled
        localStorage.setItem(ADDR_KEY, JSON.stringify({
            name: addrName,
            company: addrCompany,
            street: addrStreet,
            city: addrCity,
            postal: addrPostal,
            country: addrCountry,
        }));
        setStep(s => s + 1);
    };
    const handleBack = () => setStep(s => s - 1);

    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) return;
        setCouponError('');
        setIsValidatingCoupon(true);
        try {
            
            const res = await apiFetch(`/coupons/validate/${encodeURIComponent(couponCode.trim())}`);
            const data = await res.json();
            if (!res.ok) { setCouponError(couponReason(data) || 'Invalid coupon'); return; }
            setCouponDiscount(Number(data.discountPercent) || 0);
            setCouponAmountOff(data.discountType === 'FIXED' ? Number(data.amountOff) || 0 : null);
            setCouponScoped(!!data.scope && data.scope !== 'ALL');
            setCouponApplied(data.code);
            setCouponCode('');
        } catch (_e) { setCouponError('Could not validate coupon'); }
        finally { setIsValidatingCoupon(false); }
    };

    const removeCoupon = () => { setCouponDiscount(0); setCouponAmountOff(null); setCouponScoped(false); setCouponApplied(''); setCouponError(''); };
    // The server's refusal reason in the buyer's language (its own message as the fallback).
    const couponReason = (e: any) => {
        const r = e?.reason ?? e?.body?.reason;
        if (!r) return typeof e?.message === 'string' ? e.message : '';
        return t('adminCoupons', `checkoutReason_${r}`, { amount: formatPrice(Number(e?.minOrderAmount ?? e?.body?.minOrderAmount) || 0, currency) }) || e?.message || '';
    };
    // Refused by the quote or the order (expired, used up, nothing eligible…): drop it, say why, price without it.
    const refuseCoupon = (e: any) => { removeCoupon(); setCouponError(couponReason(e)); };

    React.useEffect(() => {
        if (!items.length) return;
        // The destination lets the server price delivery with the same calculation the order uses.
        quoteCart(items, couponApplied || undefined, destCheck?.supported ? destCheck.code || undefined : undefined)
            .then((q) => { setQuote(q); setQuoteError(q.ready ? '' : 'Some cart lines need attention — return to the cart to fix them.'); })
            .catch((e) => { if (e?.code === 'NOT_DEPLOYED') setLegacyPricing(true); else if (e?.code === 'INVALID_COUPON') refuseCoupon(e); else setQuoteError(e?.message || 'Could not price your order.'); });
    }, [items, couponApplied, destCheck?.code, destCheck?.supported]);
    const delivery = quote?.fulfillment ?? null;
    const freight = delivery?.status === 'priced' ? delivery.freightTotal : null;

    const discountAmount = quote ? quote.discount : total * (couponDiscount / 100);
    const grandTotal = quote ? quote.total : total - discountAmount; // Shipping is TBD and handled manually now

    const handlePlaceOrder = async () => {
        if (!items || items.length === 0) {
            alert('Your cart is empty. Please add items before placing an order.');
            return;
        }
        if (destBlocked) { setStep(1); return; }
        if (!legacyPricing && (!quote || !quote.ready)) {
            setQuoteError(quoteError || 'Your order is still being priced.');
            return;
        }
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            // 2FA accounts confirm the order with authenticator + email code (StepUpDialog).
            const res = await withStepUp((stepUp) => apiFetch('/orders', {
                method: 'POST',
                headers: stepUp,
                body: JSON.stringify({
                    // `i.id` for older cart entries IS the productId; for
                    // configurable-product entries it's `${productId}::sig`,
                    // so prefer the explicit `productId` field when present.
                    // selectedVariants + tier ride along so the order item
                    // captures the exact buyer-chosen configuration.
                    // Server reprices every line; prices here are informational only.
                    items: items.map((i) => ({ ...toServerItem(i), price: i.price, name: i.name })),
                    couponCode: couponApplied || undefined,
                    idempotencyKey: idempotencyKey.current,
                    totalAmount: grandTotal,
                    // Preferred carrier only — freight is quoted by Atlantis after the order.
                    shippingCompany: selectedShipping?.name,
                    shippingAddress: {
                        name: addrName,
                        company: addrCompany,
                        street: addrStreet,
                        city: addrCity,
                        postal: addrPostal,
                        country: addrCountry,
                    },
                })
            }));

            if (res.ok) {
                const order = await res.json();
                setCreatedOrderId(order.id);
                clearCart();
                setStep(3);
            } else {
                const err = await res.json().catch(() => ({}));
                if (err?.code === 'DESTINATION_UNSUPPORTED' || err?.code === 'DESTINATION_REQUIRED') {
                    setDestCheck({ supported: false, code: err.country ?? null, name: null, message: err.message });
                    setStep(1);
                } else if (err?.code === 'INVALID_COUPON') {
                    refuseCoupon(err);
                } else if (err?.code === 'PRICE_CHANGED') {
                    // Show the server figures and let the buyer confirm again.
                    const q = await quoteCart(items, couponApplied || undefined).catch(() => null);
                    if (q) setQuote(q);
                    setQuoteError(err.message);
                } else {
                    setQuoteError(typeof err?.message === 'string' ? err.message : 'Failed to place order. Please try again.');
                }
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
                        {[1, 2].map(i => (
                            <div key={i} className="flex items-center">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-500",
                                    step >= i
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                                        : "bg-muted text-muted-foreground"
                                )}>
                                    {i}
                                </div>
                                {i < 2 && (
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

                {step === 3 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-3xl mx-auto bg-card border border-border/50 p-16 rounded-[48px] text-center space-y-8 premium-shadow relative overflow-hidden"
                    >
                        <div className="absolute top-0 start-0 w-full h-2 bg-gradient-to-r from-emerald-500 via-primary to-secondary" />
                        <div className="w-24 h-24 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto text-emerald-500 mb-6">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.2 }}
                            >
                                <CheckCircle2 size={48} />
                            </motion.div>
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-4xl md:text-5xl font-heading font-bold tracking-tight">Order Received!</h2>
                            <p className="text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto font-medium">
                                Thank you for your order. Your reference number is{' '}
                                <span className="text-foreground font-bold">#{createdOrderId?.slice(-8).toUpperCase()}</span>.
                            </p>
                            <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto">
                                A member of our team will be in touch with you shortly to confirm details and arrange fulfillment.
                            </p>
                        </div>
                        <div className="p-5 bg-primary/5 rounded-3xl flex items-start gap-4 border border-primary/10 max-w-md mx-auto">
                            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <p className="text-[13px] text-primary/80 leading-relaxed font-medium text-start">
                                Our Marketplace team will contact you to finalize payment and delivery. Please keep an eye on your email and phone.
                            </p>
                        </div>
                        <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link href="/">
                                <Button size="xl" className="rounded-3xl px-12 font-bold">Continue Shopping</Button>
                            </Link>
                        </div>
                        <div className="absolute bottom-[-10%] end-[-5%] w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
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

                                        <div className="space-y-3 text-start">
                                            <h3 className="text-lg font-bold">Delivery country</h3>
                                            <select aria-label="Delivery country" value={destinations.find((c) => c.name === addrCountry || c.code === addrCountry)?.name ?? ''}
                                                onChange={(e) => setAddrCountry(e.target.value)}
                                                className="w-full h-12 rounded-2xl border border-border bg-background px-4 text-[15px] font-medium">
                                                <option value="">{addrCountry && !destinations.some((c) => c.name === addrCountry) ? addrCountry : 'Choose a country…'}</option>
                                                {destinations.filter((c) => c.supported).length > 0 && (
                                                    <optgroup label="We deliver to">
                                                        {destinations.filter((c) => c.supported).map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
                                                    </optgroup>
                                                )}
                                                <optgroup label="Not currently supported">
                                                    {destinations.filter((c) => !c.supported).map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
                                                </optgroup>
                                            </select>
                                            {destChecking ? <p className="text-xs text-muted-foreground">Checking delivery…</p>
                                                : destBlocked ? (
                                                    <div role="alert" className="p-4 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-500/10 text-[13.5px] text-red-800 dark:text-red-200">
                                                        {destCheck!.message} <Link href="/contact" className="underline font-semibold">Contact us</Link>
                                                    </div>
                                                ) : destCheck?.supported ? <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">✓ We deliver to {destCheck.name}. Freight is quoted after you place the order.</p>
                                                : null}
                                        </div>

                                        <div className="space-y-6 text-start">
                                            <h3 className="text-lg font-bold">Preferred logistics partner <span className="text-sm font-medium text-muted-foreground">(optional)</span></h3>

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
                                                                    ? "border-secondary bg-secondary/10 shadow-md scale-[1.02]"
                                                                    : "border-border hover:border-secondary/50 hover:bg-muted/30"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-6">
                                                                <div className="w-16 h-16 bg-surface rounded-xl border border-border flex items-center justify-center p-2 shadow-sm">
                                                                    <span className="text-[10px] font-bold text-center text-foreground uppercase tracking-tighter leading-tight">
                                                                        {rate.name.split(' ').join('\n')}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <p className="font-heading font-bold text-lg">{rate.name}</p>
                                                                    <p className="text-sm text-muted-foreground font-medium">{rate.serviceType || 'Road Freight'}</p>
                                                                    
                                                                    <AnimatePresence>
                                                                        {selectedShipping?.id === rate.id && (
                                                                            <motion.div 
                                                                                initial={{ opacity: 0, height: 0 }}
                                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                                className="mt-2 pt-2 border-t border-secondary/20"
                                                                            >
                                                                                <p className="text-xs text-muted-foreground">Cost and transit time are confirmed by Atlantis with this carrier after your order{rate.note ? ` · ${rate.note}` : ''}.</p>
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            </div>
                                                            <div className="text-end">
                                                                <p className="font-heading font-bold text-sm text-secondary uppercase tracking-widest">{t('cart', 'tbd')}</p>
                                                                <div className="mt-2 w-6 h-6 rounded-full border-2 border-border mx-auto flex items-center justify-center">
                                                                    {selectedShipping?.id === rate.id && <div className="w-3 h-3 bg-secondary rounded-full animate-in zoom-in" />}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="p-4 bg-muted/30 border border-dashed border-border rounded-2xl flex items-start gap-3">
                                                <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs font-bold text-foreground">Delivery isn’t charged at checkout</p>
                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                        Where Atlantis has a configured rate for your route, the delivery charge is shown on the next step. Otherwise Atlantis quotes it after the order, and nothing is added until you accept that quote.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-border/50">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-lg font-bold">Delivery Address</h3>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={isDetectingLocation}
                                                    onClick={async () => {
                                                        setIsDetectingLocation(true);
                                                        try {
                                                            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                                                                navigator.geolocation.getCurrentPosition(resolve, reject, {
                                                                    enableHighAccuracy: true,
                                                                    timeout: 10000,
                                                                    maximumAge: 0
                                                                });
                                                            });
                                                            const { latitude, longitude } = position.coords;

                                                            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`, {
                                                                headers: {
                                                                    'Accept-Language': 'en-US,en;q=0.9',
                                                                }
                                                            });
                                                            const data = await res.json();

                                                            if (data.address) {
                                                                // Try to be more robust with address mapping
                                                                const street = data.address.road || data.address.street || data.address.suburb || data.address.neighbourhood || '';
                                                                const city = data.address.city || data.address.town || data.address.village || data.address.state || '';
                                                                
                                                                setAddrStreet(street);
                                                                setAddrCity(city);
                                                                setAddrPostal(data.address.postcode || '');
                                                                setAddrCountry(data.address.country || '');
                                                            }
                                                        } catch (err: any) {
                                                            console.error('Location error:', err);
                                                            if (err.code === 1) {
                                                                alert('Location access denied. Please enable location permissions in your browser.');
                                                            } else if (err.code === 3) {
                                                                alert('Location request timed out. Please try again or enter manually.');
                                                            } else {
                                                                alert('Could not detect location. Please enter your address manually.');
                                                            }
                                                        } finally {
                                                            setIsDetectingLocation(false);
                                                        }
                                                    }}
                                                    className="text-xs gap-2"
                                                >
                                                    {isDetectingLocation ? <Loader2 size={12} className="animate-spin" /> : '📍'}
                                                    {isDetectingLocation ? 'Detecting...' : 'Auto-fill from Location'}
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-6">Saved automatically for your next order.</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <Input label="Contact Name" placeholder="Alex Sterling"
                                                    value={addrName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrName(e.target.value)} />
                                                <Input label="Business / Company" placeholder="Sterling Distribution LLC"
                                                    value={addrCompany} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrCompany(e.target.value)} />
                                                <Input label="Street Address" placeholder="Pier 42, Marine Drive" className="md:col-span-2"
                                                    value={addrStreet} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrStreet(e.target.value)} />
                                                <Input label="City" placeholder="Bucharest"
                                                    value={addrCity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrCity(e.target.value)} />
                                                <Input label="Postal Code" placeholder="010000"
                                                    value={addrPostal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddrPostal(e.target.value)} />
                                                <Input label="Country" placeholder="Choose above" readOnly
                                                    value={addrCountry} onChange={() => {}}
                                                    className="md:col-span-2" />
                                            </div>
                                        </div>

                                        <Button onClick={handleNext} size="xl" className="w-full gap-3" disabled={!addrCountry || destBlocked || destChecking}>
                                            {destBlocked ? 'Choose an eligible destination' : 'Continue to review'}
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
                                                    <p className="text-sm font-bold text-foreground shrink-0">{formatPrice(item.price * item.quantity, currency)}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="p-5 bg-muted/20 rounded-2xl border border-border/50 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Deliver to</span>
                                                <span className="font-bold text-end">{[addrCity, destCheck?.name || addrCountry].filter(Boolean).join(', ')}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Preferred carrier</span>
                                                <span className="font-bold">{selectedShipping?.name || 'Atlantis chooses'}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Delivery</span>
                                                {freight != null
                                                    ? <span className="font-bold">{formatPrice(freight, currency)}</span>
                                                    : <span className="font-bold text-secondary uppercase tracking-widest text-xs">{t('cart', 'manualQuote')}</span>}
                                            </div>
                                            <div className="flex justify-between text-base font-bold pt-2 border-t border-border/50">
                                                <span>Order total <span className="text-xs font-medium text-muted-foreground">excl. VAT{freight == null ? ' and delivery' : ''}</span></span>
                                                <span className="text-secondary">{formatPrice(grandTotal + (freight ?? 0), currency)}</span>
                                            </div>
                                        </div>

                                        {delivery && <DeliveryBreakdown quote={delivery} />}

                                        <div className="rounded-2xl ring-1 ring-line p-4 text-[13px] text-ink-2 space-y-1">
                                            <p className="font-semibold text-ink">What happens when you place the order</p>
                                            <p>Placing the order sends a request — nothing is charged. Each supplier confirms availability, quantities and price; Atlantis then approves the order and sends you the confirmed terms and payment details. If anything changes, you’re asked to accept the new terms first. <Link href="/protected-payments" className="text-teal font-medium hover:underline">How it works</Link></p>
                                        </div>

                                        {quoteError && <p role="alert" className="mb-3 text-[13px] text-[#B91C1C]">{quoteError}</p>}
                                        <div className="flex gap-4">
                                            <Button variant="outline" size="xl" onClick={handleBack} className="flex-1" disabled={isProcessing}>
                                                Modify
                                            </Button>
                                            <Button onClick={handlePlaceOrder} size="xl" className="flex-[2]" isLoading={isProcessing}>
                                                Confirm Order
                                                <ArrowRight size={20} />
                                            </Button>
                                        </div>
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
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Promo Code</p>
                                    {couponApplied ? (
                                        <div className="flex items-center justify-between p-3 bg-accent/10 border border-accent/20 rounded-xl">
                                            <div className="flex items-center gap-2">
                                                <Tag size={14} className="text-accent" />
                                                <span className="text-sm font-bold text-accent">{couponApplied}</span>
                                                <span className="text-xs text-accent/80">−{couponAmountOff != null ? formatPrice(couponAmountOff, currency) : `${couponDiscount}%`}</span>
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
                                                className="h-10 px-4 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs rounded-xl border border-primary/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
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
                                        <span className="font-heading font-bold text-base">{formatPrice(total, currency)}</span>
                                    </div>
                                    {couponApplied && discountAmount > 0 && (
                                        <div className="flex justify-between items-center gap-3">
                                            <span className="text-accent font-medium">
                                                {t('adminCoupons', 'checkoutCouponLine', { code: couponApplied })}
                                                {couponScoped && <span className="block text-xs font-normal text-accent/80">{t('adminCoupons', 'checkoutScoped')}</span>}
                                            </span>
                                            <span className="text-accent font-heading font-bold">-{formatPrice(discountAmount, currency)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground font-medium">Logistics Allocation</span>
                                        <span className="font-heading font-bold text-xs text-secondary uppercase tracking-widest">{t('cart', 'tbd')}</span>
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
                                            <p className="font-heading font-bold text-3xl text-primary">{formatPrice(grandTotal, currency)}</p>
                                            {currency !== 'EUR' && (
                                                <p className="text-[12px] text-muted-foreground">
                                                    Charged in EUR: <span className="font-bold text-foreground">{formatEUR(grandTotal)}</span>. {currency} amount is an estimate at today&apos;s rate.
                                                </p>
                                            )}
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
