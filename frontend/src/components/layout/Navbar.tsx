'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    Search,
    ChevronDown,
    User,
    Globe,
    ShoppingCart,
    Monitor,
    Package,
    LogOut,
    MapPin,
    Heart,
    Settings,
    Navigation,
    Pencil,
    ExternalLink,
    Loader2,
    Flame,
    Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import { useCart } from '@/lib/cart';
import { ThemeSwitch } from '@/components/ui/ThemeSwitch';
import NotificationBell from '@/components/ui/NotificationBell';
import { DEPARTMENTS } from '@/lib/departments';
import { LOCALES, LOCALE_META } from '@/locales/config';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

// The supported languages (locales/config.ts) — each has a complete dictionary.
const LANGUAGES = LOCALES.map((code) => LOCALE_META[code]);

// Currencies come from lib/currency (single source of truth for live rates).
const CURRENCIES = SUPPORTED_CURRENCIES;

// Primary marketplace navigation (Parallel-style): workflow links first,
// then FMCG departments (lib/departments.ts).
const NAV_PRIMARY = [
    { key: 'new', name: 'newOffers', href: '/categories?sort=newest' },
    { key: 'targets', name: 'targets', href: '/targets' },
    { key: 'requests', name: 'requests', href: '/requests', badge: true },
];

const navItemClass = (active: boolean) => cn(
    'relative h-full flex items-center gap-1.5 px-2.5 text-[13px] whitespace-nowrap transition-colors no-underline',
    'after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[2px] after:rounded-full after:transition-colors',
    active
        ? 'text-ink font-semibold after:bg-cta'
        : 'text-ink-2 font-medium hover:text-ink after:bg-transparent'
);

/** Secondary nav row. Isolated so useSearchParams sits behind Suspense. */
function MarketNav() {
    const pathname = usePathname() || '/';
    const searchParams = useSearchParams();
    const { t } = useLanguage();
    const onCatalog = pathname === '/categories';
    const dept = onCatalog ? searchParams.get('dept') : null;
    const category = onCatalog ? searchParams.get('category') : null;
    const sort = onCatalog ? searchParams.get('sort') : null;

    const isPrimaryActive = (key: string) =>
        (key === 'new' && onCatalog && sort === 'newest') ||
        (key === 'targets' && pathname === '/targets') ||
        (key === 'requests' && pathname === '/requests');

    return (
        <nav aria-label={t('nav', 'marketplaceAria')} className="h-9 flex items-center overflow-x-auto scrollbar-hide -mx-3">
            {NAV_PRIMARY.map((item) => (
                <Link key={item.key} href={item.href} className={navItemClass(isPrimaryActive(item.key))}>
                    {t('nav', item.name)}
                    {item.badge && (
                        <span className="px-1.5 py-[1px] rounded-full bg-teal-soft text-teal border border-[#B9ECE6] text-[10px] font-bold leading-4">
                            {t('nav', 'badgeNew')}
                        </span>
                    )}
                </Link>
            ))}
            <span className="mx-2 w-px h-5 bg-surface-3 shrink-0" aria-hidden />
            <Link href="/categories" className={navItemClass(onCatalog && !category && !sort && !dept)}>{t('nav', 'all')}</Link>
            {DEPARTMENTS.map((d) => (
                <Link key={d.slug} href={`/categories?dept=${d.slug}`} className={navItemClass(dept === d.slug)}>
                    {t('departments', d.slug) || d.label}
                </Link>
            ))}
            <div className="ms-auto flex items-center h-full ps-4">
                <Link href="/deals" className={cn(navItemClass(pathname === '/deals'), '!text-[#DC2626] hover:!text-[#B91C1C]')}>
                    <Flame size={14} /> {t('nav', 'deals')}
                </Link>
                <Link href="/sponsored-highlights" className={navItemClass(pathname === '/sponsored-highlights')}>
                    {t('nav', 'sponsored')}
                </Link>
            </div>
        </nav>
    );
}

/** Country code → flag emoji + the country's name in the interface language. */
function getCountryDisplay(rawCountry: string | undefined, intl: string): { flag: string; label: string } {
    if (!rawCountry) return { flag: '🌍', label: '' };
    const upper = rawCountry.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(upper)) {
        const flag = String.fromCodePoint(0x1f1e6 + upper.charCodeAt(0) - 65, 0x1f1e6 + upper.charCodeAt(1) - 65);
        let label = upper;
        try { label = new Intl.DisplayNames([intl], { type: 'region' }).of(upper) || upper; } catch { /* keep code */ }
        return { flag, label };
    }
    // Already a name (older accounts)
    return { flag: '🌍', label: rawCountry };
}

/** Currency name in the interface language, e.g. "euro" / "يورو". */
function currencyName(code: string, intl: string, fallback: string) {
    try { return new Intl.DisplayNames([intl], { type: 'currency' }).of(code) || fallback; } catch { return fallback; }
}

/** Circular avatar: uploaded photo, else initials, else a neutral person glyph. */
function Avatar({ src, name, size = 32 }: { src?: string | null; name?: string | null; size?: number }) {
    const [broken, setBroken] = React.useState(false);
    const initials = (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
    return (
        <span
            className="rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-teal-soft text-teal ring-1 ring-line"
            style={{ width: size, height: size }}
        >
            {src && !broken ? (
                <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-full h-full object-cover" />
            ) : initials ? (
                <span className="font-semibold" style={{ fontSize: Math.round(size * 0.38) }}>{initials}</span>
            ) : (
                <User size={Math.round(size * 0.5)} className="text-ink-2" />
            )}
        </span>
    );
}

export default function Navbar() {
    const { user, logout } = useAuth();
    const { items } = useCart();
    const { locale, setLocale, t, meta, fmt } = useLanguage();
    const { currency, preferredCurrency, setCurrency, isAvailable, ratesUpdatedAt, ratesSource } = useCurrency();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isLangOpen, setIsLangOpen] = React.useState(false);
    const [isCurrOpen, setIsCurrOpen] = React.useState(false);
    const [isCatMenuOpen, setIsCatMenuOpen] = React.useState(false);
    const [isLocationOpen, setIsLocationOpen] = React.useState(false);
    const [savedAddress, setSavedAddress] = React.useState<string>('');
    const [savedCount, setSavedCount] = React.useState<number>(0);
    const [showQuickEdit, setShowQuickEdit] = React.useState(false);
    const [addressInput, setAddressInput] = React.useState('');
    const [isGpsLoading, setIsGpsLoading] = React.useState(false);
    const locationRef = React.useRef<HTMLDivElement>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const localeRef = React.useRef<HTMLDivElement>(null);
    const accountRef = React.useRef<HTMLDivElement>(null);
    const [isAccountOpen, setIsAccountOpen] = React.useState(false);

    // "/" focuses search (as on Parallel) unless the user is already typing.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setIsAccountOpen(false); setIsLangOpen(false); setIsLocationOpen(false); return; }
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            const el = e.target as HTMLElement;
            if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
            e.preventDefault();
            searchInputRef.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    React.useEffect(() => {
        try {
            const stored = localStorage.getItem('atl_delivery_address') || '';
            setSavedAddress(stored);
            const saved = JSON.parse(localStorage.getItem('atl_saved_items') || '[]');
            setSavedCount(Array.isArray(saved) ? saved.length : 0);
        } catch { /* noop */ }

        const handleSavedChange = () => {
            try {
                const saved = JSON.parse(localStorage.getItem('atl_saved_items') || '[]');
                setSavedCount(Array.isArray(saved) ? saved.length : 0);
            } catch { /* noop */ }
        };
        // Also re-read address when it changes (e.g. from address page)
        const handleAddressChange = () => {
            try {
                const stored = localStorage.getItem('atl_delivery_address') || '';
                setSavedAddress(stored);
            } catch { /* noop */ }
        };
        window.addEventListener('atl:saved-changed', handleSavedChange);
        window.addEventListener('atl:address-changed', handleAddressChange);
        window.addEventListener('storage', handleSavedChange);
        return () => {
            window.removeEventListener('atl:saved-changed', handleSavedChange);
            window.removeEventListener('atl:address-changed', handleAddressChange);
            window.removeEventListener('storage', handleSavedChange);
        };
    }, []);

    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
                setIsLocationOpen(false);
                setShowQuickEdit(false);
            }
            if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
                setIsAccountOpen(false);
            }
            if (localeRef.current && !localeRef.current.contains(e.target as Node)) {
                setIsLangOpen(false);
                setIsCurrOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            window.location.href = `/categories?q=${encodeURIComponent(searchQuery)}`;
        }
    };

    /**
     * "Use my current location": asks the browser for permission, reads the
     * coordinates, then reverse-geocodes them (OpenStreetMap Nominatim).
     * Only a successfully resolved address is saved — on denial or failure
     * we say so and open manual entry instead of pretending.
     */
    const [gpsError, setGpsError] = React.useState<string | null>(null);
    const handleGps = (e: React.MouseEvent) => {
        e.stopPropagation();
        setGpsError(null);
        const fail = (msg: string) => {
            setIsGpsLoading(false);
            setGpsError(msg);
            setIsLocationOpen(true);
            setShowQuickEdit(true);
            setAddressInput(savedAddress);
        };
        if (!('geolocation' in navigator)) return fail(t('nav', 'gpsUnsupported'));
        if (!window.isSecureContext) return fail(t('nav', 'gpsInsecure'));
        setIsGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude: lat, longitude: lon } = pos.coords;
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&zoom=14`,
                        { headers: { 'Accept-Language': locale || 'en' } }
                    );
                    if (!res.ok) throw new Error('reverse geocode failed');
                    const data = await res.json();
                    const a = data.address || {};
                    const city = a.city || a.town || a.village || a.municipality || a.county || '';
                    const formatted = [city, a.state || a.region || '', a.country || ''].filter(Boolean).join(', ');
                    if (!formatted) return fail(t('nav', 'gpsNoMatch'));
                    localStorage.setItem('atl_delivery_address', formatted);
                    setSavedAddress(formatted);
                    window.dispatchEvent(new Event('atl:address-changed'));
                    setIsGpsLoading(false);
                    setIsLocationOpen(false);
                    setShowQuickEdit(false);
                } catch {
                    fail(t('nav', 'gpsLookupFailed'));
                }
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) fail(t('nav', 'gpsDenied'));
                else if (err.code === err.TIMEOUT) fail(t('nav', 'gpsTimeout'));
                else fail(t('nav', 'gpsUnavailable'));
            },
            { timeout: 10000, maximumAge: 300000 }
        );
    };

    /** Click the delivery pill — navigate to address page (or login) */
    const handleDeliverClick = () => {
        setIsLocationOpen(false);
        if (!user) {
            router.push('/auth/login?redirect=/account/address');
        } else {
            router.push('/account/address');
        }
    };

    /** Save inline quick-edit address */
    const handleQuickSave = () => {
        const value = addressInput.trim();
        setGpsError(null);
        if (!value) return;
        try {
            localStorage.setItem('atl_delivery_address', value);
            setSavedAddress(value);
            window.dispatchEvent(new Event('atl:address-changed'));
            setShowQuickEdit(false);
            setIsLocationOpen(false);
            setAddressInput('');
        } catch { /* noop */ }
    };

    const country = getCountryDisplay(user?.country, meta.intl);
    const displayCity = savedAddress
        ? savedAddress.split(',')[0].trim().slice(0, 18)
        : t('nav', 'setAddress');

    let dashboardLink = '/auth/login';
    let settingsLink = '/dashboard/customer/settings';
    const role = user?.role?.toUpperCase() || '';
    const isAdmin = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(role);
    const isSupplier = role === 'SUPPLIER';
    if (user) {
        if (isAdmin) { dashboardLink = '/admin'; settingsLink = '/admin/settings'; }
        else if (isSupplier) { dashboardLink = '/supplier'; settingsLink = '/supplier/settings'; }
        else dashboardLink = '/dashboard/customer';
    }

    const iconBtn = 'relative h-9 w-9 flex items-center justify-center rounded-lg text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60';
    const menuItem = 'flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 text-[13px] font-medium text-ink-2 hover:text-ink transition-colors no-underline';

    return (
        <header data-no-translate className="bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90 border-b border-line sticky top-0 z-[100] w-full text-start">
            {/* Trust line + How it works / Help / Contact live in the footer — the
                header stays one compact row plus the marketplace nav. */}

            {/* 2. MAIN ROW — logo · search · utilities */}
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="h-14 flex items-center gap-3 sm:gap-4 lg:gap-5">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2.5 shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60 focus-visible:ring-offset-2" aria-label={t('nav', 'homeAria')}>
                        <img src="/brand/atlantis-mark.png" alt="" width={32} height={32} className="w-8 h-8 object-contain rounded-lg" />
                        <span dir="ltr" className="text-[18px] font-black tracking-tighter uppercase hidden sm:inline">
                            <span className="text-heading">ALI</span><span className="ms-[0.3em] text-[#2EC4B6]">FMCG.</span>
                        </span>
                    </Link>

                    {/* Search */}
                    <form onSubmit={handleSearch} role="search" className="flex-1 min-w-0 max-w-[720px]">
                        <div className="group/search flex items-center w-full h-9 rounded-lg bg-surface ring-1 ring-line hover:ring-line-strong focus-within:ring-0 focus-within:shadow-[0_0_0_2px_#2EC4B6,0_8px_24px_rgba(46,196,182,0.12)] transition-all">
                            <Search size={18} className="ms-3.5 shrink-0 text-ink-3" aria-hidden />
                            <input
                                ref={searchInputRef}
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('nav', 'searchPlaceholder')}
                                aria-label={t('nav', 'searchAria')}
                                className="flex-1 min-w-0 h-full px-2.5 text-[13px] text-ink outline-none bg-transparent placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden"
                            />
                            <span className="hidden xl:block me-3 text-[12px] text-ink-4 whitespace-nowrap group-focus-within/search:hidden" aria-hidden>{t('nav', 'pressSlash')}</span>
                            <button
                                type="submit"
                                className="me-1 h-7 w-7 sm:w-auto sm:px-3 rounded-md bg-cta hover:bg-cta-hover text-cta-fg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
                                aria-label={t('nav', 'search')}
                            >
                                <Search size={15} className="sm:hidden" />
                                <span className="hidden sm:inline">{t('nav', 'search')}</span>
                            </button>
                        </div>
                    </form>

                    {/* Right cluster */}
                    <div className="flex items-center gap-1 lg:gap-1.5 shrink-0 ms-auto">
                        {/* DELIVER TO — GPS-enabled location pill */}
                        <div ref={locationRef} className="hidden xl:flex relative items-center me-1">
                            <button
                                onClick={handleDeliverClick}
                                className="flex items-center gap-2 h-9 ps-2 pe-1 hover:bg-surface-3 rounded-xl transition-colors group outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60"
                            >
                                <MapPin size={17} className="text-ink-3 group-hover:text-teal transition-colors shrink-0" />
                                <div className="flex flex-col leading-[1.15] items-start min-w-0">
                                    <span className="text-[11px] text-ink-3 whitespace-nowrap">
                                        {t('nav', 'deliverTo')} {country.label && <span className="text-ink-2">{country.flag} {country.label}</span>}
                                    </span>
                                    <span className="text-[12.5px] font-semibold text-ink truncate max-w-[120px]">
                                        {displayCity}
                                    </span>
                                </div>
                            </button>

                            {/* GPS auto-detect */}
                            <button
                                onClick={handleGps}
                                title={t('nav', 'autoDetect')}
                                aria-label={t('nav', 'autoDetect')}
                                disabled={isGpsLoading}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-3 hover:text-teal hover:bg-teal-soft transition-colors disabled:opacity-50"
                            >
                                {isGpsLoading ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                            </button>

                            {savedAddress && (
                                <button
                                    onClick={() => { setIsLocationOpen(!isLocationOpen); setShowQuickEdit(false); }}
                                    aria-label={t('nav', 'deliveryOptions')}
                                    className="w-6 h-8 flex items-center justify-center text-ink-4 hover:text-ink transition-colors"
                                >
                                    <ChevronDown size={13} className={cn('transition-transform', isLocationOpen && 'rotate-180')} />
                                </button>
                            )}

                            <AnimatePresence>
                                {isLocationOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 4 }}
                                        className="absolute top-full end-0 mt-2 w-[300px] bg-surface border border-line rounded-2xl shadow-[0_16px_40px_rgba(15,23,42,0.12)] z-[110] overflow-hidden"
                                    >
                                        <div className="px-4 py-3 border-b border-line bg-surface-2">
                                            <div className="flex items-center gap-2">
                                                <MapPin size={13} className="text-teal" />
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{t('nav', 'deliveryLocation')}</span>
                                            </div>
                                            <p className="mt-1 text-[13px] text-ink font-semibold truncate">{savedAddress || t('nav', 'noAddress')}</p>
                                        </div>

                                        {gpsError && (
                                            <p role="alert" className="mx-4 mt-3 px-3 py-2 rounded-lg bg-[#FFF7ED] dark:bg-amber-500/15 text-[12px] leading-snug text-[#9A3412]">{gpsError}</p>
                                        )}
                                        {!showQuickEdit ? (
                                            <div className="p-2 space-y-0.5">
                                                <button onClick={handleGps} disabled={isGpsLoading} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-teal-soft text-start transition-colors disabled:opacity-50">
                                                    <span className="w-8 h-8 rounded-full bg-teal-soft flex items-center justify-center shrink-0">
                                                        {isGpsLoading ? <Loader2 size={14} className="text-teal animate-spin" /> : <Navigation size={14} className="text-teal" />}
                                                    </span>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-ink">{t('nav', 'useLocation')}</p>
                                                        <p className="text-[12px] text-ink-3">{t('nav', 'useLocationHint')}</p>
                                                    </div>
                                                </button>
                                                <button onClick={() => { setShowQuickEdit(true); setAddressInput(savedAddress); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 text-start transition-colors">
                                                    <span className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                                                        <Pencil size={14} className="text-ink-3" />
                                                    </span>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-ink">{t('nav', 'quickEdit')}</p>
                                                        <p className="text-[12px] text-ink-3">{t('nav', 'quickEditHint')}</p>
                                                    </div>
                                                </button>
                                                <button onClick={() => { setIsLocationOpen(false); router.push('/account/address'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 text-start transition-colors">
                                                    <span className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                                                        <ExternalLink size={14} className="text-ink-3" />
                                                    </span>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-ink">{t('nav', 'fullEdit')}</p>
                                                        <p className="text-[12px] text-ink-3">{t('nav', 'fullEditHint')}</p>
                                                    </div>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="p-4 space-y-3">
                                                <p className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">{t('nav', 'quickEdit')}</p>
                                                <input
                                                    type="text"
                                                    value={addressInput}
                                                    onChange={(e) => setAddressInput(e.target.value)}
                                                    placeholder={t('nav', 'cityCountry')}
                                                    className="w-full h-10 px-3 text-[13px] border border-line rounded-lg outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20 transition-all"
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleQuickSave(); if (e.key === 'Escape') setShowQuickEdit(false); }}
                                                    autoFocus
                                                />
                                                <div className="flex gap-2">
                                                    <button onClick={() => setShowQuickEdit(false)} className="flex-1 h-9 text-[13px] font-semibold border border-line text-ink-2 rounded-lg hover:border-[#94A3B8] transition-colors">{t('nav', 'cancel')}</button>
                                                    <button onClick={handleQuickSave} disabled={!addressInput.trim()} className="flex-1 h-9 text-[13px] font-semibold bg-cta hover:bg-cta-hover disabled:bg-[#94A3B8] text-cta-fg rounded-lg transition-colors disabled:cursor-not-allowed">{t('nav', 'save')}</button>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Language + currency — one quiet control, one panel */}
                        <div ref={localeRef} className="relative">
                            <button
                                onClick={() => { setIsLangOpen(!isLangOpen); setIsCurrOpen(false); }}
                                aria-label={t('nav', 'localeAria', { language: meta.name, currency })}
                                aria-expanded={isLangOpen}
                                className={cn(
                                    'h-9 ps-2.5 pe-2 flex items-center gap-1.5 rounded-xl text-[13px] font-semibold text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60',
                                    isLangOpen ? 'bg-surface-3' : 'hover:bg-surface-3'
                                )}
                            >
                                <Globe size={16} className="text-ink-3" />
                                <span className="uppercase">{meta.short}</span>
                                <span className="hidden md:inline text-ink-4" aria-hidden>·</span>
                                <span className="hidden md:inline">{currency}</span>
                                <ChevronDown size={13} className={cn('hidden md:block text-ink-4 transition-transform', isLangOpen && 'rotate-180')} />
                            </button>
                            {/* Closes instantly (no exit fade) so the old language never lingers after a switch. */}
                            <AnimatePresence initial={false}>
                                {isLangOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="fixed md:absolute inset-x-3 md:inset-x-auto top-[60px] md:top-full md:end-0 md:mt-2 md:w-[440px] bg-surface rounded-2xl ring-1 ring-line shadow-[0_24px_60px_rgba(15,23,42,0.14)] p-2 z-[110] grid grid-cols-2 gap-2"
                                    >
                                        <div>
                                            <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t('nav', 'language')}</p>
                                            <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                                                {LANGUAGES.map((l) => (
                                                    <button
                                                        key={l.code}
                                                        lang={l.code}
                                                        aria-current={locale === l.code ? 'true' : undefined}
                                                        onClick={() => { setLocale(l.code); setIsLangOpen(false); }}
                                                        className={cn(
                                                            'w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-lg transition-colors',
                                                            locale === l.code ? 'bg-teal-soft text-teal font-semibold' : 'text-ink-2 hover:bg-surface-2'
                                                        )}
                                                    >
                                                        <span className="text-start">{l.name}</span>
                                                        {locale === l.code && <Check size={14} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="border-s border-[#F1F3F6] ps-2">
                                            <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t('nav', 'currency')}</p>
                                            <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                                                {CURRENCIES.map((c) => {
                                                    const ok = isAvailable(c.code);
                                                    return (
                                                        <button
                                                            key={c.code}
                                                            disabled={!ok}
                                                            title={ok ? undefined : t('nav', 'rateUnavailableTitle')}
                                                            onClick={() => { setCurrency(c.code); setIsLangOpen(false); }}
                                                            className={cn(
                                                                'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-start disabled:opacity-40 disabled:cursor-not-allowed',
                                                                currency === c.code ? 'bg-teal-soft text-teal' : 'text-ink-2 hover:bg-surface-2'
                                                            )}
                                                        >
                                                            <span className="leading-tight">
                                                                <span className="block text-[13px] font-semibold">{c.code}</span>
                                                                <span className="block text-[11px] opacity-70">{ok ? currencyName(c.code, meta.intl, c.name) : t('nav', 'rateUnavailable')}</span>
                                                            </span>
                                                            <span className="text-[13px] font-semibold">{c.symbol}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="px-3 pt-2 pb-1 text-[11px] leading-snug text-ink-4">
                                                {preferredCurrency !== currency
                                                    ? `${t('nav', 'preferredUnavailable', { currency: preferredCurrency })} `
                                                    : ''}
                                                {ratesUpdatedAt
                                                    ? t('nav', 'ratesUpdated', { date: fmt.date(ratesUpdatedAt, { day: 'numeric', month: 'short' }), source: ratesSource ?? '' })
                                                    : t('nav', 'ratesLoading')}
                                            </p>
                                            {/* Signed-out visitors have no account menu — theme lives here too. */}
                                            {!user && <ThemeSwitch className="px-2 pt-2 mt-1 border-t border-line" />}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Alerts */}
                        <div className="hidden md:block">
                            <NotificationBell />
                        </div>

                        {/* Account — greeting opens the menu (Saved Items lives here now) */}
                        {user ? (
                            <div ref={accountRef} className="relative">
                                <button
                                    onClick={() => setIsAccountOpen((v) => !v)}
                                    aria-haspopup="menu"
                                    aria-label={t('nav', 'accountMenu')}
                                    aria-expanded={isAccountOpen}
                                    className={cn(
                                        'flex items-center gap-2 h-9 ps-1 pe-1.5 lg:pe-2.5 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60',
                                        isAccountOpen ? 'bg-surface-3' : 'hover:bg-surface-3'
                                    )}
                                >
                                    <Avatar src={user.avatar} name={user.name} />
                                    <span className="hidden lg:inline text-[13px] font-semibold text-ink max-w-[140px] truncate">
                                        {user?.name?.trim() ? t('nav', 'greeting', { name: user.name.trim().split(/\s+/)[0] }) : t('nav', 'greetingFallback')}
                                    </span>
                                    <ChevronDown size={14} className={cn('hidden lg:block text-ink-4 transition-transform', isAccountOpen && 'rotate-180')} />
                                </button>

                                <AnimatePresence>
                                    {isAccountOpen && (
                                        <motion.div
                                            role="menu"
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 4 }}
                                            transition={{ duration: 0.12 }}
                                            className="absolute top-full end-0 mt-2 w-64 bg-surface rounded-2xl ring-1 ring-line shadow-[0_24px_60px_rgba(15,23,42,0.14)] p-1.5 z-[110]"
                                        >
                                            <div className="flex items-center gap-3 px-3 pt-2.5 pb-3 mb-1 border-b border-[#F1F3F6]">
                                                <Avatar src={user.avatar} name={user.name} size={40} />
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-semibold text-ink truncate">{user.name}</p>
                                                    {user.email && <p className="text-[12px] text-ink-3 truncate">{user.email}</p>}
                                                </div>
                                            </div>
                                            <Link role="menuitem" href={dashboardLink} onClick={() => setIsAccountOpen(false)} className={menuItem}>
                                                <Monitor size={16} className="text-ink-3" /> {isAdmin ? t('nav', 'adminDashboard') : isSupplier ? t('nav', 'supplierDashboard') : t('nav', 'myDashboard')}
                                            </Link>
                                            {!isAdmin && !isSupplier && (
                                                <Link role="menuitem" href="/dashboard/customer/orders" onClick={() => setIsAccountOpen(false)} className={menuItem}>
                                                    <Package size={16} className="text-ink-3" /> {t('nav', 'ordersTracking')}
                                                </Link>
                                            )}
                                            <Link role="menuitem" href="/wishlist" onClick={() => setIsAccountOpen(false)} className={menuItem}>
                                                <Heart size={16} className="text-ink-3" />
                                                <span className="flex-1">{t('nav', 'savedItems')}</span>
                                                {savedCount > 0 && (
                                                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2 flex items-center justify-center">{savedCount > 99 ? '99+' : savedCount}</span>
                                                )}
                                            </Link>
                                            <Link role="menuitem" href={settingsLink} onClick={() => setIsAccountOpen(false)} className={menuItem}>
                                                <Settings size={16} className="text-ink-3" /> {t('nav', 'settings')}
                                            </Link>
                                            <div className="h-px bg-surface-3 my-1" />
                                            <ThemeSwitch className="px-2 py-1.5" />
                                            <div className="h-px bg-surface-3 my-1" />
                                            <button
                                                role="menuitem"
                                                onClick={() => { setIsAccountOpen(false); logout(); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-red-500/15 text-[13px] font-medium text-[#DC2626] transition-colors"
                                            >
                                                <LogOut size={16} /> {t('nav', 'signOut')}
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <Link
                                href="/auth/login"
                                className="flex items-center gap-2 h-9 ps-1 pe-1 lg:pe-3 rounded-lg hover:bg-surface-3 transition-colors no-underline outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60"
                            >
                                <Avatar />
                                <span className="hidden lg:inline text-[13px] font-semibold text-ink">{t('nav', 'signIn')}</span>
                            </Link>
                        )}

                        {/* Cart */}
                        <Link
                            href="/cart"
                            className="relative flex items-center gap-2 h-9 px-3 lg:ps-3 lg:pe-3.5 rounded-xl hover:bg-surface-3 lg:bg-cta lg:hover:bg-cta-hover lg:text-cta-fg text-ink transition-colors no-underline outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60 focus-visible:ring-offset-2"
                            aria-label={t('nav', 'cartAria', { count: items.length })}
                        >
                            <span className="relative">
                                <ShoppingCart size={20} />
                                {items.length > 0 && (
                                    <span className="absolute -top-2 -end-2.5 min-w-[18px] h-[18px] px-1 bg-[#2EC4B6] text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white lg:ring-ink">
                                        {items.length > 99 ? '99+' : items.length}
                                    </span>
                                )}
                            </span>
                            <span className="hidden lg:inline text-[13px] font-semibold ms-1">{t('nav', 'cart')}</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* 3. MARKETPLACE NAV — New offers · Targets · Requests | All · departments */}
            <div className="border-t border-[#F1F3F6]">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                    <React.Suspense fallback={<div className="h-10" />}>
                        <MarketNav />
                    </React.Suspense>
                </div>
            </div>
        </header>
    );
}
