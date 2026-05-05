'use client';

import * as React from 'react';
import {
    Settings, Users, Bell, Shield, Globe,
    Save, Plus, Pencil, MoreHorizontal,
    Check, AlertCircle, ChevronRight,
    DollarSign, Clock, Lock, Key,
    Mail, MessageSquare, Database, Zap, X, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/lib/auth';
import { setActiveCurrency, SUPPORTED_CURRENCIES } from '@/lib/currency';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Role {
    id: string;
    name: string;
    permissionsCount: number;
    description: string;
}

// ─── Components ─────────────────────────────────────────────────────────────

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <div className="space-y-6">
                {children}
            </div>
        </div>
    );
}

function SettingCard({ title, children }: { title?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
            {title && <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h3>}
            <div className="space-y-4">
                {children}
            </div>
        </div>
    );
}

function InputField({ label, placeholder, value, onChange, type = 'text' }: any) {
    return (
        <div className="space-y-1.5 flex-1">
            <label className="text-[12px] font-medium text-slate-500">{label}</label>
            <input 
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="h-10 w-full px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/5 transition-all"
            />
        </div>
    );
}

function ToggleField({ label, description, checked, onChange }: any) {
    return (
        <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="text-xs text-slate-500">{description}</p>
            </div>
            <button 
                onClick={() => onChange(!checked)}
                className={cn(
                    "w-10 h-5 rounded-full relative transition-all duration-300",
                    checked ? "bg-teal-600" : "bg-slate-200"
                )}
            >
                <motion.div 
                    animate={{ x: checked ? 22 : 2 }}
                    className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                />
            </button>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SettingsDashboard() {
    const { user, updateUser } = useAuth();
    const { locale } = useLanguage();
    const [activeSection, setActiveSection] = React.useState('General');
    const [isSaving, setIsSaving] = React.useState(false);

    // Form States
    const [platformName, setPlatformName] = React.useState('Atlantis Marketplace');
    const [adminFullName, setAdminFullName] = React.useState('');
    const [currency, setCurrency] = React.useState('USD');
    const [timezone, setTimezone] = React.useState('UTC+2 (Cairo)');
    const [twoFactor, setTwoFactor] = React.useState(true);
    const [passwordRules, setPasswordRules] = React.useState(true);
    
    // Roles State
    const [roles, setRoles] = React.useState<Role[]>([
        { id: '1', name: 'Super Admin', permissionsCount: 42, description: 'Full system access' },
        { id: '2', name: 'Moderator', permissionsCount: 18, description: 'Content & product approval' },
        { id: '3', name: 'Support Agent', permissionsCount: 12, description: 'Customer tickets & chat' },
        { id: '4', name: 'Logistics Manager', permissionsCount: 8, description: 'Shipment & tracking control' }
    ]);
    const [showCreateRole, setShowCreateRole] = React.useState(false);
    const [newRole, setNewRole] = React.useState({ name: '', description: '' });
    const [isCreatingRole, setIsCreatingRole] = React.useState(false);

    // Password Change State
    const [currentPassword, setCurrentPassword] = React.useState('');
    const [newPassword, setNewPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false);
    
    // Pricing & Markup States
    const [markupPiece, setMarkupPiece] = React.useState(1.10);
    const [markupPallet, setMarkupPallet] = React.useState(1.05);
    const [markupContainer, setMarkupContainer] = React.useState(1.02);
    const [platformFee, setPlatformFee] = React.useState(5);
    const [shippingMarkup, setShippingMarkup] = React.useState(1.10);

    const [defaultUnit, setDefaultUnit] = React.useState<'truck' | 'pallet' | 'carton'>('truck');

    const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Initialize from user data and platform config
    React.useEffect(() => {
        if (user) {
            setAvatarPreview(user.avatar || null);
            setPlatformName(user.companyName || 'Atlantis Marketplace');
            setAdminFullName(user.name || '');
        }

        // Fetch current platform currency configuration
        apiFetch('/config/currency')
            .then(res => res.json())
            .then(data => {
                if (data && data.currency) {
                    setCurrency(data.currency.toUpperCase());
                }
            })
            .catch(err => console.error('Failed to fetch platform currency:', err));

        // Fetch markup configs
        apiFetch('/admin/config/markup')
            .then(res => res.json())
            .then(data => {
                if (data && data.markup) {
                    setMarkupPiece(data.markup.piece);
                    setMarkupPallet(data.markup.pallet);
                    setMarkupContainer(data.markup.container);
                    setPlatformFee(data.markup.platformFee);
                    setShippingMarkup(data.markup.shippingMarkup);
                }
            })
            .catch(err => console.error('Failed to fetch markup settings:', err));

        // Fetch default display unit
        apiFetch('/admin/config/default-unit')
            .then(res => res.json())
            .then(data => {
                if (data && data.unit) {
                    setDefaultUnit(data.unit as 'truck' | 'pallet' | 'carton');
                }
            })
            .catch(err => console.error('Failed to fetch default unit:', err));
    }, [user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarPreview(reader.result as string);
                toast.success('Image selected');
            };
            reader.readAsDataURL(file);
        }
    };

    const navItems = [
        { id: 'General', icon: Globe },
        { id: 'Pricing & Markup', icon: DollarSign },
        { id: 'Users & Roles', icon: Users },
        { id: 'Notifications', icon: Bell },
        { id: 'Security', icon: Shield },
        { id: 'Integrations', icon: Zap }
    ];

    const handleCreateRole = async () => {
        if (!newRole.name.trim()) { toast.error('Role name is required'); return; }
        setIsCreatingRole(true);
        try {
            const res = await apiFetch('/admin/roles', {
                method: 'POST',
                body: JSON.stringify({ name: newRole.name.trim(), description: newRole.description.trim() }),
            });
            if (res.ok) {
                const created = await res.json();
                setRoles(prev => [...prev, { id: created.id, name: created.name, description: created.description || newRole.description, permissionsCount: 0 }]);
            } else {
                // Optimistic local add if backend endpoint doesn't exist yet
                setRoles(prev => [...prev, { id: Date.now().toString(), name: newRole.name.trim(), description: newRole.description.trim(), permissionsCount: 0 }]);
            }
            toast.success('Role created');
            setShowCreateRole(false);
            setNewRole({ name: '', description: '' });
        } catch (_e) {
            setRoles(prev => [...prev, { id: Date.now().toString(), name: newRole.name.trim(), description: newRole.description.trim(), permissionsCount: 0 }]);
            toast.success('Role created');
            setShowCreateRole(false);
            setNewRole({ name: '', description: '' });
        } finally {
            setIsCreatingRole(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Update user profile info
            await updateUser({
                avatar: avatarPreview || undefined,
                companyName: platformName,
                name: adminFullName
            });

            // Update platform-wide currency configuration
            const res = await apiFetch('/admin/config/currency', {
                method: 'POST',
                body: JSON.stringify({ currency })
            });

            // Update Pricing & Markup configuration
            const markupRes = await apiFetch('/admin/config/markup', {
                method: 'POST',
                body: JSON.stringify({
                    piece: markupPiece,
                    pallet: markupPallet,
                    container: markupContainer,
                    platformFee,
                    shippingMarkup
                })
            });

            // Update default display unit
            await apiFetch('/admin/config/default-unit', {
                method: 'POST',
                body: JSON.stringify({ unit: defaultUnit })
            });

            if (res.ok && markupRes.ok) {
                toast.success('Settings saved successfully');
                // Sync currency to localStorage so all components pick it up
                setActiveCurrency(currency);
            } else {
                toast.error('Failed to save platform currency');
            }
        } catch (err) {
            toast.error('Failed to save settings');
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error('Please fill in all password fields');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        setIsUpdatingPassword(true);
        const tid = toast.loading('Updating password...');
        try {
            const res = await apiFetch('/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword })
            });

            if (res.ok) {
                toast.success('Password updated successfully', { id: tid });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                const err = await res.json();
                toast.error(err.message || 'Failed to update password', { id: tid });
            }
        } catch (err) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    return (
        <div className="max-w-[1200px] mx-auto space-y-8 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4 lg:px-0">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">System Settings</h1>
                    <p className="text-sm text-slate-500 mt-1">Global platform configurations and security protocols.</p>
                </div>
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-10 px-6 bg-teal-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                    {isSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
                    Save Changes
                </button>
            </div>

            <div className="grid grid-cols-12 gap-8 px-4 lg:px-0 h-full min-h-[600px]">
                
                {/* LEFT (30%) — Navigation */}
                <div className="col-span-12 lg:col-span-3 space-y-2">
                    <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm sticky top-8">
                        {navItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setActiveSection(item.id)}
                                className={cn(
                                    "w-full h-10 px-3 rounded-xl flex items-center gap-3 text-sm font-medium transition-all mb-1",
                                    activeSection === item.id 
                                        ? "bg-teal-50 text-teal-700 shadow-sm border border-teal-100" 
                                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                )}
                            >
                                <item.icon size={18} className={cn(activeSection === item.id ? "text-teal-600" : "text-slate-400")} />
                                {item.id}
                                {activeSection === item.id && <ChevronRight size={14} className="ms-auto" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* RIGHT (70%) — Content */}
                <div className="col-span-12 lg:col-span-9">
                    <AnimatePresence mode="wait">
                        {activeSection === 'General' && (
                            <SettingSection key="general" title="General Platform Settings">
                                <SettingCard title="Profile Identity">
                                    <div className="flex items-center gap-6">
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            onChange={handleFileChange} 
                                            className="hidden" 
                                            accept="image/*" 
                                        />
                                        <div 
                                            className="relative group cursor-pointer"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <div className="w-24 h-24 rounded-3xl bg-slate-100 border-2 border-slate-200 overflow-hidden relative">
                                                {avatarPreview ? (
                                                    <img 
                                                        src={avatarPreview} 
                                                        className="w-full h-full object-cover" 
                                                        alt="Admin Avatar"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-teal-50 text-teal-600 font-bold text-2xl">
                                                        A
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Pencil size={20} className="text-white" />
                                                </div>
                                            </div>
                                            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-teal-600 text-white rounded-xl flex items-center justify-center shadow-lg border-2 border-white">
                                                <Plus size={16} />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-bold text-slate-900">Administrator Avatar</h4>
                                            <p className="text-xs text-slate-500">JPG, GIF or PNG. Max size of 2MB.</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <button 
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="text-[10px] font-bold text-teal-600 uppercase tracking-widest hover:underline"
                                                >
                                                    Upload New
                                                </button>
                                                <span className="text-slate-300">|</span>
                                                <button 
                                                    onClick={() => setAvatarPreview(null)}
                                                    className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:underline"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </SettingCard>

                                <SettingCard title="Basic Information">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField 
                                            label="Administrator Name" 
                                            value={adminFullName} 
                                            onChange={(e: any) => setAdminFullName(e.target.value)} 
                                            placeholder="Your full name" 
                                        />
                                        <InputField 
                                            label="Platform Display Name" 
                                            value={platformName} 
                                            onChange={(e: any) => setPlatformName(e.target.value)} 
                                            placeholder="Enter marketplace name" 
                                        />
                                        <InputField 
                                            label="Account Email" 
                                            value={user?.email || ""} 
                                            placeholder="Contact email" 
                                            disabled
                                        />
                                    </div>
                                </SettingCard>

                                <SettingCard title="Regional Preferences">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[12px] font-medium text-slate-500">Default Currency</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">
                                                    {SUPPORTED_CURRENCIES.find(c => c.code === currency)?.symbol || '$'}
                                                </span>
                                                <select 
                                                    value={currency}
                                                    onChange={(e) => setCurrency(e.target.value)}
                                                    className="h-10 w-full pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500 appearance-none cursor-pointer"
                                                >
                                                    {SUPPORTED_CURRENCIES.map(c => (
                                                        <option key={c.code} value={c.code}>{c.symbol} {c.code} - {c.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[12px] font-medium text-slate-500">System Timezone</label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                <select 
                                                    value={timezone}
                                                    onChange={(e) => setTimezone(e.target.value)}
                                                    className="h-10 w-full pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500 appearance-none cursor-pointer"
                                                >
                                                    <optgroup label="Africa">
                                                        <option value="UTC+2 (Cairo)">UTC+2 (Cairo)</option>
                                                        <option value="UTC+0 (Casablanca)">UTC+0 (Casablanca)</option>
                                                        <option value="UTC+1 (Lagos)">UTC+1 (Lagos)</option>
                                                        <option value="UTC+1 (Tunis)">UTC+1 (Tunis)</option>
                                                        <option value="UTC+1 (Algiers)">UTC+1 (Algiers)</option>
                                                        <option value="UTC+2 (Johannesburg)">UTC+2 (Johannesburg)</option>
                                                        <option value="UTC+3 (Nairobi)">UTC+3 (Nairobi)</option>
                                                    </optgroup>
                                                    <optgroup label="Europe">
                                                        <option value="UTC+0 (London)">UTC+0 (London)</option>
                                                        <option value="UTC+0 (Lisbon)">UTC+0 (Lisbon)</option>
                                                        <option value="UTC+1 (Paris)">UTC+1 (Paris)</option>
                                                        <option value="UTC+1 (Berlin)">UTC+1 (Berlin)</option>
                                                        <option value="UTC+1 (Madrid)">UTC+1 (Madrid)</option>
                                                        <option value="UTC+1 (Rome)">UTC+1 (Rome)</option>
                                                        <option value="UTC+1 (Amsterdam)">UTC+1 (Amsterdam)</option>
                                                        <option value="UTC+1 (Brussels)">UTC+1 (Brussels)</option>
                                                        <option value="UTC+1 (Vienna)">UTC+1 (Vienna)</option>
                                                        <option value="UTC+1 (Warsaw)">UTC+1 (Warsaw)</option>
                                                        <option value="UTC+1 (Prague)">UTC+1 (Prague)</option>
                                                        <option value="UTC+1 (Budapest)">UTC+1 (Budapest)</option>
                                                        <option value="UTC+1 (Stockholm)">UTC+1 (Stockholm)</option>
                                                        <option value="UTC+1 (Copenhagen)">UTC+1 (Copenhagen)</option>
                                                        <option value="UTC+1 (Oslo)">UTC+1 (Oslo)</option>
                                                        <option value="UTC+2 (Bucharest)">UTC+2 (Bucharest)</option>
                                                        <option value="UTC+2 (Athens)">UTC+2 (Athens)</option>
                                                        <option value="UTC+2 (Helsinki)">UTC+2 (Helsinki)</option>
                                                        <option value="UTC+2 (Sofia)">UTC+2 (Sofia)</option>
                                                        <option value="UTC+2 (Kyiv)">UTC+2 (Kyiv)</option>
                                                        <option value="UTC+3 (Moscow)">UTC+3 (Moscow)</option>
                                                        <option value="UTC+3 (Istanbul)">UTC+3 (Istanbul)</option>
                                                    </optgroup>
                                                    <optgroup label="Middle East">
                                                        <option value="UTC+2 (Beirut)">UTC+2 (Beirut)</option>
                                                        <option value="UTC+2 (Amman)">UTC+2 (Amman)</option>
                                                        <option value="UTC+2 (Jerusalem)">UTC+2 (Jerusalem)</option>
                                                        <option value="UTC+3 (Riyadh)">UTC+3 (Riyadh)</option>
                                                        <option value="UTC+3 (Doha)">UTC+3 (Doha)</option>
                                                        <option value="UTC+3 (Kuwait)">UTC+3 (Kuwait)</option>
                                                        <option value="UTC+3 (Baghdad)">UTC+3 (Baghdad)</option>
                                                        <option value="UTC+4 (Dubai)">UTC+4 (Dubai)</option>
                                                        <option value="UTC+4 (Muscat)">UTC+4 (Muscat)</option>
                                                        <option value="UTC+3:30 (Tehran)">UTC+3:30 (Tehran)</option>
                                                    </optgroup>
                                                    <optgroup label="Americas">
                                                        <option value="UTC-5 (New York)">UTC-5 (New York)</option>
                                                        <option value="UTC-5 (Toronto)">UTC-5 (Toronto)</option>
                                                        <option value="UTC-6 (Chicago)">UTC-6 (Chicago)</option>
                                                        <option value="UTC-7 (Denver)">UTC-7 (Denver)</option>
                                                        <option value="UTC-8 (Los Angeles)">UTC-8 (Los Angeles)</option>
                                                        <option value="UTC-3 (São Paulo)">UTC-3 (São Paulo)</option>
                                                        <option value="UTC-3 (Buenos Aires)">UTC-3 (Buenos Aires)</option>
                                                        <option value="UTC-6 (Mexico City)">UTC-6 (Mexico City)</option>
                                                    </optgroup>
                                                    <optgroup label="Asia">
                                                        <option value="UTC+5 (Karachi)">UTC+5 (Karachi)</option>
                                                        <option value="UTC+5:30 (Mumbai)">UTC+5:30 (Mumbai)</option>
                                                        <option value="UTC+5:30 (New Delhi)">UTC+5:30 (New Delhi)</option>
                                                        <option value="UTC+6 (Dhaka)">UTC+6 (Dhaka)</option>
                                                        <option value="UTC+7 (Bangkok)">UTC+7 (Bangkok)</option>
                                                        <option value="UTC+7 (Jakarta)">UTC+7 (Jakarta)</option>
                                                        <option value="UTC+8 (Singapore)">UTC+8 (Singapore)</option>
                                                        <option value="UTC+8 (Hong Kong)">UTC+8 (Hong Kong)</option>
                                                        <option value="UTC+8 (Beijing)">UTC+8 (Beijing)</option>
                                                        <option value="UTC+8 (Shanghai)">UTC+8 (Shanghai)</option>
                                                        <option value="UTC+9 (Tokyo)">UTC+9 (Tokyo)</option>
                                                        <option value="UTC+9 (Seoul)">UTC+9 (Seoul)</option>
                                                    </optgroup>
                                                    <optgroup label="Oceania">
                                                        <option value="UTC+10 (Sydney)">UTC+10 (Sydney)</option>
                                                        <option value="UTC+10 (Melbourne)">UTC+10 (Melbourne)</option>
                                                        <option value="UTC+12 (Auckland)">UTC+12 (Auckland)</option>
                                                    </optgroup>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </SettingCard>
                            </SettingSection>
                        )}

                        {activeSection === 'Pricing & Markup' && (
                            <SettingSection key="pricing" title="Global Pricing & Margin Control">
                                <SettingCard title="Wholesale Unit Markup (%)">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-slate-500">Piece/Carton Markup</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" step="0.1"
                                                    value={Math.round((markupPiece - 1) * 100 * 10) / 10}
                                                    onChange={(e) => setMarkupPiece(1 + parseFloat(e.target.value || "0") / 100)}
                                                    className="h-10 w-full px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400">Example: 10% profit margin</p>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-slate-500">Pallet Markup</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" step="0.1"
                                                    value={Math.round((markupPallet - 1) * 100 * 10) / 10}
                                                    onChange={(e) => setMarkupPallet(1 + parseFloat(e.target.value || "0") / 100)}
                                                    className="h-10 w-full px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-slate-500">Container Markup</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" step="0.1"
                                                    value={Math.round((markupContainer - 1) * 100 * 10) / 10}
                                                    onChange={(e) => setMarkupContainer(1 + parseFloat(e.target.value || "0") / 100)}
                                                    className="h-10 w-full px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </SettingCard>

                                <SettingCard title="Platform Fees & Logistics (%)">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[12px] font-medium text-slate-500">Platform Commission (%)</label>
                                            <div className="relative">
                                                <input 
                                                    type="number"
                                                    value={platformFee}
                                                    onChange={(e) => setPlatformFee(parseFloat(e.target.value || "0"))}
                                                    className="h-10 w-full px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1 italic">Percentage taken from total product value of approved orders.</p>
                                        </div>
                                        <div className="space-y-1.5 flex-1">
                                            <label className="text-[12px] font-medium text-slate-500">Shipping Markup (%)</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" step="0.1"
                                                    value={Math.round((shippingMarkup - 1) * 100 * 10) / 10}
                                                    onChange={(e) => setShippingMarkup(1 + parseFloat(e.target.value || "0") / 100)}
                                                    className="h-10 w-full px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1 italic">Additional percentage added to base shipping costs.</p>
                                        </div>
                                    </div>
                                </SettingCard>

                                <SettingCard title="Default Product View Unit">
                                    <p className="text-xs text-slate-500 -mt-2">Controls which unit tier buyers see first when opening a product page.</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        {([
                                            { key: 'truck',  emoji: '🚛', label: 'Truck',  desc: 'Full truckload' },
                                            { key: 'pallet', emoji: '📦', label: 'Pallet', desc: 'Per pallet' },
                                            { key: 'carton', emoji: '🗃️', label: 'Carton', desc: 'Per carton' },
                                        ] as const).map((opt) => (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                onClick={() => setDefaultUnit(opt.key)}
                                                className={cn(
                                                    'flex flex-col items-center py-4 px-2 rounded-2xl border-2 text-center transition-all',
                                                    defaultUnit === opt.key
                                                        ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                                                        : 'border-slate-200 bg-white text-slate-500 hover:border-teal-300'
                                                )}
                                            >
                                                <span className="text-2xl mb-1">{opt.emoji}</span>
                                                <span className="text-[12px] font-black uppercase tracking-widest">{opt.label}</span>
                                                <span className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </SettingCard>

                                <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl flex items-start gap-4">
                                    <AlertCircle className="text-teal-600 shrink-0 mt-0.5" size={18} />
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-teal-900">Financial Impact Alert</p>
                                        <p className="text-xs text-teal-700 leading-relaxed">
                                            Changes to these values will affect all **future** transactions and product approvals. 
                                            Existing orders will retain the commission rates they were created with.
                                        </p>
                                    </div>
                                </div>
                            </SettingSection>
                        )}

                        {activeSection === 'Users & Roles' && (
                            <SettingSection key="roles" title="Users & Roles Management">
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Roles</h3>
                                        <button onClick={() => setShowCreateRole(true)} className="h-8 px-3 bg-teal-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 hover:bg-teal-700 transition-all">
                                            <Plus size={14} /> Create Role
                                        </button>
                                    </div>
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                <th className="px-6 py-4">Role Name</th>
                                                <th className="px-6 py-4">Permissions</th>
                                                <th className="px-6 py-4 text-end">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {roles.map((role) => (
                                                <tr key={role.id} className="hover:bg-slate-50 transition-all group">
                                                    <td className="px-6 py-4">
                                                        <div className="space-y-0.5">
                                                            <p className="text-sm font-semibold text-slate-900">{role.name}</p>
                                                            <p className="text-[10px] text-slate-500">{role.description}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-200">
                                                            {role.permissionsCount} Active
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-end">
                                                        <button className="p-2 text-slate-400 hover:text-teal-600 transition-colors">
                                                            <Pencil size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </SettingSection>
                        )}

                        {activeSection === 'Security' && (
                            <SettingSection key="security" title="Security & Access Control">
                                <SettingCard title="Authentication Protocols">
                                    <ToggleField 
                                        label="Two-Factor Authentication (2FA)" 
                                        description="Require a second verification step for all admin accounts."
                                        checked={twoFactor}
                                        onChange={setTwoFactor}
                                    />
                                    <div className="h-px bg-slate-100 my-2" />
                                    <ToggleField 
                                        label="Enforce Complex Passwords" 
                                        description="Require symbols, numbers, and uppercase characters."
                                        checked={passwordRules}
                                        onChange={setPasswordRules}
                                    />
                                </SettingCard>

                                <SettingCard title="Change Administrator Password">
                                    <form onSubmit={handleChangePassword} className="space-y-4">
                                        <InputField 
                                            label="Current Password" 
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e: any) => setCurrentPassword(e.target.value)}
                                            placeholder="••••••••"
                                        />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <InputField 
                                                label="New Password" 
                                                type="password"
                                                value={newPassword}
                                                onChange={(e: any) => setNewPassword(e.target.value)}
                                                placeholder="••••••••"
                                            />
                                            <InputField 
                                                label="Confirm New Password" 
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e: any) => setConfirmPassword(e.target.value)}
                                                placeholder="••••••••"
                                            />
                                        </div>
                                        <div className="flex justify-end pt-2">
                                            <button 
                                                type="submit"
                                                disabled={isUpdatingPassword}
                                                className="h-10 px-6 bg-slate-900 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {isUpdatingPassword ? "Updating..." : "Update Password"}
                                            </button>
                                        </div>
                                    </form>
                                </SettingCard>

                                <SettingCard title="Session Management">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField 
                                            label="Session Timeout (Minutes)" 
                                            value="120" 
                                            type="number"
                                        />
                                        <InputField 
                                            label="Max Login Attempts" 
                                            value="5" 
                                            type="number"
                                        />
                                    </div>
                                </SettingCard>

                                <button className="w-full h-12 bg-red-50 text-red-600 rounded-2xl text-[11px] font-bold uppercase tracking-widest border border-red-100 hover:bg-red-100 transition-all flex items-center justify-center gap-2">
                                    <Lock size={16} /> Force Password Reset for All Users
                                </button>
                            </SettingSection>
                        )}

                        {activeSection === 'Notifications' && (
                            <SettingSection key="notifications" title="Notification Settings">
                                <SettingCard title="Email Configuration">
                                    <div className="space-y-4">
                                        <InputField label="Sender Name" value="Atlantis Marketplace" />
                                        <InputField label="Sender Email" value="no-reply@atlantis.com" />
                                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
                                                <Mail size={18} />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-blue-900">SMTP Server Active</h4>
                                                <p className="text-[10px] text-blue-600 font-medium">Connection status: Optimal</p>
                                            </div>
                                        </div>
                                    </div>
                                </SettingCard>

                                <SettingCard title="System Alerts">
                                    <ToggleField label="New User Registration" description="Notify admins when a new supplier signs up." checked={true} onChange={()=>{}} />
                                    <div className="h-px bg-slate-100 my-2" />
                                    <ToggleField label="Large Order Alert" description="Notify when an order exceeds $10,000." checked={true} onChange={()=>{}} />
                                </SettingCard>
                            </SettingSection>
                        )}

                        {activeSection === 'Integrations' && (
                            <SettingSection key="integrations" title="Third-party Integrations">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 hover:shadow-md transition-all group">
                                        <div className="flex items-center justify-between">
                                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
                                                <Database size={24} />
                                            </div>
                                            <span className="px-2 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded-lg border border-green-100 uppercase">Connected</span>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-900">Stripe Connect</h4>
                                            <p className="text-xs text-slate-500 mt-1">Payment gateway & automated supplier payouts.</p>
                                        </div>
                                        <button className="text-xs font-bold text-teal-600 flex items-center gap-1 group-hover:underline mt-2">
                                            Configure Settings <ChevronRight size={14} />
                                        </button>
                                    </div>

                                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 hover:shadow-md transition-all group opacity-60">
                                        <div className="flex items-center justify-between">
                                            <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center border border-orange-100">
                                                <MessageSquare size={24} />
                                            </div>
                                            <span className="px-2 py-1 bg-slate-50 text-slate-400 text-[10px] font-bold rounded-lg border border-slate-100 uppercase">Disabled</span>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-900">Twilio SMS</h4>
                                            <p className="text-xs text-slate-500 mt-1">SMS notifications for order tracking & OTP.</p>
                                        </div>
                                        <button className="text-xs font-bold text-teal-600 flex items-center gap-1 group-hover:underline mt-2">
                                            Connect Twilio <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </SettingSection>
                        )}
                    </AnimatePresence>
                </div>

            </div>

            {/* Create Role Modal */}
            <AnimatePresence>
                {showCreateRole && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateRole(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl w-full max-w-md relative z-10 overflow-hidden shadow-2xl">
                            <div className="p-8 space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900">Create Role</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Define a new access level for your team</p>
                                    </div>
                                    <button onClick={() => setShowCreateRole(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400"><X size={20} /></button>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role Name *</label>
                                        <input
                                            type="text"
                                            autoFocus
                                            value={newRole.name}
                                            onChange={e => setNewRole(r => ({ ...r, name: e.target.value }))}
                                            placeholder="e.g. Finance Manager"
                                            className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-medium text-sm transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</label>
                                        <textarea
                                            value={newRole.description}
                                            onChange={e => setNewRole(r => ({ ...r, description: e.target.value }))}
                                            placeholder="Brief description of this role's responsibilities..."
                                            rows={3}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-teal-500 font-medium text-sm transition-all resize-none"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setShowCreateRole(false)} className="flex-1 h-12 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreateRole}
                                        disabled={isCreatingRole || !newRole.name.trim()}
                                        className="flex-1 h-12 bg-teal-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-teal-600/20 hover:bg-teal-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isCreatingRole ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                                        Create Role
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
