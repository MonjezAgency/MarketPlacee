import { redirect } from 'next/navigation';

/** Coupons are created in a dialog on /admin/coupons; old links open it there. */
export default function CreateCouponRedirect() {
    redirect('/admin/coupons?create=1');
}
