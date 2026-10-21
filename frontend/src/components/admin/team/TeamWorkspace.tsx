'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { Building2, ChevronDown, Lock, RotateCcw, Search, ShieldCheck, UserPlus, Users, XCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/lib/auth';
import { Button, Card, ConfirmProvider, Dialog, EmptyState, ErrorState, Field, Notice, PageHeader, Skeleton, inputCls, selectCls, useConfirm } from '@/components/supplier/ui';
import { teamApi, type TeamInvitation, type TeamMember, type TeamOverview } from '@/lib/admin-team-api';
import { STAFF_ROLES, canAccessAdminPath, type StaffRole } from '@/lib/admin-access';
import { InviteMemberDialog } from './InviteMemberDialog';
import { RoleBadge, RoleCapabilities, StatusBadge, explainError, roleLabel, useTt, type RowStatus } from './teamUi';

type Row =
    | { kind: 'member'; key: string; name: string; email: string; role: string; status: RowStatus; rawStatus: string; at: string | null; member: TeamMember }
    | { kind: 'invite'; key: string; name: string; email: string; role: string; status: RowStatus; rawStatus: string; at: string | null; invite: TeamInvitation };

const OPEN_INVITE: string[] = ['PENDING', 'EXPIRED', 'NOT_SENT'];

/** Admin → Team: members, open invitations, role changes and the permissions summary. */
export default function TeamWorkspace() {
    return <ConfirmProvider><Team /></ConfirmProvider>;
}

function Team() {
    const tt = useTt();
    const { fmt } = useLanguage();
    const { user } = useAuth();
    const confirm = useConfirm();
    const [data, setData] = React.useState(null as TeamOverview | null);
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [q, setQ] = React.useState('');
    const [roleFilter, setRoleFilter] = React.useState('');
    const [inviteOpen, setInviteOpen] = React.useState(false);
    const [businessOpen, setBusinessOpen] = React.useState(false);
    const [roleTarget, setRoleTarget] = React.useState(null as TeamMember | null);
    const [busyKey, setBusyKey] = React.useState('');

    const load = React.useCallback(async () => {
        setError('');
        try { setData(await teamApi.overview()); }
        catch (e) { setError(explainError(tt, e)); }
        finally { setLoading(false); }
    }, [tt]);
    React.useEffect(() => { load(); }, [load]);

    const allowed = canAccessAdminPath(user?.role, '/admin/team');
    const grantable = data?.viewer.grantableRoles ?? [];

    const rows = React.useMemo(() => {
        if (!data) return [] as Row[];
        const members: Row[] = data.members.map((m) => ({
            kind: 'member', key: `m-${m.id}`, name: m.name || '', email: m.email, role: m.role,
            status: m.status === 'ACTIVE' ? 'ACTIVE' : m.status === 'BLOCKED' ? 'BLOCKED' : 'OTHER', rawStatus: m.status, at: m.lastActiveAt, member: m,
        }));
        const invites: Row[] = data.invitations.filter((i) => OPEN_INVITE.includes(i.state)).map((i) => ({
            kind: 'invite', key: `i-${i.id}`, name: i.name || '', email: i.email, role: i.role, status: i.state, rawStatus: i.state, at: i.sentAt, invite: i,
        }));
        const needle = q.trim().toLowerCase();
        const order = (r: Row) => (r.role === 'OWNER' ? 0 : r.kind === 'member' ? 1 : 2);
        return [...members, ...invites]
            .filter((r) => !roleFilter || r.role === roleFilter)
            .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle))
            .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    }, [data, q, roleFilter]);

    const counts = React.useMemo(() => ({
        members: data?.members.filter((m) => m.status === 'ACTIVE').length ?? 0,
        pending: data?.invitations.filter((i) => i.state === 'PENDING').length ?? 0,
    }), [data]);

    const run = async (key: string, fn: () => Promise<unknown>, ok: string) => { // i18n-ignore: TypeScript generic, not text
        setBusyKey(key);
        try { await fn(); toast.success(ok); await load(); }
        catch (e) { toast.error(explainError(tt, e)); await load(); }
        finally { setBusyKey(''); }
    };

    const deactivate = async (m: TeamMember) => {
        const yes = await confirm({ title: tt('deactivateTitle', { name: m.name || m.email }), body: tt('deactivateBody'), confirm: tt('deactivate'), tone: 'danger' });
        if (yes) run(`m-${m.id}`, () => teamApi.deactivate(m.id), tt('deactivatedOk'));
    };
    const reactivate = (m: TeamMember) => run(`m-${m.id}`, () => teamApi.reactivate(m.id), tt('reactivatedOk'));
    const resend = (i: TeamInvitation) => run(`i-${i.id}`, () => teamApi.resend(i.id), tt('resentOk', { email: i.email }));
    const revoke = async (i: TeamInvitation) => {
        const yes = await confirm({ title: tt('revokeTitle'), body: tt('revokeBody', { email: i.email }), confirm: tt('revoke'), tone: 'danger' });
        if (yes) run(`i-${i.id}`, () => teamApi.revoke(i.id), tt('revokedOk'));
    };

    if (user && !allowed) return <Notice tone="warning" title={tt('noAccessTitle')}>{tt('noAccessBody')}</Notice>;

    const date = (d: string | null) => (d ? fmt.date(d) : '—');

    return (
        <div className="text-start" data-no-translate>
            <PageHeader title={tt('title')} description={tt('desc')}
                actions={<>
                    <Button variant="secondary" icon={<Building2 size={15} />} onClick={() => setBusinessOpen(true)}>{tt('inviteBusiness')}</Button>
                    <Button variant="primary" icon={<UserPlus size={15} />} onClick={() => setInviteOpen(true)} disabled={!grantable.length}>{tt('addMember')}</Button>
                </>} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
                <Card bodyClassName="p-0">
                    <div className="flex flex-wrap items-end gap-3 px-4 sm:px-5 py-3 border-b border-line">
                        <div className="relative flex-1 min-w-[14rem]">
                            <label htmlFor="team-q" className="sr-only">{tt('search')}</label>
                            <Search size={15} aria-hidden className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input id="team-q" type="search" className={`${inputCls} ps-9`} placeholder={tt('searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
                        </div>
                        <div className="w-full sm:w-48">
                            <label htmlFor="team-role" className="sr-only">{tt('roleFilter')}</label>
                            <select id="team-role" className={selectCls} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                                <option value="">{tt('allRoles')}</option>
                                {STAFF_ROLES.map((r) => <option key={r} value={r}>{roleLabel(tt, r)}</option>)}
                            </select>
                        </div>
                        {data && <p className="w-full text-[12.5px] text-ink-3" aria-live="polite">{tt('summary', { members: counts.members, pending: counts.pending })}</p>}
                    </div>

                    {error && <div className="p-4"><ErrorState message={error} onRetry={() => { setLoading(true); load(); }} /></div>}
                    {loading && !data && (
                        <div className="p-4 space-y-3" aria-busy="true" aria-label={tt('loading')}>
                            {[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-10 w-full" />)}
                        </div>
                    )}
                    {data && !rows.length && (
                        <EmptyState icon={<Users size={20} />} title={q || roleFilter ? tt('emptyFiltered') : tt('empty')}>
                            {q || roleFilter ? tt('emptyFilteredBody') : tt('emptyBody')}
                        </EmptyState>
                    )}
                    {data && !!rows.length && (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-[13.5px]">
                                <caption className="sr-only">{tt('tableCaption')}</caption>
                                <thead>
                                    <tr className="border-b border-line text-start text-[12.5px] text-ink-3">
                                        <th scope="col" className="py-2.5 px-4 font-medium text-start">{tt('colMember')}</th>
                                        <th scope="col" className="py-2.5 px-4 font-medium text-start">{tt('colRole')}</th>
                                        <th scope="col" className="py-2.5 px-4 font-medium text-start">{tt('colStatus')}</th>
                                        <th scope="col" className="py-2.5 px-4 font-medium text-start">{tt('colActivity')}</th>
                                        <th scope="col" className="py-2.5 px-4 font-medium text-end">{tt('colActions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.key} className="border-b border-line last:border-0 align-middle">
                                            <td className="py-2.5 px-4">
                                                <p className="font-medium text-ink flex items-center gap-1.5">
                                                    {r.name || <span className="text-ink-3">{tt('noName')}</span>}
                                                    {r.kind === 'member' && r.member.isSelf && <span className="text-[12px] font-normal text-ink-3">{tt('you')}</span>}
                                                </p>
                                                <p className="text-[12.5px] text-ink-3 break-all"><bdi dir="ltr">{r.email}</bdi></p>
                                            </td>
                                            <td className="py-2.5 px-4"><RoleBadge role={r.role} /></td>
                                            <td className="py-2.5 px-4">
                                                <StatusBadge status={r.status} raw={r.rawStatus} />
                                                {r.kind === 'invite' && r.invite.state === 'NOT_SENT' && r.invite.emailError && (
                                                    <p className="mt-1 max-w-[18rem] text-[12px] text-red-700 break-words">{r.invite.emailError}</p>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-4 text-[12.5px] text-ink-3 tabular-nums">
                                                {r.kind === 'member'
                                                    ? (r.at ? tt('lastActive', { date: date(r.at) }) : tt('neverActive'))
                                                    : r.invite.state === 'PENDING' ? tt('expiresOn', { date: date(r.invite.expiresAt) })
                                                        : r.invite.state === 'EXPIRED' ? tt('expiredOn', { date: date(r.invite.expiresAt) })
                                                            : tt('createdOn', { date: date(r.invite.createdAt) })}
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <div className="flex flex-wrap justify-end gap-1.5">
                                                    {r.kind === 'member' && <MemberActions m={r.member} busy={busyKey === r.key} grantable={grantable}
                                                        onRole={() => setRoleTarget(r.member)} onDeactivate={() => deactivate(r.member)} onReactivate={() => reactivate(r.member)} />}
                                                    {r.kind === 'invite' && (grantable as string[]).includes(r.invite.role) && (<>
                                                        <Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} loading={busyKey === r.key} onClick={() => resend(r.invite)}>{tt('resend')}</Button>
                                                        <Button size="sm" variant="ghost" icon={<XCircle size={13} />} disabled={busyKey === r.key} onClick={() => revoke(r.invite)}>{tt('revoke')}</Button>
                                                    </>)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <PermissionsSummary />
            </div>

            <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} roles={grantable} onChanged={load} />
            <ChangeRoleDialog member={roleTarget} roles={grantable} onClose={() => setRoleTarget(null)} onDone={load} />
            <InviteBusinessDialog open={businessOpen} onClose={() => setBusinessOpen(false)} />
        </div>
    );
}

function MemberActions({ m, busy, grantable, onRole, onDeactivate, onReactivate }: { m: TeamMember; busy: boolean; grantable: StaffRole[]; onRole: () => void; onDeactivate: () => void; onReactivate: () => void }) {
    const tt = useTt();
    if (m.role === 'OWNER') return <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-3"><Lock size={13} aria-hidden />{tt('ownerProtected')}</span>;
    if (m.isSelf) return <span className="text-[12.5px] text-ink-3">{tt('selfNote')}</span>;
    if (!m.canManage) return <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-3"><Lock size={13} aria-hidden />{tt('ownerOnly')}</span>;
    return (<>
        {m.status === 'ACTIVE' && grantable.length > 0 && <Button size="sm" variant="secondary" onClick={onRole} disabled={busy}>{tt('changeRole')}</Button>}
        {m.status === 'BLOCKED'
            ? <Button size="sm" variant="secondary" loading={busy} onClick={onReactivate}>{tt('reactivate')}</Button>
            : <Button size="sm" variant="ghost" disabled={busy} onClick={onDeactivate}>{tt('deactivate')}</Button>}
    </>);
}

function ChangeRoleDialog({ member, roles, onClose, onDone }: { member: TeamMember | null; roles: StaffRole[]; onClose: () => void; onDone: () => void }) {
    const tt = useTt();
    const [role, setRole] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState('');
    React.useEffect(() => { setRole(member?.role || ''); setErr(''); setBusy(false); }, [member]);
    const save = async () => {
        if (!member) return;
        setBusy(true); setErr('');
        try {
            await teamApi.changeRole(member.id, role);
            toast.success(tt('roleChangedOk', { name: member.name || member.email, role: roleLabel(tt, role) }));
            onDone(); onClose();
        } catch (e) { setErr(explainError(tt, e)); }
        finally { setBusy(false); }
    };
    return (
        <Dialog open={!!member} onClose={busy ? () => undefined : onClose} dismissable={!busy} title={tt('changeRoleTitle', { name: member?.name || member?.email || '' })} description={tt('changeRoleDesc')}
            footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>{tt('cancel')}</Button><Button variant="primary" loading={busy} disabled={!role || role === member?.role} onClick={save}>{tt('saveRole')}</Button></>}>
            <div className="space-y-4">
                <Field label={tt('fRole')} htmlFor="cr-role">
                    <select id="cr-role" className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
                        {member && !(roles as string[]).includes(member.role) && <option value={member.role}>{roleLabel(tt, member.role)}</option>}
                        {roles.map((r) => <option key={r} value={r}>{roleLabel(tt, r)}</option>)}
                    </select>
                </Field>
                {role && <div className="rounded-lg bg-surface-2 ring-1 ring-line p-3"><RoleCapabilities role={role} compact /></div>}
                {err && <Notice tone="danger">{err}</Notice>}
            </div>
        </Dialog>
    );
}

function PermissionsSummary() {
    const tt = useTt();
    return (
        <Card title={tt('permTitle')} description={tt('permDesc')}>
            <div className="space-y-2">
                {STAFF_ROLES.map((r) => (
                    <details key={r} className="group rounded-lg ring-1 ring-line">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[13.5px] font-medium text-ink rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                            <span className="inline-flex items-center gap-2"><ShieldCheck size={15} aria-hidden className="text-teal" />{roleLabel(tt, r)}</span>
                            <ChevronDown size={15} aria-hidden className="text-ink-4 transition-transform motion-reduce:transition-none group-open:rotate-180" />
                        </summary>
                        <div className="px-3 pb-3"><RoleCapabilities role={r} compact /></div>
                    </details>
                ))}
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">{tt('permFootnote')}</p>
        </Card>
    );
}

/** Kept from the old Invite page: email a business the public sign-up link (no account is created). */
function InviteBusinessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const tt = useTt();
    const [emails, setEmails] = React.useState('');
    const [role, setRole] = React.useState('supplier' as 'supplier' | 'customer');
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState('');
    const [results, setResults] = React.useState(null as null | { email: string; success: boolean; error?: string }[]);
    React.useEffect(() => { if (open) { setEmails(''); setRole('supplier'); setErr(''); setResults(null); setBusy(false); } }, [open]);
    const send = async () => {
        if (!emails.trim()) { setErr(tt('vEmail')); return; }
        setBusy(true); setErr(''); setResults(null);
        try { const r = await teamApi.inviteBusiness({ email: emails, role }); setResults(r.results); }
        catch (e) { setErr(explainError(tt, e)); }
        finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onClose={busy ? () => undefined : onClose} dismissable={!busy} title={tt('bizTitle')} description={tt('bizDesc')}
            footer={results
                ? <Button variant="primary" onClick={onClose}>{tt('done')}</Button>
                : <><Button variant="secondary" onClick={onClose} disabled={busy}>{tt('cancel')}</Button><Button variant="primary" loading={busy} onClick={send}>{tt('bizSend')}</Button></>}>
            {!results ? (
                <div className="space-y-4">
                    <Field label={tt('bizType')} htmlFor="biz-role">
                        <select id="biz-role" className={selectCls} value={role} onChange={(e) => setRole(e.target.value === 'customer' ? 'customer' : 'supplier')}>
                            <option value="supplier">{tt('bizSupplier')}</option>
                            <option value="customer">{tt('bizBuyer')}</option>
                        </select>
                    </Field>
                    <Field label={tt('bizEmails')} htmlFor="biz-emails" hint={tt('bizEmailsHint')}>
                        <textarea id="biz-emails" dir="ltr" rows={3} className={`${inputCls} h-auto py-2`} value={emails} onChange={(e) => setEmails(e.target.value)} />
                    </Field>
                    {err && <Notice tone="danger">{err}</Notice>}
                </div>
            ) : (
                <ul className="space-y-2" aria-live="polite">
                    {results.map((r) => (
                        <li key={r.email} className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
                            <bdi dir="ltr" className="text-ink break-all">{r.email}</bdi>
                            <StatusBadge status={r.success ? 'SENT' : 'NOT_SENT'} />
                            {!r.success && r.error && <p className="w-full text-[12px] text-red-700 break-words">{r.error}</p>}
                        </li>
                    ))}
                </ul>
            )}
        </Dialog>
    );
}
