import { redirect } from 'next/navigation';

/**
 * The old Invite page kept invitation "tokens" in the browser only and emailed links that
 * nothing validated. Staff invitations and the business sign-up email now live in Team.
 */
export default function AdminInvitePage() {
    redirect('/admin/team');
}
