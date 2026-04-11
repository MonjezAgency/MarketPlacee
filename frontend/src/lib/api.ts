// frontend/src/lib/api.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!BASE_URL && typeof window !== 'undefined') {
    console.error(
        "NEXT_PUBLIC_API_URL is not defined in environment variables. " +
        "API calls will fail. Please check your Vercel or local .env configuration."
    );
}

export const apiUrl = BASE_URL || '';

/**
 * Standardized fetch wrapper for the Marketplace platform.
 * - Automatically prepends the base URL.
 * - Enforces credentials: 'include' for httpOnly cookie support.
 * - Adds default JSON headers.
 */
export async function apiFetch(path: string, options: RequestInit = {}) {
    const url = path.startsWith('http') ? path : `${apiUrl}${path}`;
    
    // [FINAL FIX]: Modern headers handling — don't manual set Content-Type for FormData
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    return fetch(url, {
        ...options,
        credentials: 'include',
        headers,
    });
}
