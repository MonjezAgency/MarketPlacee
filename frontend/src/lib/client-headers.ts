/** Browser device info for the backend's session list (Vercel sets x-forwarded-for / x-real-ip). */
export function clientHeaders(req: Request): Record<string, string> {
  const h = req.headers;
  const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim();
  const ua = h.get('user-agent') || '';
  const out: Record<string, string> = {};
  if (ua) out['x-client-user-agent'] = ua.slice(0, 400);
  if (ip) out['x-client-ip'] = ip.slice(0, 64);
  return out;
}
