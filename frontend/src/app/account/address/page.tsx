'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
    MapPin,
    Navigation,
    Loader2,
    CheckCircle2,
    ArrowLeft,
    Home,
    Building2,
    Globe,
    Hash,
    Map,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';

interface AddressForm {
    street: string;
    building: string;
    city: string;
    state: string;
    zip: string;
    country: string;
}

const EMPTY: AddressForm = {
    street: '',
    building: '',
    city: '',
    state: '',
    zip: '',
    country: '',
};

function parseStored(raw: string): AddressForm {
    // Try JSON first (new format)
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'city' in parsed) return { ...EMPTY, ...parsed };
    } catch { /* noop */ }
    // Legacy plain string: "Cairo, Egypt"
    const parts = raw.split(',').map(s => s.trim());
    return { ...EMPTY, city: parts[0] || '', country: parts[1] || '' };
}

function formatForDisplay(form: AddressForm): string {
    return [form.street, form.building, form.city, form.state, form.zip, form.country]
        .filter(Boolean)
        .join(', ');
}

export default function AddressPage() {
    const { user, isLoggedIn, isAuthReady } = useAuth();
    const router = useRouter();
    const [form, setForm] = React.useState<AddressForm>(EMPTY);
    const [isGpsLoading, setIsGpsLoading] = React.useState(false);
    const [isSaved, setIsSaved] = React.useState(false);

    // Redirect if not logged in (after auth hydrates)
    React.useEffect(() => {
        if (!isAuthReady) return;
        if (!isLoggedIn) {
            router.push('/auth/login?redirect=/account/address');
        }
    }, [isAuthReady, isLoggedIn, router]);

    // Load existing address from localStorage
    React.useEffect(() => {
        try {
            const stored = localStorage.getItem('atl_delivery_address') || '';
            if (stored) setForm(parseStored(stored));
        } catch { /* noop */ }
    }, []);

    const set = (key: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value }));

    /** GPS auto-detect using browser geolocation + Nominatim */
    const handleGps = async () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser');
            return;
        }
        setIsGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude: lat, longitude: lon } = pos.coords;
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
                        { headers: { 'Accept-Language': 'en' } }
                    );
                    const data = await res.json();
                    const a = data.address || {};
                    setForm(prev => ({
                        ...prev,
                        street: a.road || a.pedestrian || a.footway || prev.street,
                        city: a.city || a.town || a.village || a.county || prev.city,
                        state: a.state || a.region || prev.state,
                        zip: a.postcode || prev.zip,
                        country: a.country || prev.country,
                    }));
                    toast.success('Location detected! Review and save.');
                } catch {
                    toast.error('Could not fetch address details. Please fill in manually.');
                }
                setIsGpsLoading(false);
            },
            (err) => {
                setIsGpsLoading(false);
                if (err.code === 1) toast.error('Location access denied. Please allow location access in your browser.');
                else toast.error('Could not detect location. Please fill in manually.');
            },
            { timeout: 10000 }
        );
    };

    const handleSave = () => {
        if (!form.city.trim()) {
            toast.error('City is required');
            return;
        }
        try {
            const formatted = formatForDisplay(form);
            localStorage.setItem('atl_delivery_address', JSON.stringify(form));
            // Also store formatted string for display in navbar
            localStorage.setItem('atl_delivery_address', formatted);
            window.dispatchEvent(new Event('atl:address-changed'));
            setIsSaved(true);
            toast.success('Address saved!');
            setTimeout(() => router.back(), 1200);
        } catch {
            toast.error('Failed to save address');
        }
    };

    if (!isAuthReady || !isLoggedIn) {
        return (
            <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#2EC4B6] animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            {/* Page header */}
            <div className="bg-white border-b border-[#E5E7EB] px-4 sm:px-8 py-4 flex items-center gap-3">
                <button
                    onClick={() => router.back()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F1F5F9] transition-colors text-[#64748B] hover:text-[#0F172A]"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-[17px] font-black text-[#0F172A]">Delivery Address</h1>
                    <p className="text-[12px] text-[#64748B]">
                        {user?.name ? `Hi, ${user.name.split(' ')[0]}` : 'Your shipping location'}
                    </p>
                </div>
            </div>

            <div className="max-w-[540px] mx-auto px-4 sm:px-6 py-8 space-y-6">

                {/* GPS auto-fill card */}
                <button
                    onClick={handleGps}
                    disabled={isGpsLoading}
                    className="w-full flex items-center gap-4 p-4 bg-white border-2 border-dashed border-[#2EC4B6]/40 hover:border-[#2EC4B6] rounded-2xl transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <span className="w-12 h-12 rounded-full bg-[#CCFBF1] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        {isGpsLoading
                            ? <Loader2 size={22} className="text-[#2EC4B6] animate-spin" />
                            : <Navigation size={22} className="text-[#2EC4B6]" />
                        }
                    </span>
                    <div className="text-left">
                        <p className="text-[14px] font-black text-[#0F172A]">
                            {isGpsLoading ? 'Detecting your location…' : 'Use my current location'}
                        </p>
                        <p className="text-[12px] text-[#64748B] mt-0.5">
                            Auto-fill address fields via GPS — no typing needed
                        </p>
                    </div>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[#E5E7EB]" />
                    <span className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">or enter manually</span>
                    <div className="flex-1 h-px bg-[#E5E7EB]" />
                </div>

                {/* Address form */}
                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Street / Road */}
                        <Field
                            label="Street / Road"
                            icon={<Home size={14} />}
                            placeholder="e.g. Tahrir Square St"
                            value={form.street}
                            onChange={set('street')}
                            className="sm:col-span-2"
                        />

                        {/* Building / Apartment */}
                        <Field
                            label="Building / Apt"
                            icon={<Building2 size={14} />}
                            placeholder="e.g. Apt 3B, Floor 5"
                            value={form.building}
                            onChange={set('building')}
                            className="sm:col-span-2"
                        />

                        {/* City */}
                        <Field
                            label="City *"
                            icon={<MapPin size={14} />}
                            placeholder="e.g. Cairo"
                            value={form.city}
                            onChange={set('city')}
                            required
                        />

                        {/* State / Governorate */}
                        <Field
                            label="State / Governorate"
                            icon={<Map size={14} />}
                            placeholder="e.g. Cairo Governorate"
                            value={form.state}
                            onChange={set('state')}
                        />

                        {/* ZIP / Postal code */}
                        <Field
                            label="ZIP / Postal code"
                            icon={<Hash size={14} />}
                            placeholder="e.g. 11511"
                            value={form.zip}
                            onChange={set('zip')}
                        />

                        {/* Country */}
                        <Field
                            label="Country"
                            icon={<Globe size={14} />}
                            placeholder="e.g. Egypt"
                            value={form.country}
                            onChange={set('country')}
                        />
                    </div>

                    {/* Preview */}
                    {(form.city || form.country) && (
                        <div className="mt-2 px-3 py-2.5 bg-[#F0FDFA] border border-[#2EC4B6]/30 rounded-xl text-[12px] text-[#0F172A] leading-relaxed">
                            <span className="text-[#2EC4B6] font-bold mr-1.5">Preview:</span>
                            {formatForDisplay(form)}
                        </div>
                    )}
                </div>

                {/* Save button */}
                <button
                    onClick={handleSave}
                    disabled={!form.city.trim() || isSaved}
                    className="w-full h-[52px] rounded-xl text-[14px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2
                        bg-[#2EC4B6] hover:bg-[#0B1F3A] disabled:bg-[#94A3B8] text-white disabled:cursor-not-allowed
                        shadow-md hover:shadow-lg active:scale-[0.98]"
                >
                    {isSaved
                        ? <><CheckCircle2 size={18} /> Address Saved!</>
                        : <><MapPin size={16} /> Save Delivery Address</>
                    }
                </button>

                <p className="text-center text-[11px] text-[#94A3B8]">
                    Saved locally on this device. Used to show accurate delivery estimates.
                </p>
            </div>
        </div>
    );
}

/* ── Small reusable field component ─────────────────────────── */
function Field({
    label, icon, placeholder, value, onChange, required, className,
}: {
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    required?: boolean;
    className?: string;
}) {
    return (
        <div className={className}>
            <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5">
                {label}
            </label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">{icon}</span>
                <input
                    type="text"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    required={required}
                    className="w-full h-11 pl-9 pr-3 text-[13px] border border-[#E5E7EB] rounded-xl outline-none
                        focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20 transition-all
                        bg-[#FAFAFA] focus:bg-white placeholder:text-[#CBD5E1]"
                />
            </div>
        </div>
    );
}
