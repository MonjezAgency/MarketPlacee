jest.mock('otplib', () => ({ verify: jest.fn(), generateSecret: jest.fn(), generateURI: jest.fn() }));
jest.mock('../../auth/twofa.service', () => ({ TwoFaService: class {} }));
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/roles.guard';
import { resolveIdentity } from '../../auth/jwt.strategy';
import { TeamController } from '../team.controller';
import { AppConfigController } from '../app-config.controller';
import { AdminUsersController } from '../admin-users.controller';
import { UsersController } from '../../users/users.controller';
import { OrdersController } from '../../orders/orders.controller';
import { AdminOrdersController } from '../../orders/admin-orders.controller';
import { OffersController } from '../../offers/offers.controller';
import { TargetPricesController } from '../../products/market.controller';
import { DiscountsController } from '../../discounts/discounts.controller';
import { EmailTrackingController } from '../../email-tracking/email-tracking.controller';
import { ProductsController } from '../../products/products.controller';
import { AdminCatalogController } from '../../products/admin-catalog.controller';
import { AdminProductPhotosController } from '../../products/admin-product-photos.controller';

/**
 * The role matrix on the endpoints behind the admin pages, checked through the real
 * RolesGuard and the decorators on the controllers (OWNER passes everywhere).
 */
const guard = new RolesGuard(new Reflector());
const allowed = (ctrl: any, method: string, role: string) => {
    const handler = ctrl.prototype[method];
    if (typeof handler !== 'function') throw new Error(`${ctrl.name}.${method} not found`);
    const ctx: any = { getHandler: () => handler, getClass: () => ctrl, switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u', role } }) }) };
    return guard.canActivate(ctx);
};
const STAFF = ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS', 'SUPPLIER', 'CUSTOMER'];

const cases: [any, string, string[]][] = [
    // Team: owner/admin only (DEVELOPER used to get in)
    [TeamController, 'overview', ['OWNER', 'ADMIN']],
    [TeamController, 'invite', ['OWNER', 'ADMIN']],
    [TeamController, 'changeRole', ['OWNER', 'ADMIN']],
    [TeamController, 'deactivate', ['OWNER', 'ADMIN']],
    [TeamController, 'sendInvite', ['OWNER', 'ADMIN']],
    // Orders: support/logistics read; only owner/admin approve; status changes no longer for support/moderation
    [AdminOrdersController, 'list', ['OWNER', 'ADMIN', 'SUPPORT', 'LOGISTICS']],
    [AdminOrdersController, 'detail', ['OWNER', 'ADMIN', 'SUPPORT', 'LOGISTICS']],
    [AdminOrdersController, 'export', ['OWNER', 'ADMIN']],
    [OrdersController, 'approve', ['OWNER', 'ADMIN']],
    [OrdersController, 'reject', ['OWNER', 'ADMIN']],
    [OrdersController, 'amend', ['OWNER', 'ADMIN']],
    [OrdersController, 'updateStatus', ['OWNER', 'ADMIN', 'LOGISTICS', 'SUPPLIER']],
    // Pricing and platform settings
    [AppConfigController, 'setMarkup', ['OWNER', 'ADMIN']],
    [AppConfigController, 'getMarkup', ['OWNER', 'ADMIN']],
    [AdminCatalogController, 'updatePrice', ['OWNER', 'ADMIN']],
    // Product photos: catalog staff read and re-search; applying a found photo changes a product (owner/admin)
    [AdminProductPhotosController, 'list', ['OWNER', 'ADMIN', 'MODERATOR']],
    [AdminProductPhotosController, 'retry', ['OWNER', 'ADMIN', 'MODERATOR']],
    [AdminProductPhotosController, 'accept', ['OWNER', 'ADMIN']],
    [AdminProductPhotosController, 'dismiss', ['OWNER', 'ADMIN']],
    [DiscountsController, 'createTier', ['OWNER', 'ADMIN']],
    [DiscountsController, 'addMember', ['OWNER', 'ADMIN']],
    [TargetPricesController, 'respond', ['OWNER', 'ADMIN']],
    [TargetPricesController, 'list', ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT']],
    // Users: support reads; account decisions are owner/admin
    [AdminUsersController, 'list', ['OWNER', 'ADMIN', 'SUPPORT']],
    [AdminUsersController, 'detail', ['OWNER', 'ADMIN', 'SUPPORT']],
    [UsersController, 'updateStatus', ['OWNER', 'ADMIN']],
    [UsersController, 'bulkApprove', ['OWNER', 'ADMIN']],
    [UsersController, 'deleteUser', ['OWNER', 'ADMIN']],
    // Catalog and offers review: moderators
    [ProductsController, 'approve', ['OWNER', 'ADMIN', 'MODERATOR']],
    [OffersController, 'approve', ['OWNER', 'ADMIN', 'MODERATOR']],
    [OffersController, 'reject', ['OWNER', 'ADMIN', 'MODERATOR']],
    // Campaign analytics
    [EmailTrackingController, 'overview', ['OWNER', 'ADMIN']],
];

describe('RBAC matrix on staff endpoints', () => {
    for (const [ctrl, method, roles] of cases) {
        it(`${ctrl.name}.${method} → ${roles.join(', ')}`, () => {
            for (const role of STAFF) expect([role, allowed(ctrl, method, role)]).toEqual([role, roles.includes(role)]);
        });
    }
});

describe('role comes from the database, not the 30-day token', () => {
    const facts = (role: string, status = 'ACTIVE', after = 0) => ({ found: true, role, status, after });
    it('a demoted admin acts with the new role', () => {
        expect(resolveIdentity({ sub: 'u', role: 'ADMIN', sid: 's' }, facts('SUPPORT'))).toEqual({ role: 'SUPPORT' });
    });
    it('blocked, deleted or missing accounts are refused', () => {
        expect(resolveIdentity({ sub: 'u', role: 'ADMIN', sid: 's' }, facts('ADMIN', 'BLOCKED'))).toBeNull();
        expect(resolveIdentity({ sub: 'u', role: 'ADMIN', sid: 's' }, facts('ADMIN', 'DELETED'))).toBeNull();
        expect(resolveIdentity({ sub: 'u', role: 'ADMIN' }, { found: false, role: null, status: null, after: 0 })).toBeNull();
    });
    it('legacy tokens die on sign-out-everywhere; a database outage keeps the old behaviour', () => {
        expect(resolveIdentity({ sub: 'u', role: 'ADMIN', iat: 100 }, facts('ADMIN', 'ACTIVE', 200_000))).toBeNull();
        expect(resolveIdentity({ sub: 'u', role: 'ADMIN', iat: 300 }, facts('ADMIN', 'ACTIVE', 200_000))).toEqual({ role: 'ADMIN' });
        expect(resolveIdentity({ sub: 'u', role: 'ADMIN' }, null)).toEqual({ role: 'ADMIN' });
    });
});
