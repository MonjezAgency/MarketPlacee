import { AsyncLocalStorage } from 'async_hooks';

/** Per-request device info, so token issuing can record which device signed in. */
export interface RequestContext { userAgent: string | null; ip: string | null }
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** The frontend's auth proxy forwards the browser's UA/IP in x-client-* headers. */
export function contextMiddleware(req: any, _res: any, next: () => void) {
    const h = req.headers || {};
    const ua = String(h['x-client-user-agent'] || h['user-agent'] || '').slice(0, 400) || null;
    const fwd = String(h['x-client-ip'] || h['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    requestContext.run({ userAgent: ua, ip: fwd ? fwd.replace(/^::ffff:/, '').slice(0, 64) : null }, next);
}

/** "Chrome on macOS" from a user-agent string (null when unknown). */
export function deviceLabel(ua: string | null | undefined): string | null {
    const s = String(ua || '');
    if (!s || /^node|undici|axios|curl/i.test(s)) return null;
    const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Windows/.test(s) ? 'Windows' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : null;
    const br = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung Internet' : /Firefox\//.test(s) ? 'Firefox' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : null;
    if (!os && !br) return null;
    return br && os ? `${br} on ${os}` : (br || os);
}
