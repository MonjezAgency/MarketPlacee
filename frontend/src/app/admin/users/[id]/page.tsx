import UserDetailView from '@/components/admin/users/UserDetailView';

/** Admin → Users → one account. */
export default function AdminUserDetailPage({ params }: { params: { id: string } }) {
    return <UserDetailView id={params.id} />;
}
