import { planImport, summarize, suggestMapping, csvEscape } from '../import-contacts';
import { brandFromEnv, renderCampaignEmail, UNSUBSCRIBE_PLACEHOLDER } from '../campaign-email';

describe('contact import planning', () => {
    it('dedupes by normalised email, flags invalid rows, existing contacts, suppression and accounts', () => {
        const rows = [
            ['Buyer@Example.com ', 'Ana', 'Acme'],
            ['buyer@example.com', 'Ana again', 'Acme'],
            ['bad-address', 'X', ''],
            ['', 'No email', ''],
            ['old@example.com', '', ''],
            ['gone@example.com', '', ''],
        ];
        const plan = planImport({
            rows, mapping: { email: 0, name: 1, company: 2 },
            existing: new Set(['old@example.com']), suppressed: new Set(['gone@example.com']), accounts: new Set(['buyer@example.com']),
        });
        expect(plan.map((r) => r.outcome)).toEqual(['NEW', 'DUPLICATE_IN_FILE', 'INVALID_EMAIL', 'MISSING_EMAIL', 'UPDATE', 'NEW']);
        expect(plan[0]).toMatchObject({ line: 2, email: 'buyer@example.com', name: 'Ana', company: 'Acme', account: true });
        expect(plan[5].suppressed).toBe(true);
        expect(summarize(plan)).toMatchObject({ total: 6, NEW: 2, UPDATE: 1, DUPLICATE_IN_FILE: 1, INVALID_EMAIL: 1, MISSING_EMAIL: 1, suppressed: 1, accounts: 1 });
    });

    it('suggests a column mapping from common headers', () => {
        expect(suggestMapping(['Company name', 'E-mail', 'Name', 'Country'])).toEqual({ email: 1, name: 2, company: 0, region: 3 });
    });

    it('neutralises spreadsheet formulas in exported cells', () => {
        expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
        expect(csvEscape('plain')).toBe('plain');
    });
});

/** Minimal well-formedness check: every non-void tag closes in order. */
function assertBalanced(html: string) {
    const voids = new Set(['meta', 'img', 'br', 'hr', 'link', 'input']);
    const stack: string[] = [];
    const body = html.replace(/<!DOCTYPE[^>]*>/i, '').replace(/<style[\s\S]*?<\/style>/i, '<style></style>');
    for (const m of body.matchAll(/<\/?([a-zA-Z0-9]+)[^>]*?(\/?)>/g)) {
        const tag = m[1].toLowerCase();
        if (voids.has(tag) || m[2] === '/') continue;
        if (m[0].startsWith('</')) {
            const open = stack.pop();
            if (open !== tag) throw new Error(`mismatched </${tag}>, open <${open}>`);
        } else stack.push(tag);
    }
    expect(stack).toEqual([]);
}

describe('campaign email markup', () => {
    const brand = { ...brandFromEnv({ FRONTEND_URL: 'https://www.atlantisfmcg.com' } as any) };
    const products = [{ id: 'p1', name: 'Biscuits <200g>', brand: 'Acme', image: 'https://cdn.example.com/p1.jpg', casePrice: 24.2, unitsPerCase: 12, url: 'https://www.atlantisfmcg.com/products/p1' }];
    const html = renderCampaignEmail({
        subject: 'New in the catalog', preheader: 'Fresh arrivals', template: 'PRODUCTS',
        content: { headline: 'Fresh arrivals', body: 'Hello,\n\nNew products this week.', ctaLabel: 'Browse the catalog', ctaUrl: 'https://www.atlantisfmcg.com/products', productIds: ['p1'] },
        products, brand, unsubscribeUrl: 'https://www.atlantisfmcg.com/unsubscribe?token=abc123abc123abc123abc123',
    });

    it('has a working unsubscribe link and the sender details from config', () => {
        expect(html).toContain('href="https://www.atlantisfmcg.com/unsubscribe?token=abc123abc123abc123abc123"');
        expect(html).toContain('Unsubscribe from marketing emails');
        expect(html).toContain('mailto:Info@atlantisfmcg.com');
        expect(html).toContain('src="https://www.atlantisfmcg.com/brand/atlantis-mark.png"');
    });

    it('shows only the buyer case price, escapes text and gives images alt text', () => {
        expect(html).toContain('€24.20');
        expect(html).not.toMatch(/net price|supplierPrice|basePrice/i);
        expect(html).toContain('Biscuits &lt;200g&gt;');
        for (const img of html.match(/<img [^>]*>/g) || []) expect(img).toMatch(/alt="[^"]+"/);
    });

    it('is well-formed, 600 px, table-based and free of web-only CSS', () => {
        assertBalanced(html);
        expect(html).toContain('max-width:600px');
        expect(html).not.toMatch(/display:\s*(flex|grid)|position:\s*(absolute|fixed)|var\(--|object-fit/);
        expect(html).not.toMatch(/<script/i);
    });

    it('recipients who are not buyer accounts get a sign-in link instead of the wholesale price', () => {
        const h = renderCampaignEmail({ subject: 's', template: 'PRODUCTS', content: { headline: 'h', productIds: ['p1'] }, products, brand, unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER, showPrices: false });
        expect(h).not.toContain('€');
        expect(h).toContain('href="https://www.atlantisfmcg.com/auth/login?redirect=%2Fproducts%2Fp1"');
        assertBalanced(h);
    });

    it('drops unsafe links and keeps the per-recipient placeholder for sending', () => {
        const h = renderCampaignEmail({ subject: 's', template: 'BLANK', content: { headline: 'h', ctaLabel: 'Go', ctaUrl: 'javascript:alert(1)' }, brand, unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER });
        expect(h).not.toContain('javascript:');
        expect(h).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
        assertBalanced(h);
    });
});
