import { redirect } from 'next/navigation';

/** The placement request form moved to /admin/offers/placement-request (/admin/offers is now the Offers page). */
export default function LegacyNewPlacementRedirect() {
    redirect('/admin/offers/placement-request');
}
