import { redirect } from 'next/navigation';

/** Campaign history now lives on the Newsletter Hub's Campaigns tab. */
export default function NewsletterHistoryPage() {
    redirect('/admin/newsletter?tab=campaigns');
}
