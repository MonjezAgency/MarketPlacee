'use client';

/**
 * Route-level error boundary. Replaces Next.js's default
 * "Application error: a client-side exception has occurred"
 * (which forces the user to open DevTools to see anything) with
 * a real, visible error message + a Reset button.
 *
 * IMPORTANT: this is intentionally informative even in production
 * — Atlantis is a B2B operator-facing app, not a consumer app, and
 * a silent generic error is worse than a verbose one because the
 * operator can't tell us what went wrong.
 */

import * as React from 'react';

export default function GlobalRouteError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        // Loud server-visible log for Vercel logs / Sentry pickup later.
        console.error('[Atlantis route error]', error);
    }, [error]);

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-6 bg-slate-50">
            <div className="max-w-2xl w-full bg-white border border-rose-200 rounded-3xl shadow-xl overflow-hidden">
                <div className="px-8 py-6 bg-rose-50 border-b border-rose-200">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-rose-600 mb-1">Runtime Error</p>
                    <h1 className="text-2xl font-black text-slate-900">Something broke on this page</h1>
                </div>
                <div className="p-8 space-y-5">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">Error message</p>
                        <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-[12px] font-mono overflow-x-auto whitespace-pre-wrap break-words">
{error.message || '(no message — check stack below)'}
                        </pre>
                    </div>
                    {error.stack && (
                        <details>
                            <summary className="text-[11px] font-black uppercase tracking-widest text-slate-500 cursor-pointer mb-2">Stack trace (click to expand)</summary>
                            <pre className="bg-slate-100 text-slate-700 p-4 rounded-xl text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-words mt-2 max-h-[300px]">
{error.stack}
                            </pre>
                        </details>
                    )}
                    {error.digest && (
                        <p className="text-[11px] text-slate-400 font-mono">digest: {error.digest}</p>
                    )}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={() => reset()}
                            className="h-11 px-6 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all"
                        >
                            Try again
                        </button>
                        <button
                            onClick={() => window.location.href = '/'}
                            className="h-11 px-6 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-sm font-bold transition-all"
                        >
                            Go to homepage
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
