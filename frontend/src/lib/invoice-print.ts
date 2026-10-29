/**
 * Printable Ali FMCG invoice (opened in a new tab and sent to the browser's
 * print dialog). English-only document template — see the gap register
 * (invoice localisation and currency are listed there).
 */
/** Text placed into the HTML document is escaped: product names and invoice fields come from users and the server. */
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

export function buildInvoiceHtml(invoice: any, order: { id: string; items: { quantity: number; price: number; product?: { name?: string } | null }[] }): string {
    const itemRows = (order.items as any[])
        .map(i => `<tr><td>${esc((i as any).product?.name || (i as any).productNameSnapshot || 'Mixed load')}</td><td>${i.quantity}</td><td>€${i.price.toFixed(2)}</td><td>€${(i.price * i.quantity).toFixed(2)}</td></tr>`)
        .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Invoice ${esc(invoice.invoiceNumber)}</title>
<style>
body{font-family:'Segoe UI',sans-serif;margin:0;padding:40px;color:#0A1A2F;background:#fff}
.header{background:#0A1A2F;color:#fff;padding:32px;border-radius:12px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:center}
.logo{font-size:26px;font-weight:900}.logo span{color:#1BC7C9}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px}
.meta-box{background:#F2F4F7;padding:16px;border-radius:8px}
.meta-box label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#667085;display:block;margin-bottom:4px}
.meta-box p{margin:0;font-weight:700;font-size:14px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#667085;padding:8px 12px;border-bottom:2px solid #E5E7EB}
td{padding:12px;border-bottom:1px solid #F2F4F7;font-size:14px}
.totals{margin-left:auto;width:280px}
.total-row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px}
.total-final{display:flex;justify-content:space-between;padding:16px 0;font-size:18px;font-weight:900;color:#1BC7C9;border-top:2px solid #0A1A2F;margin-top:8px}
.footer{text-align:center;color:#667085;font-size:11px;margin-top:40px;padding-top:16px;border-top:1px solid #E5E7EB}
</style></head><body>
<div class="header">
  <div><div class="logo">Atlan<span>tis</span></div></div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:900">${esc(invoice.invoiceNumber)}</div>
    <div style="font-size:12px;color:#B0BCCF;margin-top:4px">Issued: ${new Date(invoice.createdAt).toLocaleDateString()}</div>
  </div>
</div>
<div class="meta">
  <div class="meta-box"><label>Order Reference</label><p>#${order.id.slice(-8).toUpperCase()}</p></div>
  <div class="meta-box"><label>Due Date</label><p>${new Date(invoice.dueDate).toLocaleDateString()}</p></div>
  <div class="meta-box"><label>Payment Status</label><p>${esc(invoice.status)}</p></div>
  <div class="meta-box"><label>Currency</label><p>${esc(invoice.currency || 'EUR')}</p></div>
</div>
<h2 style="font-size:18px">Order Items</h2>
<table>
  <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="totals">
  <div class="total-row"><span>Subtotal</span><span>€${invoice.amount.toFixed(2)}</span></div>
  <div class="total-row"><span>Tax</span><span>€${invoice.tax.toFixed(2)}</span></div>
  <div class="total-final"><span>Total</span><span>€${invoice.totalAmount.toFixed(2)}</span></div>
</div>
<div class="footer">© 2026 Ali FMCG Marketplace — atlantisfmcg.com</div>
</body></html>`;
}
