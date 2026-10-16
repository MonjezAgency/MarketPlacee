'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

const OPTIONS = [
    { value: 'system', label: 'system', icon: Monitor },
    { value: 'light', label: 'light', icon: Sun },
    { value: 'dark', label: 'dark', icon: Moon },
] as const;

/**
 * System / Light / Dark selector. next-themes persists the explicit choice
 * (localStorage "theme") and, in System mode, follows prefers-color-scheme
 * live — including when the OS switches while the page is open.
 */
export function ThemeSwitch({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme();
    const { t } = useLanguage();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    const current = mounted ? theme ?? 'light' : undefined;
    return (
        <div className={className}>
            <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t('theme', 'title')}</p>
            <div role="radiogroup" aria-label={t('theme', 'title')} className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-surface-3">
                {OPTIONS.map(({ value, label, icon: Icon }) => {
                    const on = current === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setTheme(value)}
                            className={cn(
                                'h-8 rounded-md inline-flex items-center justify-center gap-1.5 text-[12.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                on ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink'
                            )}
                        >
                            <Icon size={14} /> {t('theme', label)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
