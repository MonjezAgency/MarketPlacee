import { permanentRedirect } from 'next/navigation';

/** Delivery countries moved into Settings (components/admin/settings/DeliveryCountriesSection.tsx). */
export default function DeliveryCountriesRedirect() {
    permanentRedirect('/admin/settings?section=countries');
}
