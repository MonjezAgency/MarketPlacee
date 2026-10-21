import { checkAccountAction, checkGrant, checkManageStaff, grantableBy } from '../staff-access';

const owner = { id: 'o', role: 'OWNER' };
const admin = { id: 'a', role: 'ADMIN' };
const admin2 = { id: 'a2', role: 'ADMIN' };
const support = { id: 's', role: 'SUPPORT' };
const mod = { id: 'm', role: 'MODERATOR' };
const dev = { id: 'd', role: 'DEVELOPER' };

describe('staff-access: who may manage the team', () => {
    it('only OWNER grants ADMIN; nobody grants OWNER; non-managers grant nothing', () => {
        expect(grantableBy('OWNER')).toEqual(['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS']);
        expect(grantableBy('ADMIN')).toEqual(['MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS']);
        for (const r of ['SUPPORT', 'MODERATOR', 'DEVELOPER', 'EDITOR', 'LOGISTICS', 'CUSTOMER', 'SUPPLIER', '']) expect(grantableBy(r)).toEqual([]);
        expect(checkGrant(owner, 'OWNER')).toBe('ROLE_NOT_GRANTABLE');
        expect(checkGrant(admin, 'ADMIN')).toBe('ROLE_NOT_GRANTABLE');
        expect(checkGrant(admin, 'support')).toBeNull();
        expect(checkGrant(owner, 'ADMIN')).toBeNull();
        expect(checkGrant(dev, 'ADMIN')).toBe('NOT_ALLOWED');
        expect(checkGrant(support, 'SUPPORT')).toBe('NOT_ALLOWED');
        expect(checkGrant(owner, 'PAIR')).toBe('ROLE_NOT_GRANTABLE');
    });

    it('no self-escalation or self-change, for anyone', () => {
        expect(checkGrant(admin, 'MODERATOR', admin)).toBe('SELF');
        expect(checkManageStaff(admin, admin)).toBe('SELF');
        expect(checkManageStaff(owner, owner)).toBe('SELF');
        expect(checkAccountAction(admin, admin)).toBe('SELF');
    });

    it('owner protected; admins managed by the owner only', () => {
        expect(checkManageStaff(admin, owner)).toBe('OWNER_PROTECTED');
        expect(checkGrant(admin, 'SUPPORT', owner)).toBe('OWNER_PROTECTED');
        expect(checkAccountAction(admin, owner)).toBe('OWNER_PROTECTED');
        expect(checkAccountAction(mod, owner)).toBe('OWNER_PROTECTED');
        expect(checkManageStaff(admin, admin2)).toBe('ADMIN_PROTECTED');
        expect(checkManageStaff(owner, admin)).toBeNull();
        expect(checkGrant(owner, 'SUPPORT', admin)).toBeNull();
        expect(checkManageStaff(admin, support)).toBeNull();
        expect(checkManageStaff(support, mod)).toBe('NOT_ALLOWED');
    });

    it('marketplace accounts follow the endpoint roles; staff accounts follow the team rules', () => {
        expect(checkAccountAction(admin, { id: 'b', role: 'CUSTOMER' })).toBeNull();
        expect(checkAccountAction(admin, { id: 'x', role: 'SUPPLIER' })).toBeNull();
        expect(checkAccountAction(admin, support)).toBeNull();
        expect(checkAccountAction(mod, support)).toBe('NOT_ALLOWED');
        expect(checkAccountAction(admin, admin2)).toBe('ADMIN_PROTECTED');
    });
});
