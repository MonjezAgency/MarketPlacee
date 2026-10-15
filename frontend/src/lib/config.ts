export const API_BASE_URL = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_API_URL || '/api') 
    : (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || '');

// Debugging: Helpful for identifying environment variable issues in production.
if (typeof window !== 'undefined') {
    console.log('--- SYSTEM CONNECTIVITY DIAGNOSTICS ---');
    console.log('Connecting to Backend at:', API_BASE_URL);
}

/**
 * Official social profiles. Set the NEXT_PUBLIC_SOCIAL_* env vars to the
 * company's real pages; a profile without a URL is simply not shown (the
 * previously hard-coded links pointed to pages that don't exist).
 */
export const SOCIAL_LINKS: { id: 'facebook' | 'instagram' | 'linkedin'; label: string; url: string | null }[] = [
    { id: 'linkedin', label: 'LinkedIn', url: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN || null },
    { id: 'facebook', label: 'Facebook', url: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK || null },
    { id: 'instagram', label: 'Instagram', url: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || null },
];

/**
 * Indicative arrival text for the cart (e.g. "approximately 1 week"). Not a
 * verified estimate: there is no transport integration yet, so it is shown
 * only when set (NEXT_PUBLIC_ARRIVAL_ESTIMATE) and always labelled
 * indicative. Replace with real carrier data when that integration exists.
 */
export const ARRIVAL_ESTIMATE: string | null = process.env.NEXT_PUBLIC_ARRIVAL_ESTIMATE?.trim() || null;
