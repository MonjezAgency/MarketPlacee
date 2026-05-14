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
    // Step 0 — pre-clean any embedded JSON / translation noise before
    // we even try to split. Older orders stored signatures like
    //   Flavour=Sugarfree|__translations={"ar":{"name":"…"}}
    // and even the JSON blob occasionally contains characters that
    // confuse downstream code. Strip everything from the first `__`
    // token through end-of-string OR the next true delimiter.
    let cleaned = sig
        // Drop anything that looks like a JSON object/array dropped into
        // a value position.
        .replace(/\{[\s\S]*$/g, '')
        .replace(/\[[\s\S]*$/g, '')
        // Drop any `|__anything` tail and beyond (translations etc.)
        .replace(/\|?__[A-Za-z0-9_]*=?[\s\S]*$/g, '')
        .trim();
    if (!cleaned) return '';

    const parts = cleaned
        .split('|')
        .map((p) => p.trim())
        .filter((p) => p && !p.startsWith('__'))
        .map((p) => {
            const eq = p.indexOf('=');
            if (eq <= 0) return p;
            const name = p.slice(0, eq).trim();
            const value = p.slice(eq + 1).trim();
            // Truncate ridiculously long values (defensive)
            const safeValue = value.length > 60 ? value.slice(0, 57) + '…' : value;
            if (!name) return safeValue;
            if (!safeValue) return name;
            return `${name}: ${safeValue}`;
        })
        .filter(Boolean);

    return parts.join(' · ');
}
