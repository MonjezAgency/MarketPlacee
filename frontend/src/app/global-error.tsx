'use client';

/**
 * Catastrophic-failure boundary. Triggered when the layout itself
 * (or any of its providers) throws — at which point the normal
 * error.tsx route boundary can't render, so we ship a self-
 * contained <html> + <body> here instead.
 *
 * Same philosophy as error.tsx: show the real message so the
 * operator can act, not a generic "something went wrong".
 */

import * as React from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        console.error('[Atlantis global error]', error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{ margin: 0, padding: 0, fontFamily: 'sans-serif', background: '#F8FAFC' }}>
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div style={{ maxWidth: '720px', width: '100%', background: '#fff', border: '1px solid #FECDD3', borderRadius: '24px', boxShadow: '0 20px 60px rgba(15,23,42,0.08)', overflow: 'hidden' }}>
                        <div style={{ padding: '24px 32px', background: '#FEF2F2', borderBottom: '1px solid #FECDD3' }}>
                            <p style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#E11D48', margin: '0 0 6px' }}>Critical Error</p>
                            <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>The app crashed at the layout level</h1>
                        </div>
                        <div style={{ padding: '32px' }}>
                            <p style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#64748B', margin: '0 0 8px' }}>Error message</p>
                            <pre style={{ background: '#0F172A', color: '#F1F5F9', padding: '16px', borderRadius: '12px', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
{error.message || '(no message)'}
                            </pre>
                            {error.stack && (
                                <pre style={{ background: '#F1F5F9', color: '#475569', padding: '16px', borderRadius: '12px', fontSize: '11px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '16px 0 0', maxHeight: '300px' }}>
{error.stack}
                                </pre>
                            )}
                            {error.digest && (
                                <p style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '16px' }}>digest: {error.digest}</p>
                            )}
                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                <button onClick={() => reset()} style={{ height: '44px', padding: '0 24px', background: '#0F172A', color: '#fff', border: 0, borderRadius: '12px', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>Try again</button>
                                <button onClick={() => window.location.href = '/'} style={{ height: '44px', padding: '0 24px', background: '#fff', color: '#334155', border: '1px solid #E2E8F0', borderRadius: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Go to homepage</button>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
