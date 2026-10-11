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
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

// Codes match locales/index.ts keys AND the auto-translate
// LANGUAGE_NAMES map on the backend. Adding a new entry here is
// enough to make a new language fully usable — the runtime
// translator handles every string on every page.
const LANGUAGES = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'ar', name: 'العربية', flag: '🇪🇬' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'ro', name: 'Română', flag: '🇷🇴' },
    { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
    { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
    { code: 'pl', name: 'Polski', flag: '🇵🇱' },
    { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
];

// Currencies come from lib/currency (single source of truth for live rates).
const CURRENCIES = SUPPORTED_CURRENCIES;

// Primary marketplace navigation (Parallel-style): workflow links first,
// then FMCG departments (lib/departments.ts).
const NAV_PRIMARY = [
    { key: 'new', name: 'New offers', href: '/categories?sort=newest' },
    { key: 'targets', name: 'Targets', href: '/targets' },
    { key: 'requests', name: 'Requests', href: '/requests', badge: 'New' },
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
    const onCatalog = pathname === '/categories';
    const dept = onCatalog ? searchParams.get('dept') : null;
    const category = onCatalog ? searchParams.get('category') : null;
    const sort = onCatalog ? searchParams.get('sort') : null;

    const isPrimaryActive = (key: string) =>
        (key === 'new' && onCatalog && sort === 'newest') ||
        (key === 'targets' && pathname === '/targets') ||
        (key === 'requests' && pathname === '/requests');

    return (
        <nav aria-label="Marketplace" className="h-9 flex items-center overflow-x-auto scrollbar-hide -mx-3">
            {NAV_PRIMARY.map((item) => (
                <Link key={item.key} href={item.href} className={navItemClass(isPrimaryActive(item.key))}>
                    {item.name}
                    {item.badge && (
                        <span className="px-1.5 py-[1px] rounded-full bg-teal-soft text-teal border border-[#B9ECE6] text-[10px] font-bold leading-4">
                            {item.badge}
                        </span>
                    )}
                </Link>
            ))}
            <span className="mx-2 w-px h-5 bg-surface-3 shrink-0" aria-hidden />
            <Link href="/categories" className={navItemClass(onCatalog && !category && !sort && !dept)}>All</Link>
            {DEPARTMENTS.map((d) => (
                <Link key={d.slug} href={`/categories?dept=${d.slug}`} className={navItemClass(dept === d.slug)}>
                    {d.label}
                </Link>
            ))}
            <div className="ms-auto flex items-center h-full ps-4">
                <Link href="/deals" className={cn(navItemClass(pathname === '/deals'), '!text-[#DC2626] hover:!text-[#B91C1C]')}>
                    <Flame size={14} /> Deals
                </Link>
                <Link href="/sponsored-highlights" className={navItemClass(pathname === '/sponsored-highlights')}>
                    Sponsored
                </Link>
            </div>
        </nav>
    );
}

// Country code → flag emoji + label
const COUNTRY_INFO: Record<string, { flag: string; label: string }> = {
    EG: { flag: '🇪🇬', label: 'Egypt' },
    SA: { flag: '🇸🇦', label: 'Saudi Arabia' },
    AE: { flag: '🇦🇪', label: 'UAE' },
    US: { flag: '🇺🇸', label: 'United States' },
    GB: { flag: '🇬🇧', label: 'United Kingdom' },
    DE: { flag: '🇩🇪', label: 'Germany' },
    FR: { flag: '🇫🇷', label: 'France' },
    IT: { flag: '🇮🇹', label: 'Italy' },
    ES: { flag: '🇪🇸', label: 'Spain' },
    TR: { flag: '🇹🇷', label: 'Turkey' },
    CN: { flag: '🇨🇳', label: 'China' },
};

function getCountryDisplay(rawCountry?: string): { flag: string; label: string } {
    if (!rawCountry) return { flag: '🌍', label: '' };
    const upper = rawCountry.toUpperCase();
    if (COUNTRY_INFO[upper]) return COUNTRY_INFO[upper];
    // Fallback if it's already a name
    return { flag: '🌍', label: rawCountry };
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
    const { locale, setLocale, t } = useLanguage();
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
        if (!('geolocation' in navigator)) return fail('Your browser doesn\u2019t support location detection. Enter your address below.');
        if (!window.isSecureContext) return fail('Location detection needs a secure (HTTPS) connection. Enter your address below.');
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
                    if (!formatted) return fail('We found your position but couldn\u2019t match it to an address. Enter it below.');
                    localStorage.setItem('atl_delivery_address', formatted);
                    setSavedAddress(formatted);
                    window.dispatchEvent(new Event('atl:address-changed'));
                    setIsGpsLoading(false);
                    setIsLocationOpen(false);
                    setShowQuickEdit(false);
                } catch {
                    fail('We couldn\u2019t look up an address for your location. Enter it below.');
                }
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) fail('Location permission was denied. Enter your address below, or allow location in your browser settings.');
                else if (err.code === err.TIMEOUT) fail('Locating took too long. Try again or enter your address below.');
                else fail('Your location is unavailable right now. Enter your address below.');
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

    const country = getCountryDisplay(user?.country);
    const displayCity = savedAddress
        ? savedAddress.split(',')[0].trim().slice(0, 18)
        : (user ? 'Set address' : 'Set address');

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
        <header className="bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90 border-b border-line sticky top-0 z-[100] w-full text-start">
            {/* Trust line + How it works / Help / Contact live in the footer — the
                header stays one compact row plus the marketplace nav. */}

            {/* 2. MAIN ROW — logo · search · utilities */}
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="h-14 flex items-center gap-3 sm:gap-4 lg:gap-5">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2.5 shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60 focus-visible:ring-offset-2" aria-label="Atlantis home">
                        <img src="/brand/atlantis-mark.png" alt="" width={32} height={32} className="w-8 h-8 object-contain rounded-lg" />
                        <span className="text-[18px] font-black tracking-tighter uppercase hidden sm:inline">
                            <span className="text-heading">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
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
                                placeholder={t('navbar', 'searchPlaceholder') || 'Search products, brands, suppliers...'}
                                aria-label="Search products"
                                className="flex-1 min-w-0 h-full px-2.5 text-[13px] text-ink outline-none bg-transparent placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden"
                            />
                            <span className="hidden lg:block me-3 text-[12px] text-ink-4 group-focus-within/search:hidden" aria-hidden>Press /</span>
                            <button
                                type="submit"
                                className="me-1 h-7 w-7 sm:w-auto sm:px-3 rounded-md bg-cta hover:bg-cta-hover text-cta-fg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
                                aria-label="Search"
                            >
                                <Search size={15} className="sm:hidden" />
                                <span className="hidden sm:inline">Search</span>
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
                                        Deliver to {country.label && <span className="text-ink-2">{country.flag} {country.label}</span>}
                                    </span>
                                    <span className="text-[12.5px] font-semibold text-ink truncate max-w-[120px]">
                                        {displayCity}
                                    </span>
                                </div>
                            </button>

                            {/* GPS auto-detect */}
                            <button
                                onClick={handleGps}
                                title="Auto-detect my location"
                                aria-label="Auto-detect my location"
                                disabled={isGpsLoading}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-3 hover:text-teal hover:bg-teal-soft transition-colors disabled:opacity-50"
                            >
                                {isGpsLoading ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                            </button>

                            {savedAddress && (
                                <button
                                    onClick={() => { setIsLocationOpen(!isLocationOpen); setShowQuickEdit(false); }}
                                    aria-label="Delivery options"
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
                                        className="absolute top-full right-0 mt-2 w-[300px] bg-surface border border-line rounded-2xl shadow-[0_16px_40px_rgba(15,23,42,0.12)] z-[110] overflow-hidden"
                                    >
                                        <div className="px-4 py-3 border-b border-line bg-surface-2">
                                            <div className="flex items-center gap-2">
                                                <MapPin size={13} className="text-teal" />
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Delivery Location</span>
                                            </div>
                                            <p className="mt-1 text-[13px] text-ink font-semibold truncate">{savedAddress || 'No address set'}</p>
                                        </div>

                                        {gpsError && (
                                            <p role="alert" className="mx-4 mt-3 px-3 py-2 rounded-lg bg-[#FFF7ED] dark:bg-amber-500/15 text-[12px] leading-snug text-[#9A3412]">{gpsError}</p>
                                        )}
                                        {!showQuickEdit ? (
                                            <div className="p-2 space-y-0.5">
                                                <button onClick={handleGps} disabled={isGpsLoading} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-teal-soft text-left transition-colors disabled:opacity-50">
                                                    <span className="w-8 h-8 rounded-full bg-teal-soft flex items-center justify-center shrink-0">
                                                        {isGpsLoading ? <Loader2 size={14} className="text-teal animate-spin" /> : <Navigation size={14} className="text-teal" />}
                                                    </span>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-ink">Use my current location</p>
                                                        <p className="text-[12px] text-ink-3">Auto-detect via GPS</p>
                                                    </div>
                                                </button>
                                                <button onClick={() => { setShowQuickEdit(true); setAddressInput(savedAddress); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 text-left transition-colors">
                                                    <span className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                                                        <Pencil size={14} className="text-ink-3" />
                                                    </span>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-ink">Quick edit</p>
                                                        <p className="text-[12px] text-ink-3">Edit address inline</p>
                                                    </div>
                                                </button>
                                                <button onClick={() => { setIsLocationOpen(false); router.push('/account/address'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 text-left transition-colors">
                                                    <span className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                                                        <ExternalLink size={14} className="text-ink-3" />
                                                    </span>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-ink">Full edit</p>
                                                        <p className="text-[12px] text-ink-3">Street, city, zip & more</p>
                                                    </div>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="p-4 space-y-3">
                                                <p className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">Quick Edit</p>
                                                <input
                                                    type="text"
                                                    value={addressInput}
                                                    onChange={(e) => setAddressInput(e.target.value)}
                                                    placeholder="City, Country"
                                                    className="w-full h-10 px-3 text-[13px] border border-line rounded-lg outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20 transition-all"
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleQuickSave(); if (e.key === 'Escape') setShowQuickEdit(false); }}
                                                    autoFocus
                                                />
                                                <div className="flex gap-2">
                                                    <button onClick={() => setShowQuickEdit(false)} className="flex-1 h-9 text-[13px] font-semibold border border-line text-ink-2 rounded-lg hover:border-[#94A3B8] transition-colors">Cancel</button>
                                                    <button onClick={handleQuickSave} disabled={!addressInput.trim()} className="flex-1 h-9 text-[13px] font-semibold bg-cta hover:bg-cta-hover disabled:bg-[#94A3B8] text-cta-fg rounded-lg transition-colors disabled:cursor-not-allowed">Save</button>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Language + currency — one quiet control, one panel */}
                        <div ref={localeRef} className="relative hidden md:block">
                            <button
                                onClick={() => { setIsLangOpen(!isLangOpen); setIsCurrOpen(false); }}
                                aria-label={`Language and currency: ${locale.toUpperCase()}, ${currency}`}
                                aria-expanded={isLangOpen}
                                className={cn(
                                    'h-9 ps-2.5 pe-2 flex items-center gap-1.5 rounded-xl text-[13px] font-semibold text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60',
                                    isLangOpen ? 'bg-surface-3' : 'hover:bg-surface-3'
                                )}
                            >
                                <Globe size={16} className="text-ink-3" />
                                <span className="uppercase">{locale}</span>
                                <span className="text-ink-4" aria-hidden>·</span>
                                <span>{currency}</span>
                                <ChevronDown size={13} className={cn('text-ink-4 transition-transform', isLangOpen && 'rotate-180')} />
                            </button>
                            <AnimatePresence>
                                {isLangOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 4 }}
                                        className="absolute top-full right-0 mt-2 w-[440px] bg-surface rounded-2xl ring-1 ring-line shadow-[0_24px_60px_rgba(15,23,42,0.14)] p-2 z-[110] grid grid-cols-2 gap-2"
                                    >
                                        <div>
                                            <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Language</p>
                                            <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                                                {LANGUAGES.map((l) => (
                                                    <button
                                                        key={l.code}
                                                        onClick={() => { setLocale(l.code as any); setIsLangOpen(false); }}
                                                        className={cn(
                                                            'w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-lg transition-colors',
                                                            locale === l.code ? 'bg-teal-soft text-teal font-semibold' : 'text-ink-2 hover:bg-surface-2'
                                                        )}
                                                    >
                                                        <span className="flex items-center gap-2"><span>{l.flag}</span>{l.name}</span>
                                                        {locale === l.code && <Check size={14} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="border-s border-[#F1F3F6] ps-2">
                                            <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Currency</p>
                                            <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                                                {CURRENCIES.map((c) => {
                                                    const ok = isAvailable(c.code);
                                                    return (
                                                        <button
                                                            key={c.code}
                                                            disabled={!ok}
                                                            title={ok ? undefined : 'Exchange rate currently unavailable'}
                                                            onClick={() => { setCurrency(c.code); setIsLangOpen(false); }}
                                                            className={cn(
                                                                'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-start disabled:opacity-40 disabled:cursor-not-allowed',
                                                                currency === c.code ? 'bg-teal-soft text-teal' : 'text-ink-2 hover:bg-surface-2'
                                                            )}
                                                        >
                                                            <span className="leading-tight">
                                                                <span className="block text-[13px] font-semibold">{c.code}</span>
                                                                <span className="block text-[11px] opacity-70">{ok ? c.name : 'Rate unavailable'}</span>
                                                            </span>
                                                            <span className="text-[13px] font-semibold">{c.symbol}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="px-3 pt-2 pb-1 text-[11px] leading-snug text-ink-4">
                                                {preferredCurrency !== currency
                                                    ? `${preferredCurrency} rate unavailable — showing EUR. `
                                                    : ''}
                                                {ratesUpdatedAt
                                                    ? `Rates updated ${new Date(ratesUpdatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${ratesSource ?? ''}. Orders are charged in EUR.`
                                                    : 'Live rates loading — prices shown in EUR. Orders are charged in EUR.'}
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
                            <NotificationBell isLight compact />
                        </div>

                        {/* Account — greeting opens the menu (Saved Items lives here now) */}
                        {user ? (
                            <div ref={accountRef} className="relative">
                                <button
                                    onClick={() => setIsAccountOpen((v) => !v)}
                                    aria-haspopup="menu"
                                    aria-expanded={isAccountOpen}
                                    className={cn(
                                        'flex items-center gap-2 h-9 ps-1 pe-1.5 lg:pe-2.5 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60',
                                        isAccountOpen ? 'bg-surface-3' : 'hover:bg-surface-3'
                                    )}
                                >
                                    <Avatar src={user.avatar} name={user.name} />
                                    <span className="hidden lg:inline text-[13px] font-semibold text-ink max-w-[140px] truncate">
                                        Hi, {user?.name?.trim().split(/\s+/)[0] || 'there'}
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
                                            className="absolute top-full right-0 mt-2 w-64 bg-surface rounded-2xl ring-1 ring-line shadow-[0_24px_60px_rgba(15,23,42,0.14)] p-1.5 z-[110]"
                                        >
                                            <div className="flex items-center gap-3 px-3 pt-2.5 pb-3 mb-1 border-b border-[#F1F3F6]">
                                                <Avatar src={user.avatar} name={user.name} size={40} />
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-semibold text-ink truncate">{user.name}</p>
                                                    {user.email && <p className="text-[12px] text-ink-3 truncate">{user.email}</p>}
                                                </div>
                                            </div>
                                            <Link role="menuitem" href={dashboardLink} onClick={() => setIsAccountOpen(false)} className={menuItem}>
                                                <Monitor size={16} className="text-ink-3" /> {isAdmin ? 'Admin Dashboard' : isSupplier ? 'Supplier Dashboard' : 'My Dashboard'}
                                            </Link>
                                            {!isAdmin && !isSupplier && (
                                                <Link role="menuitem" href="/dashboard/customer/orders" onClick={() => setIsAccountOpen(false)} className={menuItem}>
                                                    <Package size={16} className="text-ink-3" /> Orders & Tracking
                                                </Link>
                                            )}
                                            <Link role="menuitem" href="/saved" onClick={() => setIsAccountOpen(false)} className={menuItem}>
                                                <Heart size={16} className="text-ink-3" />
                                                <span className="flex-1">Saved Items</span>
                                                {savedCount > 0 && (
                                                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2 flex items-center justify-center">{savedCount > 99 ? '99+' : savedCount}</span>
                                                )}
                                            </Link>
                                            <Link role="menuitem" href={settingsLink} onClick={() => setIsAccountOpen(false)} className={menuItem}>
                                                <Settings size={16} className="text-ink-3" /> Settings
                                            </Link>
                                            <div className="h-px bg-surface-3 my-1" />
                                            <ThemeSwitch className="px-2 py-1.5" />
                                            <div className="h-px bg-surface-3 my-1" />
                                            <button
                                                role="menuitem"
                                                onClick={() => { setIsAccountOpen(false); logout(); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-red-500/15 text-[13px] font-medium text-[#DC2626] transition-colors"
                                            >
                                                <LogOut size={16} /> Sign out
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
                                <span className="hidden lg:inline text-[13px] font-semibold text-ink">Sign in</span>
                            </Link>
                        )}

                        {/* Cart */}
                        <Link
                            href="/cart"
                            className="relative flex items-center gap-2 h-9 px-3 lg:ps-3 lg:pe-3.5 rounded-xl hover:bg-surface-3 lg:bg-cta lg:hover:bg-cta-hover lg:text-cta-fg text-ink transition-colors no-underline outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60 focus-visible:ring-offset-2"
                            aria-label={`Cart, ${items.length} items`}
                        >
                            <span className="relative">
                                <ShoppingCart size={20} />
                                {items.length > 0 && (
                                    <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 bg-[#2EC4B6] text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white lg:ring-ink">
                                        {items.length > 99 ? '99+' : items.length}
                                    </span>
                                )}
                            </span>
                            <span className="hidden lg:inline text-[13px] font-semibold ms-1">Cart</span>
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
