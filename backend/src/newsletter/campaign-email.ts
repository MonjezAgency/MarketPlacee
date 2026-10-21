/**
 * Email-safe Atlantis campaign markup (pure). Tables + inline styles, 600 px
 * max, one small <style> block only for the mobile fallback, alt text on every
 * image, no web-only CSS (no flex/grid/positioning/custom properties).
 * The exact string returned here is what the preview shows, what a test email
 * receives and what recipients get (with their own unsubscribe link).
 */

export type CampaignTemplate = 'BLANK' | 'ANNOUNCEMENT' | 'PRODUCTS';
export const TEMPLATES: CampaignTemplate[] = ['BLANK', 'ANNOUNCEMENT', 'PRODUCTS'];

export interface CampaignContent {
    headline?: string;
    body?: string;          // plain text; blank lines separate paragraphs
    ctaLabel?: string;
    ctaUrl?: string;
    productIds?: string[];
    closing?: string;
}

/** A live catalog product as it appears in the email: buyer case price only. */
export interface EmailProduct {
    id: string;
    name: string;
    brand?: string | null;
    image?: string | null;
    casePrice: number | null;   // the buyer price listed on the site (never supplier net)
    unitsPerCase?: number | null;
    url: string;
}

export interface EmailBrand {
    siteUrl: string;        // https://www.atlantisfmcg.com
    logoUrl: string;        // absolute https URL of a file in frontend/public
    contactEmail: string;
    senderName: string;
    senderAddress?: string | null;
}

export const UNSUBSCRIBE_PLACEHOLDER = '__ATL_UNSUBSCRIBE_URL__';

const esc = (s: unknown) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Only absolute http(s) links survive; anything else (javascript:, data:, relative) is dropped. */
export function safeUrl(u: unknown): string | null {
    const s = String(u ?? '').trim();
    if (!/^https?:\/\/[^\s<>"']+$/i.test(s)) return null;
    try { const p = new URL(s); return p.protocol === 'https:' || p.protocol === 'http:' ? p.toString() : null; } catch { return null; }
}

/** Brand details from configuration (never invented): see the report for the env variables. */
export function brandFromEnv(env: NodeJS.ProcessEnv = process.env): EmailBrand {
    const fe = (env.FRONTEND_URL || '').replace(/\/+$/, '');
    const site = /^https:\/\//.test(fe) ? fe : 'https://www.atlantisfmcg.com';
    return {
        siteUrl: site,
        logoUrl: `${site}/brand/atlantis-mark.png`,
        // Published on the Contact page (frontend/src/app/contact/ContactClient.tsx).
        contactEmail: env.MARKETING_CONTACT_EMAIL || 'Info@atlantisfmcg.com',
        senderName: env.MARKETING_SENDER_NAME || 'Atlantis',
        senderAddress: env.MARKETING_SENDER_ADDRESS || null,
    };
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const paragraphs = (text: string | undefined, style: string) => String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;${FONT}${style}">${esc(p).replace(/\n/g, '<br />')}</p>`).join('');

const eur = (n: number) => `€${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

function productRows(products: EmailProduct[], siteUrl: string, showPrices: boolean): string {
    return products.map((p) => {
        const url = safeUrl(p.url) || siteUrl;
        const img = safeUrl(p.image);
        // Wholesale prices are for signed-in accounts only (products/price-visibility.ts):
        // other recipients get a sign-in link instead of the price.
        const login = `${siteUrl.replace(/\/$/, '')}/auth/login?redirect=${encodeURIComponent(url.replace(/^https?:\/\/[^/]+/, '') || '/')}`;
        const price = !showPrices
            ? `<p style="margin:6px 0 0;${FONT}font-size:13px;color:#475569;"><a href="${esc(login)}" style="color:#0E7C74;text-decoration:underline;">Sign in to see the wholesale price</a></p>`
            : p.casePrice !== null && Number.isFinite(p.casePrice)
            ? `<p style="margin:6px 0 0;${FONT}font-size:15px;font-weight:bold;color:#0B1F3A;">${esc(eur(p.casePrice))} <span style="font-weight:normal;font-size:13px;color:#475569;">per case, excl. VAT${p.unitsPerCase ? ` · ${esc(p.unitsPerCase)} units per case` : ''}</span></p>`
            : `<p style="margin:6px 0 0;${FONT}font-size:13px;color:#475569;">Price shown on Atlantis</p>`;
        return `<tr><td style="padding:0 0 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:8px;">
<tr>
<td class="atl-stack" width="132" valign="top" style="padding:12px;width:132px;">${img
    ? `<a href="${esc(url)}"><img src="${esc(img)}" width="108" height="108" alt="${esc(p.name)}" style="display:block;width:108px;height:108px;border:0;background:#F6F8FA;" /></a>`
    : `<table role="presentation" width="108" cellpadding="0" cellspacing="0" border="0"><tr><td width="108" height="108" align="center" style="background:#F6F8FA;${FONT}font-size:12px;color:#64748B;">No image</td></tr></table>`}</td>
<td class="atl-stack" valign="top" style="padding:12px 12px 12px 0;">
${p.brand ? `<p style="margin:0 0 2px;${FONT}font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:1px;">${esc(p.brand)}</p>` : ''}
<p style="margin:0;${FONT}font-size:15px;font-weight:bold;color:#0F172A;line-height:1.4;">${esc(p.name)}</p>
${price}
<p style="margin:10px 0 0;${FONT}font-size:13px;"><a href="${esc(url)}" style="color:#0E7C74;font-weight:bold;text-decoration:underline;">View product</a></p>
</td>
</tr>
</table>
</td></tr>`;
    }).join('\n');
}

export function renderCampaignEmail(input: {
    subject: string;
    preheader?: string | null;
    template: CampaignTemplate;
    content: CampaignContent;
    products?: EmailProduct[];
    brand: EmailBrand;
    /** The recipient's unsubscribe page URL, or UNSUBSCRIBE_PLACEHOLDER to fill in per recipient. */
    unsubscribeUrl: string;
    /** Show buyer case prices (only for buyer accounts, like the site; default true for the admin preview). */
    showPrices?: boolean;
}): string {
    const showPrices = input.showPrices !== false;
    const { brand, content } = input;
    const template: CampaignTemplate = TEMPLATES.includes(input.template) ? input.template : 'BLANK';
    const cta = safeUrl(content.ctaUrl);
    const ctaLabel = String(content.ctaLabel || '').trim();
    const products = template === 'PRODUCTS' ? (input.products || []) : [];
    const unsub = input.unsubscribeUrl === UNSUBSCRIBE_PLACEHOLDER ? UNSUBSCRIBE_PLACEHOLDER : (safeUrl(input.unsubscribeUrl) || `${brand.siteUrl}/unsubscribe`);
    const site = safeUrl(brand.siteUrl) || 'https://www.atlantisfmcg.com';
    const host = site.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const eyebrow = template === 'ANNOUNCEMENT' ? 'Announcement' : template === 'PRODUCTS' ? 'From the Atlantis catalog' : '';
    const headline = String(content.headline || '').trim();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${esc(input.subject)}</title>
<style>
@media only screen and (max-width: 620px) {
  .atl-container { width: 100% !important; }
  .atl-pad { padding-left: 20px !important; padding-right: 20px !important; }
  .atl-stack { display: block !important; width: 100% !important; padding-right: 12px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;">
${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F5F9;">${esc(input.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="atl-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;">
<tr><td class="atl-pad" style="padding:24px 32px;background:#0B1F3A;border-radius:12px 12px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:12px;"><a href="${esc(site)}"><img src="${esc(brand.logoUrl)}" width="40" height="40" alt="Atlantis" style="display:block;width:40px;height:40px;border:0;border-radius:8px;background:#FFFFFF;" /></a></td>
<td valign="middle" style="${FONT}font-size:20px;font-weight:bold;letter-spacing:1px;color:#FFFFFF;">ATLAN<span style="color:#2EC4B6;">TIS.</span></td>
</tr></table>
</td></tr>
<tr><td class="atl-pad" style="padding:32px 32px 8px;">
${eyebrow ? `<p style="margin:0 0 8px;${FONT}font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#0E7C74;">${esc(eyebrow)}</p>` : ''}
${headline ? `<h1 style="margin:0 0 16px;${FONT}font-size:24px;line-height:1.3;font-weight:bold;color:#0B1F3A;">${esc(headline)}</h1>` : ''}
${paragraphs(content.body, 'font-size:15px;line-height:1.6;color:#334155;')}
</td></tr>
${products.length ? `<tr><td class="atl-pad" style="padding:8px 32px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${productRows(products, site, showPrices)}
</table>
${showPrices ? `<p style="margin:0 0 8px;${FONT}font-size:12px;line-height:1.5;color:#64748B;">Prices are the case prices listed on Atlantis when this email was sent, excluding VAT. Your order request shows the price that applies.</p>` : ''}
</td></tr>` : ''}
${cta && ctaLabel ? `<tr><td class="atl-pad" style="padding:16px 32px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="background:#0B1F3A;border-radius:8px;"><a href="${esc(cta)}" style="display:inline-block;padding:12px 24px;${FONT}font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${esc(ctaLabel)}</a></td>
</tr></table>
</td></tr>` : ''}
${content.closing ? `<tr><td class="atl-pad" style="padding:16px 32px 0;">${paragraphs(content.closing, 'font-size:15px;line-height:1.6;color:#334155;')}</td></tr>` : ''}
<tr><td class="atl-pad" style="padding:24px 32px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #E2E8F0;">
<tr><td style="padding-top:16px;${FONT}font-size:12px;line-height:1.6;color:#64748B;">
<p style="margin:0 0 6px;">${esc(brand.senderName)} · <a href="${esc(site)}" style="color:#0E7C74;">${esc(host)}</a> · <a href="mailto:${esc(brand.contactEmail)}" style="color:#0E7C74;">${esc(brand.contactEmail)}</a></p>
${brand.senderAddress ? `<p style="margin:0 0 6px;">${esc(brand.senderAddress)}</p>` : ''}
<p style="margin:0 0 6px;">You receive this email because you subscribed to Atlantis updates or switched on marketing emails in your Atlantis account. Order and account emails are separate and not affected.</p>
<p style="margin:0;"><a href="${unsub === UNSUBSCRIBE_PLACEHOLDER ? unsub : esc(unsub)}" style="color:#334155;text-decoration:underline;">Unsubscribe from marketing emails</a></p>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative built from the same content (no HTML parsing). */
export function renderCampaignText(input: { subject: string; content: CampaignContent; products?: EmailProduct[]; brand: EmailBrand; unsubscribeUrl: string; template: CampaignTemplate; showPrices?: boolean }): string {
    const c = input.content;
    const lines: string[] = [];
    if (c.headline) lines.push(c.headline, '');
    if (c.body) lines.push(c.body.trim(), '');
    if (input.template === 'PRODUCTS') for (const p of input.products || []) {
        lines.push(`${p.brand ? `${p.brand} – ` : ''}${p.name}${input.showPrices !== false && p.casePrice !== null ? ` – ${eur(p.casePrice)} per case, excl. VAT` : ''}`, p.url, '');
    }
    const cta = safeUrl(c.ctaUrl);
    if (cta && c.ctaLabel) lines.push(`${c.ctaLabel}: ${cta}`, '');
    if (c.closing) lines.push(c.closing.trim(), '');
    lines.push('—', `${input.brand.senderName} · ${input.brand.siteUrl} · ${input.brand.contactEmail}`);
    if (input.brand.senderAddress) lines.push(input.brand.senderAddress);
    lines.push(`Unsubscribe from marketing emails: ${input.unsubscribeUrl}`);
    return lines.join('\n');
}
