'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { ChevronsUpDown, Globe, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { LOCALES, LOCALE_META, type Locale } from '@/locales/config';

/**
 * Account control in the admin sidebar footer. One menu holds the signed-in
 * staff member's identity and role, the theme (light / dark / system, saved by
 * next-themes), the interface language, Settings and Sign out — so the header
 * no longer needs separate language and theme controls. Sign out uses the real
 * auth flow passed in by the layout.
 */
export default function AdminAccountMenu({ user, collapsed, onSignOut }: {
    user: { name?: string | null; email?: string | null; role?: string | null; avatar?: string | null } | null;
    collapsed: boolean;
    onSignOut: () => unknown;
}) {
    const { t, locale, setLocale } = useLanguage();
    const tn = (k: string) => t('adminNav', k);
    const { theme, setTheme } = useTheme();
    const [open, setOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const wrap = React.useRef<HTMLDivElement>(null);
    const trigger = React.useRef<HTMLButtonElement>(null);
    const menu = React.useRef<HTMLDivElement>(null);
    const menuId = React.useId();
    React.useEffect(() => setMounted(true), []);
    // The sidebar clips its overflow, so the menu is rendered in a portal and placed from the trigger: above it, start-aligned, kept inside the viewport.
    const [pos, setPos] = React.useState<{ left: number; bottom: number } | null>(null);
    const place = React.useCallback(() => {
        const r = trigger.current?.getBoundingClientRect(); if (!r) return;
        const width = 264, gap = 8, rtl = document.documentElement.dir === 'rtl';
        const left = rtl ? Math.max(8, r.right - width) : Math.min(r.left, window.innerWidth - width - 8);
        setPos({ left: Math.max(8, left), bottom: Math.max(8, window.innerHeight - r.top + gap) });
    }, []);
    React.useLayoutEffect(() => { if (open) place(); }, [open, place]);
    React.useEffect(() => {
        if (!open) return;
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [open, place]);

    React.useEffect(() => {
        if (!open) return;
        const items = (): HTMLElement[] => (menu.current ? (Array.from(menu.current.querySelectorAll('[data-menu-item]')) as HTMLElement[]) : []);
        items()[0]?.focus();
        const onDown = (e: MouseEvent) => { const n = e.target as Node; if (!wrap.current?.contains(n) && !menu.current?.contains(n)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const list = items(); if (!list.length) return;
                const i = list.indexOf(document.activeElement as HTMLElement);
                const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
                list[next].focus(); e.preventDefault();
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const initial = (user?.name || user?.email || 'A').trim()[0]?.toUpperCase() || 'A';
    const avatar = (
        <span className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center text-[#2EC4B6] text-[12px] font-semibold shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : initial}
        </span>
    );
    const role = String(user?.role || '').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    const themes: { id: 'light' | 'dark' | 'system'; key: string; icon: React.ElementType }[] = [
        { id: 'light', key: 'themeLight', icon: Sun }, { id: 'dark', key: 'themeDark', icon: Moon }, { id: 'system', key: 'themeSystem', icon: Monitor },
    ];
    const item = 'flex w-full items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13.5px] text-ink-2 hover:bg-surface-2 hover:text-ink outline-none focus-visible:bg-surface-2 focus-visible:text-ink';

    return (
        <div ref={wrap} className={cn('relative', collapsed && 'flex justify-center')}>
            <button ref={trigger} type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
                aria-label={tn('accountMenu')} title={collapsed ? user?.name || undefined : undefined}
                className={cn('flex items-center gap-2.5 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] transition-colors hover:bg-white/[0.06]', collapsed ? 'p-1' : 'w-full p-1.5', open && 'bg-white/[0.06]')}>
                {avatar}
                {!collapsed && (
                    <>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-white truncate">{user?.name}</span>
                            <span className="block text-[11px] text-slate-500 truncate">{role}</span>
                        </span>
                        <ChevronsUpDown size={14} className="text-slate-500 shrink-0" aria-hidden />
                    </>
                )}
            </button>

            {open && pos && createPortal(
                <div ref={menu} id={menuId} role="menu" aria-label={tn('accountMenu')} style={{ position: 'fixed', left: pos.left, bottom: pos.bottom, width: 264 }}
                    className="z-[200] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl bg-surface ring-1 ring-line shadow-[0_18px_48px_rgba(15,23,42,0.22)] p-1.5">
                    <div className="flex items-center gap-2.5 px-2.5 py-2">
                        {avatar}
                        <span className="min-w-0">
                            <span className="block text-[13.5px] font-semibold text-ink truncate">{user?.name}</span>
                            <span className="block text-[12px] text-ink-3 truncate">{user?.email}</span>
                            {role && <span className="mt-1 inline-block rounded-md bg-teal-soft px-1.5 py-0.5 text-[11px] font-medium text-teal">{role}</span>}
                        </span>
                    </div>
                    <div className="my-1 border-t border-line" role="separator" />
                    <p className="px-2.5 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">{tn('theme')}</p>
                    <div role="group" aria-label={tn('theme')} className="grid grid-cols-3 gap-1 px-1 pb-1">
                        {themes.map((o) => {
                            const active = mounted && (theme || 'system') === o.id;
                            const Icon = o.icon;
                            return (
                                <button key={o.id} type="button" role="menuitemradio" aria-checked={active} data-menu-item onClick={() => setTheme(o.id)}
                                    className={cn('flex flex-col items-center gap-1 rounded-lg py-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-teal/60', active ? 'bg-teal-soft text-teal font-medium' : 'text-ink-2 hover:bg-surface-2')}>
                                    <Icon size={15} aria-hidden />{tn(o.key)}
                                </button>
                            );
                        })}
                    </div>
                    <label className={cn(item, 'cursor-pointer')}>
                        <Globe size={15} aria-hidden className="text-ink-3" />
                        <span className="flex-1">{tn('language')}</span>
                        <select data-menu-item value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={tn('language')}
                            className="h-7 max-w-[8.5rem] rounded-md bg-surface-2 ring-1 ring-inset ring-line px-1.5 text-[12.5px] text-ink outline-none focus:ring-2 focus:ring-teal/60">
                            {LOCALES.map((code) => <option key={code} value={code}>{LOCALE_META[code].name}</option>)}
                        </select>
                    </label>
                    <div className="my-1 border-t border-line" role="separator" />
                    <Link href="/admin/settings" role="menuitem" data-menu-item onClick={() => setOpen(false)} className={item}>
                        <Settings size={15} aria-hidden className="text-ink-3" />{tn('settings')}
                    </Link>
                    <button type="button" role="menuitem" data-menu-item disabled={busy}
                        onClick={async () => { setBusy(true); try { await onSignOut(); } finally { setBusy(false); } }}
                        className={cn(item, 'text-red-700 hover:text-red-800 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10')}>
                        <LogOut size={15} aria-hidden />{tn('signOut')}
                    </button>
                </div>,
                document.body,
            )}
        </div>
    );
}
