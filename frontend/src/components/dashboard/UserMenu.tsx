'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User,
    Settings,
    LogOut,
    ChevronDown,
    Shield,
    ShieldCheck,
    CreditCard,
    LayoutDashboard,
    MessageCircle,
    Truck
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

interface UserMenuProps {
    role?: string;
}

export function UserMenu({ role }: UserMenuProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const menuRef = React.useRef<HTMLDivElement>(null);

    // Detect if we're on the admin layout (white background) vs homepage (dark navbar)
    const normalizedRole = role?.toLowerCase() || '';
    const teamRoles = ['admin', 'owner', 'moderator', 'support', 'editor', 'developer', 'logistics'];
    const isTeamMember = teamRoles.includes(normalizedRole);
    const isAdminLayout = isTeamMember || normalizedRole === 'supplier';

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getRoleLabel = () => {
        switch (normalizedRole) {
            case 'admin': return t('userMenu', 'superAdmin');
            case 'owner': return t('userMenu', 'platformOwner');
            case 'developer': return t('userMenu', 'techTeam');
            case 'moderator': return t('userMenu', 'moderator');
            case 'support': return t('userMenu', 'supportAgent');
            case 'editor': return t('userMenu', 'contentEditor');
            case 'logistics': return t('userMenu', 'logistics');
            case 'supplier': return t('userMenu', 'verifiedSupplier');
            default: return t('userMenu', 'partner');
        }
    };

    const menuItems = [
        {
            label: normalizedRole === 'buyer' ? t('sidebar', 'orders') : t('userMenu', 'dashboard'),
            icon: normalizedRole === 'buyer' ? Truck : LayoutDashboard,
            href: isTeamMember ? '/admin' : normalizedRole === 'supplier' ? '/supplier' : '/dashboard/customer/orders',
        },
    ];

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-3 p-1.5 rounded-2xl transition-all group border border-transparent",
                    isAdminLayout
                        ? "hover:bg-[#F3F3F3] hover:border-[#DDD]"
                        : "hover:bg-white/5 hover:border-white/10"
                )}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center font-black text-teal-600 border-2 border-teal-500/20 shadow-lg group-hover:scale-105 transition-transform overflow-hidden">
                        {user?.avatar ? (
                            <img src={user.avatar} className="w-full h-full object-cover" alt={user.name} />
                        ) : (
                            user?.name?.[0] || 'U'
                        )}
                    </div>
                    <div className="text-start hidden lg:block">
                        <p className={cn(
                            "text-xs font-black group-hover:text-secondary transition-colors",
                            isAdminLayout ? "text-[#0F1111]" : "text-white"
                        )}>{user?.name}</p>
                        <div className="flex items-center gap-1.5">
                            <div className={cn(
                                "w-1.5 h-1.5 rounded-full animate-pulse",
                                isTeamMember ? "bg-primary" : normalizedRole === 'supplier' ? "bg-emerald-500" : "bg-blue-500"
                            )} />
                            <span className={cn(
                                "text-[9px] font-black uppercase tracking-tighter",
                                isTeamMember ? "text-primary" : normalizedRole === 'supplier' ? "text-emerald-500" : "text-blue-500"
                            )}>
                                {getRoleLabel()}
                            </span>
                        </div>
                    </div>
                </div>
                <ChevronDown
                    size={16}
                    className={cn(
                        "transition-all",
                        isAdminLayout ? "text-[#888] group-hover:text-[#0F1111]" : "text-white/60 group-hover:text-white",
                        isOpen && "rotate-180 text-secondary"
                    )}
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute end-0 mt-4 w-64 bg-white border border-[#DDD] rounded-xl shadow-xl z-[100] overflow-hidden"
                    >
                        <div className="p-4 border-b border-[#EAEDED]">
                            <p className="text-[10px] font-black text-[#888] uppercase tracking-[0.2em] mb-3">{t('userMenu', 'account')}</p>
                            <div className="flex items-center gap-3 px-2 py-1">
                                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 overflow-hidden">
                                    {user?.avatar ? (
                                        <img src={user.avatar} className="w-full h-full object-cover" alt={user.name} />
                                    ) : (
                                        <User size={20} className="text-slate-400" />
                                    )}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-xs font-black text-[#0F1111] truncate">{user?.name}</p>
                                    <p className="text-[10px] text-[#888] truncate">{user?.email}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-2">
                            {menuItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.label}
                                        href={item.href}
                                        onClick={() => setIsOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[#555] hover:text-[#0F1111] hover:bg-[#F3F3F3] transition-all group"
                                    >
                                        <Icon size={18} className="group-hover:scale-110 group-hover:text-[#FF9900] transition-all" />
                                        <span className="text-sm font-bold">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>

                        <div className="p-2 bg-[#F9F9F9] border-t border-[#EAEDED]">
                            <button
                                onClick={async () => {
                                    setIsOpen(false);
                                    await logout();
                                    window.location.href = '/auth/login';
                                }}
                                className="flex items-center gap-3 px-4 py-2.5 w-full rounded-lg text-[#C40000] hover:bg-red-50 transition-all group"
                            >
                                <LogOut size={18} className="group-hover:translate-x-1 transition-transform" />
                                <span className="text-sm font-bold">{t('userMenu', 'signOut')}</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
