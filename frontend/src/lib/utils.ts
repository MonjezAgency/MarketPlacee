import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for merging tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Formats currency values
 */
export function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
}

/**
 * Strip internal/translation noise out of a variant signature and
 * render it as a human-readable chip label.
 *
 * Input:  "Flavour=Sugarfree|__translations={\"ar\":{\"name\":\"…\"}}|Size=Large"
 * Output: "Flavour: Sugarfree · Size: Large"
 *
 * The old PDP composer wasn't filtering `__`-prefixed groups before
 * building signatures, so they ended up baked into cart lines + order
 * rows. We sanitise on render so historical orders still look clean.
 */
export function prettifyVariantSignature(sig?: string): string {
    if (!sig || typeof sig !== 'string') return '';
    return sig
        .split('|')
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith('__'))
        .map((part) => {
            const eq = part.indexOf('=');
            if (eq <= 0) return part;
            const name = part.slice(0, eq).trim();
            const value = part.slice(eq + 1).trim();
            // Drop any embedded JSON blob in the value half (defensive
            // — should never happen now that the composer filters
            // __ groups upstream).
            if (value.startsWith('{') || value.startsWith('[')) return name;
            return `${name}: ${value}`;
        })
        .filter(Boolean)
        .join(' · ');
}
