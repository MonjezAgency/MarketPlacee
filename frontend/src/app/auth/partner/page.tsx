import { redirect } from 'next/navigation';

// Partner program registration goes through the standard supplier registration flow
export default function PartnerPage() {
    redirect('/auth/register');
}
