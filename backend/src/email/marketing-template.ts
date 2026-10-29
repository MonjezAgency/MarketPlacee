/**
 * B2B email templates that are previewed before anything is sent.
 *
 * Table-based, inline-styled HTML (what Gmail/Outlook render reliably), a
 * plain-text twin, a visible unsubscribe link and the company footer.
 * Copy is factual: product facts come from the catalog; no claims about
 * savings, availability or quality are made, and prices are not included
 * (they're shown to signed-in business accounts only).
 */

export interface EmailProduct {
    id: string; name: string; brand?: string | null; image?: string | null; origin?: string | null;
    unitsPerCase?: number | null; casesPerPallet?: number | null; category?: string | null;
}

export interface RenderedEmail { subject: string; preheader: string; html: string; text: string }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TEAL = '#0E7C74', INK = '#0B1F3A', MUTED = '#5B6B7F', LINE = '#E3E8EE', BG = '#F4F6F8';

function shell(o: { siteUrl: string; preheader: string; body: string; footerNote: string; unsubscribeUrl?: string | null }) {
    const site = o.siteUrl.replace(/\/+$/, '');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Ali FMCG</title>
<style>
@media (max-width:620px){ .wrap{width:100%!important} .col{display:block!important;width:100%!important;padding:0 0 16px 0!important} .px{padding-left:20px!important;padding-right:20px!important} h1{font-size:22px!important} }
a{color:${TEAL}}
</style></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
<tr><td class="px" style="padding:22px 32px;border-bottom:1px solid ${LINE};">
  <a href="${site}/" style="text-decoration:none;display:inline-flex;align-items:center;">
    <img src="${site}/icon.png" width="32" height="32" alt="" style="display:inline-block;vertical-align:middle;border-radius:8px;">
    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:800;letter-spacing:-0.3px;color:${INK};">ALI FMCG</span>
  </a>
  <span style="float:right;font-size:12px;color:${MUTED};line-height:32px;">B2B FMCG marketplace</span>
</td></tr>
${o.body}
<tr><td class="px" style="padding:22px 32px;background:#FAFBFC;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};">
  ${o.footerNote}<br>
  Ali FMCG Marketplace, operated by Monjez Company · <a href="mailto:Info@atlantisfmcg.com" style="color:${MUTED};">Info@atlantisfmcg.com</a><br>
  <a href="${site}/privacy-policy" style="color:${MUTED};">Privacy policy</a>${o.unsubscribeUrl ? ` · <a href="${esc(o.unsubscribeUrl)}" style="color:${MUTED};">Unsubscribe</a>` : ''}
</td></tr>
</table></td></tr></table></body></html>`;
}

function productCell(p: EmailProduct, site: string) {
    const url = `${site}/products/${encodeURIComponent(p.id)}`;
    const pack = [p.unitsPerCase ? `${p.unitsPerCase} units/case` : null, p.casesPerPallet ? `${p.casesPerPallet} cases/pallet` : null].filter(Boolean).join(' · ');
    return `<td class="col" width="50%" valign="top" style="width:50%;padding:0 8px 16px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;">
    <tr><td align="center" style="height:150px;padding:12px;background:#ffffff;border-bottom:1px solid ${LINE};border-radius:12px 12px 0 0;">
      ${p.image ? `<a href="${url}"><img src="${esc(p.image)}" alt="${esc(p.name)}" width="140" style="display:block;max-width:140px;max-height:140px;height:auto;"></a>` : `<span style="font-size:12px;color:${MUTED};">No photo yet</span>`}
    </td></tr>
    <tr><td style="padding:12px 14px;">
      <a href="${url}" style="font-size:14px;font-weight:600;color:${INK};text-decoration:none;line-height:1.35;">${esc(p.name)}</a>
      <div style="margin-top:4px;font-size:12px;color:${MUTED};line-height:1.5;">${esc([p.brand, p.origin ? `Origin: ${p.origin}` : null].filter(Boolean).join(' · '))}${pack ? `<br>${esc(pack)}` : ''}</div>
      <a href="${url}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:600;color:${TEAL};text-decoration:none;">View product →</a>
    </td></tr>
  </table>
</td>`;
}

/** Marketplace update for consenting subscribers: products recently approved on Ali FMCG. */
export function renderProductUpdateEmail(o: { products: EmailProduct[]; siteUrl: string; unsubscribeUrl: string; periodLabel?: string }): RenderedEmail {
    const site = o.siteUrl.replace(/\/+$/, '');
    const products = o.products.slice(0, 6);
    const subject = products.length ? `New on Ali FMCG: ${products.length} product${products.length === 1 ? '' : 's'} added${o.periodLabel ? ` ${o.periodLabel}` : ''}` : 'Ali FMCG marketplace update';
    const preheader = products.length ? `${products.slice(0, 3).map((p) => p.name).join(', ')}${products.length > 3 ? ' and more' : ''} — sign in to see wholesale prices and pack options.` : 'News from the Ali FMCG B2B FMCG marketplace.';
    const rows: string[] = [];
    for (let i = 0; i < products.length; i += 2) rows.push(`<tr>${productCell(products[i], site)}${products[i + 1] ? productCell(products[i + 1], site) : '<td class="col" width="50%" style="width:50%;"></td>'}</tr>`);
    const body = `
<tr><td class="px" style="padding:28px 32px 8px 32px;">
  <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;color:${INK};">New products on the marketplace</h1>
  <p style="margin:10px 0 0 0;font-size:15px;line-height:1.6;color:${MUTED};">These listings were approved on Ali FMCG${o.periodLabel ? ` ${esc(o.periodLabel)}` : ' recently'}. Wholesale prices, minimum orders and packaging options are shown to signed-in business accounts.</p>
</td></tr>
<tr><td class="px" style="padding:20px 24px 4px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('') || `<tr><td style="font-size:14px;color:${MUTED};padding:0 8px 16px;">No new listings in this period.</td></tr>`}</table></td></tr>
<tr><td class="px" align="center" style="padding:4px 32px 30px 32px;">
  <a href="${site}/categories" style="display:inline-block;background:${TEAL};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:10px;">Browse the catalogue</a>
</td></tr>`;
    const html = shell({ siteUrl: site, preheader, body, unsubscribeUrl: o.unsubscribeUrl, footerNote: 'You’re receiving this because you subscribed to Ali FMCG marketplace updates or opted in to marketing emails in your account settings.' });
    const text = [
        'New products on the Ali FMCG marketplace', '',
        `These listings were approved on Ali FMCG${o.periodLabel ? ` ${o.periodLabel}` : ' recently'}. Wholesale prices, minimum orders and packaging options are shown to signed-in business accounts.`, '',
        ...products.flatMap((p) => [`- ${p.name}${p.brand ? ` (${p.brand})` : ''}${p.origin ? ` — origin ${p.origin}` : ''}`, `  ${site}/products/${p.id}`]),
        '', `Browse the catalogue: ${site}/categories`, '',
        '—', 'Ali FMCG Marketplace, operated by Monjez Company · Info@atlantisfmcg.com',
        `Privacy policy: ${site}/privacy-policy`, `Unsubscribe: ${o.unsubscribeUrl}`,
    ].join('\n');
    return { subject, preheader, html, text };
}

/** Operational email to a supplier when a buyer reviews one of their products (not marketing: no unsubscribe from marketing needed). */
export function renderReviewNotificationEmail(o: { productName: string; rating: number; comment?: string | null; reviewUrl: string; settingsUrl: string; siteUrl: string }): RenderedEmail {
    const site = o.siteUrl.replace(/\/+$/, '');
    const stars = '★★★★★'.slice(0, Math.max(1, Math.min(5, Math.round(o.rating)))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(1, Math.min(5, Math.round(o.rating))));
    const comment = String(o.comment || '').trim().slice(0, 600);
    const subject = `New ${o.rating}-star review: ${o.productName}`;
    const preheader = comment ? `“${comment.slice(0, 90)}${comment.length > 90 ? '…' : ''}”` : `A buyer rated ${o.productName} ${o.rating} out of 5.`;
    const body = `
<tr><td class="px" style="padding:28px 32px 8px 32px;">
  <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${MUTED};">New product review · published</p>
  <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${esc(o.productName)}</h1>
  <p style="margin:12px 0 0 0;font-size:22px;letter-spacing:2px;color:#F59E0B;" aria-label="${o.rating} out of 5">${stars} <span style="font-size:14px;letter-spacing:0;color:${MUTED};">${o.rating} / 5</span></p>
  ${comment ? `<blockquote style="margin:14px 0 0 0;padding:12px 16px;border-left:3px solid ${TEAL};background:#F7FAFA;font-size:15px;line-height:1.6;color:${INK};">${esc(comment)}</blockquote>` : `<p style="margin:12px 0 0 0;font-size:14px;color:${MUTED};">The buyer left a rating without a comment.</p>`}
</td></tr>
<tr><td class="px" style="padding:22px 32px 30px 32px;">
  <a href="${esc(o.reviewUrl)}" style="display:inline-block;background:${TEAL};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;">See the review</a>
  <p style="margin:14px 0 0 0;font-size:13px;line-height:1.6;color:${MUTED};">Reviews come from signed-in buyers and are shown on the product page. The reviewer’s details aren’t shared by email.</p>
</td></tr>`;
    const html = shell({ siteUrl: site, preheader, body, footerNote: `You’re receiving this because you list this product on Ali FMCG. Change which emails you get in <a href="${esc(o.settingsUrl)}" style="color:${MUTED};">your notification settings</a>.` });
    const text = [`New product review (published) — ${o.productName}`, `Rating: ${o.rating} / 5`, comment ? `“${comment}”` : 'No comment.', '', `See the review: ${o.reviewUrl}`, '', `Notification settings: ${o.settingsUrl}`, 'Ali FMCG Marketplace, operated by Monjez Company · Info@atlantisfmcg.com'].join('\n');
    return { subject, preheader, html, text };
}
