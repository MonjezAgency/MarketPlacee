import { redirect } from 'next/navigation';

/**
 * This route used to render a hard-coded mock (sample hub, sample goods and
 * amounts). Real tracking — status, carrier and tracking number — lives on the
 * order page, so the route sends buyers there.
 */
export default function OrderTrackRedirect({ params }: { params: { id: string } }) {
    redirect(`/dashboard/customer/orders/${encodeURIComponent(params.id)}`);
}
