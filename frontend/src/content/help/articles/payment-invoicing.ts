import type { Article } from '../types';

export const paymentInvoicing: Article[] = [
    {
        slug: 'how-payment-works',
        category: 'payment-invoicing',
        title: 'How payment works',
        summary: 'Nothing is charged online when you place an order. The Atlantis team contacts you to agree payment once the order is confirmed.',
        audience: 'buyer',
        popular: true,
        keywords: ['payment', 'pay', 'card', 'bank transfer', 'charged', 'deposit', 'payment terms'],
        blocks: [
            { h2: 'At checkout' },
            { list: [
                'You don\'t enter card or bank details, and no amount is charged or held.',
                'Your order is recorded as **Awaiting confirmation** and the stock is reserved for you.',
            ] },
            { h2: 'After you order' },
            { steps: [
                'Every supplier on the order accepts the quantities, prices and availability, and Atlantis approves the order.',
                'The Atlantis team contacts you to finalise payment and to confirm the delivery cost.',
                'Payment details, timing and method are agreed with you directly by the Atlantis team.',
            ] },
            { note: 'Atlantis will never ask you to pay through a link from an unknown address. If you receive a payment request you are unsure about, check it with Info@atlantisfmcg.com before paying.', tone: 'warning' },
            { faq: [
                { q: 'Why was I not asked to pay?', a: 'Your order is a request until every supplier accepts it and Atlantis approves it. Freight may also still need a quote. The Atlantis team agrees the payment with you once the order is confirmed.' },
                { q: 'Which currency will I pay in?', a: 'Orders are priced in EUR. Amounts shown in other currencies are estimates. See [Currencies](/help/payment-invoicing/currencies).' },
            ] },
        ],
        related: ['buyers/checkout', 'payment-invoicing/invoices', 'delivery/freight-and-carriers'],
    },
    {
        slug: 'currencies',
        category: 'payment-invoicing',
        title: 'Currencies',
        summary: 'Orders are priced in EUR. You can display prices in another currency for reference.',
        audience: 'both',
        keywords: ['currency', 'eur', 'usd', 'aed', 'sar', 'exchange rate', 'display currency'],
        blocks: [
            { list: [
                '**Buyers:** choose a display currency in [Settings](/dashboard/customer/settings): EUR, USD, GBP, AED, SAR, KWD, QAR, EGP, TRY, INR, CNY, JPY or RUB. At checkout you will see "Charged in EUR: €X", and the other amount is an estimate at today\'s rate.',
                '**Suppliers:** set a default currency in [Settings](/supplier/settings). Your prices are converted to EUR with Atlantis\'s conversion table, not live market rates.',
            ] },
        ],
        related: ['products-pricing/how-prices-work', 'settings/display-currency'],
    },
    {
        slug: 'vat-and-tax',
        category: 'payment-invoicing',
        title: 'VAT and tax',
        summary: 'Prices on Atlantis exclude tax. Any tax that applies appears on the invoice.',
        audience: 'buyer',
        keywords: ['vat', 'tax', 'tax exemption', 'reverse charge'],
        blocks: [
            { list: [
                'Product prices and cart totals are shown **excluding VAT and delivery**.',
                'Checkout doesn\'t calculate tax and doesn\'t ask for a VAT number.',
                'The Atlantis invoice shows the tax line that applies to your order.',
                'If your business is entitled to a tax exemption, contact Info@atlantisfmcg.com before ordering so the team can review it.',
            ] },
        ],
        related: ['payment-invoicing/invoices', 'payment-invoicing/how-payment-works'],
    },
    {
        slug: 'invoices',
        category: 'payment-invoicing',
        title: 'Invoices',
        summary: 'Where to find the Atlantis invoice and the supplier\'s invoice for an order.',
        audience: 'both',
        keywords: ['invoice', 'receipt', 'download invoice', 'billing', 'pdf'],
        blocks: [
            { table: { head: ['Invoice', 'Available', 'Where'], rows: [
                ['Atlantis invoice', 'When the order is Delivered', 'On the order page, as a printable page (use your browser\'s Print or Save as PDF)'],
                ['Supplier invoice', 'When the supplier attaches it (confirmed, shipped or delivered orders)', 'On the order page'],
            ] } },
            { p: 'The Atlantis invoice shows the order lines, the tax that applies and the payment due date.' },
            { h2: 'Suppliers' },
            { p: 'Attach your own invoice from [Orders](/supplier/orders): an image or PDF up to 10 MB. The buyer can see it.' },
        ],
        related: ['payment-invoicing/vat-and-tax', 'buyers/confirm-delivery-and-report-a-problem', 'suppliers/handle-orders'],
    },
];
