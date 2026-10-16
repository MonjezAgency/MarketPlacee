import type { Article } from '../types';

export const delivery: Article[] = [
    {
        slug: 'delivery-countries',
        category: 'delivery',
        title: 'Where we deliver',
        summary: 'Atlantis delivers to Europe and the GCC. Checkout shows which countries are supported for your order.',
        audience: 'buyer',
        keywords: ['delivery countries', 'shipping countries', 'destination', 'europe', 'gcc', 'unsupported country'],
        blocks: [
            { h2: 'Supported destinations' },
            { table: { head: ['Region', 'Countries'], rows: [
                ['European Union', 'All 27 member states'],
                ['Rest of Europe', 'Iceland, Liechtenstein, Norway, Switzerland, United Kingdom, Moldova, Serbia, Albania, Bosnia and Herzegovina, Montenegro and North Macedonia'],
                ['GCC', 'United Arab Emirates, Saudi Arabia, Kuwait, Qatar, Bahrain and Oman'],
            ] } },
            { note: 'The list can change. The country picker at checkout is always up to date: it groups countries into "We deliver to" and "Not currently supported".', tone: 'info' },
            { h2: 'Delivering somewhere else' },
            { p: 'If you choose an unsupported country, checkout explains that delivery there is not currently supported. Choose an eligible destination, or [contact us](/contact) about delivery to that country.' },
        ],
        related: ['delivery/freight-and-carriers', 'troubleshooting/delivery-country-not-supported', 'buyers/checkout'],
    },
    {
        slug: 'freight-and-carriers',
        category: 'delivery',
        title: 'Freight costs and carriers',
        summary: 'Where Atlantis has a rate for your route, checkout shows the delivery charge; otherwise freight is quoted after you order. Atlantis confirms the carrier, cost and timing.',
        audience: 'buyer',
        keywords: ['freight', 'shipping cost', 'delivery cost', 'carrier', 'logistics partner', 'transit time', 'exw'],
        blocks: [
            { h2: 'How freight is priced' },
            { p: 'The cost depends on the dispatch location, your destination, and how many cases, pallets or trucks the order fills. Where Atlantis has a configured rate for your route, the delivery charge is shown at checkout. Otherwise the Atlantis team quotes it after you order, and nothing is added until you accept that quote.' },
            { h2: 'Preferred logistics partner' },
            { p: 'At checkout you can choose a preferred carrier. It is a preference only. If you don\'t choose one, Atlantis chooses. The carrier, cost and transit time are confirmed by Atlantis after your order.' },
            { h2: 'Dispatch location' },
            { p: 'Each product shows its **EXW** (Ex Works) location: the place the supplier makes the goods available for collection. The cart shows it next to each supplier\'s lines, for example **EXW · Milan**.' },
            { note: 'Transit times aren\'t guaranteed at checkout. Atlantis confirms the expected timing with you when the freight is booked.', tone: 'info' },
        ],
        related: ['delivery/delivery-countries', 'delivery/tracking', 'payment-invoicing/how-payment-works'],
    },
    {
        slug: 'delivery-address',
        category: 'delivery',
        title: 'Delivery address',
        summary: 'How the delivery address is entered at checkout and where it is saved.',
        audience: 'buyer',
        keywords: ['address', 'delivery address', 'shipping address', 'postal code'],
        blocks: [
            { list: [
                'Required: contact name, street, city, postal code and country. Company name is optional.',
                '**Auto-fill from location** uses your browser\'s location to suggest the address. Check it before continuing.',
                'The address is remembered **in the browser you used**, for next time. It isn\'t saved to your account, so it won\'t appear on another device.',
                'You can also manage the saved address on the [address page](/account/address).',
            ] },
        ],
        related: ['buyers/checkout', 'delivery/delivery-countries'],
    },
    {
        slug: 'tracking',
        category: 'delivery',
        title: 'Tracking a shipment',
        summary: 'Tracking details appear on the order once Atlantis adds the carrier reference.',
        audience: 'buyer',
        keywords: ['tracking number', 'track shipment', 'carrier', 'where is my order'],
        blocks: [
            { steps: [
                'Open the order in [Orders & tracking](/dashboard/customer/orders).',
                'When the order is **Shipped**, the carrier and tracking number appear, with a link to the carrier\'s site.',
                'Until the reference is added, the order says tracking will appear once the carrier reference is added.',
            ] },
            { p: 'You also receive a status email when the order ships, including the tracking link.' },
        ],
        related: ['buyers/track-orders', 'buyers/confirm-delivery-and-report-a-problem'],
    },
];
