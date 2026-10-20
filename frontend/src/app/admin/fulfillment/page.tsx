import { permanentRedirect } from 'next/navigation';

/** Hubs & freight rates moved into Settings (components/admin/settings/LogisticsSections.tsx). */
export default function FulfillmentRedirect() {
    permanentRedirect('/admin/settings?section=hubs');
}
