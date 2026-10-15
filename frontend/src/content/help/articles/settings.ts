import type { Article } from '../types';

export const settings: Article[] = [
    {
        slug: 'notifications-and-emails',
        category: 'settings',
        title: 'Notifications and emails',
        summary: 'Which emails and in-app notifications you receive, and which ones you can turn off.',
        audience: 'both',
        keywords: ['notifications', 'emails', 'unsubscribe', 'marketing', 'alerts', 'bell'],
        blocks: [
            { p: 'In-app notifications appear under the bell in the top bar. Email preferences are in Settings ([buyers](/dashboard/customer/settings), [suppliers](/supplier/settings)).' },
            { h2: 'Email switches' },
            { table: { head: ['Switch', 'Who', 'Covers'], rows: [
                ['Order updates', 'Buyers and suppliers', 'Order status emails, new-order emails, target-price answers'],
                ['Profile reminders', 'Buyers', 'Reminders to complete your business profile'],
                ['Listing feedback & reviews', 'Suppliers', 'Listings that need changes, new reviews'],
                ['Low stock alerts', 'Suppliers', 'Products running low or out of stock'],
                ['Marketing emails', 'Everyone', 'Offers and news. Optional and **off** unless you turn it on.'],
            ] } },
            { p: 'Security and account emails, such as sign-in codes, password resets and email-change notices, are always sent. Suppliers can also mute pop-up notifications.' },
        ],
        related: ['settings/sessions-and-devices', 'account/two-step-verification'],
    },
    {
        slug: 'display-currency',
        category: 'settings',
        title: 'Display currency and brand preferences',
        summary: 'Show prices in your currency and tell Atlantis which brands you trade.',
        audience: 'both',
        keywords: ['currency', 'brands', 'preferences', 'personalise'],
        blocks: [
            { h2: 'Display currency' },
            { p: 'Buyers can show prices in another currency. Orders are still priced in EUR. See [Currencies](/help/payment-invoicing/currencies). Suppliers set a default currency for new products and uploaded files.' },
            { h2: 'Brand preferences' },
            { list: [
                '**Buyers:** brands you choose are shown first in "New to you" on your Overview.',
                '**Suppliers:** the brands you supply, saved to your account for the Atlantis team.',
            ] },
        ],
        related: ['payment-invoicing/currencies', 'buyers/find-products'],
    },
    {
        slug: 'sessions-and-devices',
        category: 'settings',
        title: 'Devices and sessions',
        summary: 'See where your account is signed in and sign out devices you don\'t recognise.',
        audience: 'both',
        keywords: ['sessions', 'devices', 'sign out', 'logout everywhere', 'security'],
        blocks: [
            { p: 'The **Devices & sessions** card in your settings lists every active sign-in with the device, IP address, when it started and when it was last used.' },
            { list: [
                'Sign out a single session you don\'t recognise.',
                'Or sign out all other sessions at once.',
            ] },
            { note: 'If you see a session you don\'t recognise, sign it out, change your password and turn on [two-step verification](/help/account/two-step-verification).', tone: 'warning' },
        ],
        related: ['account/two-step-verification', 'account/password-and-sign-in'],
    },
    {
        slug: 'change-sign-in-email',
        category: 'settings',
        title: 'Change your sign-in email',
        summary: 'Move your account to a new email address with your password and a code sent to the new address.',
        audience: 'both',
        keywords: ['change email', 'new email', 'sign-in email', 'update email'],
        blocks: [
            { steps: [
                'In Settings, open the sign-in email card and enter the new address and your current password.',
                'Enter the 6-digit code sent to the new address. It is valid for 15 minutes.',
                'If two-step verification is on, confirm with your authenticator code.',
            ] },
            { p: 'Your old address is notified when the change is requested and again when it is completed. An address that already belongs to another account can\'t be used.' },
        ],
        related: ['account/two-step-verification', 'settings/sessions-and-devices'],
    },
    {
        slug: 'data-downloads',
        category: 'settings',
        title: 'Downloading your data',
        summary: 'The files you can download from Atlantis: catalog results, your product catalog and invoices.',
        audience: 'both',
        keywords: ['export', 'download', 'csv', 'excel', 'data'],
        blocks: [
            { table: { head: ['What', 'Who', 'Where'], rows: [
                ['Catalog search results (CSV)', 'Signed-in buyers', 'The download option in the catalog'],
                ['Your product catalog with prices and stock (Excel)', 'Suppliers', '**Update prices & stock** → Download existing catalog'],
                ['Product upload templates (Excel or CSV)', 'Suppliers', 'Bulk upload'],
                ['Invoices', 'Buyers', 'On each order page'],
            ] } },
        ],
        related: ['buyers/find-products', 'suppliers/update-prices-and-stock', 'payment-invoicing/invoices'],
    },
];
