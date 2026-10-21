import { BadRequestException, UnauthorizedException } from '@nestjs/common';

/**
 * Who is calling a finance route, and the body whitelists. Role checks themselves live in
 * the controller (@Roles + RolesGuard); this decides WHOSE record a call may touch:
 * staff (OWNER/ADMIN) name an account, everyone else is pinned to their own id from the token.
 */
export interface FinanceActor { id: string; role: string; staff: boolean }

const STAFF = new Set(['OWNER', 'ADMIN']);

export function actorOf(req: any): FinanceActor {
    const id = req?.user?.sub;
    const role = String(req?.user?.role || '').toUpperCase();
    if (!id || typeof id !== 'string') throw new UnauthorizedException();
    return { id, role, staff: STAFF.has(role) };
}

const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const reqStr = (v: unknown, field: string, max: number) => {
    const s = str(v, max);
    if (!s) throw new BadRequestException(`${field} is required.`);
    return s;
};
const optDate = (v: unknown, field: string) => {
    if (v === undefined || v === null || v === '') return undefined;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} is not a valid date.`);
    return d;
};
const optNum = (v: unknown, field: string) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new BadRequestException(`${field} must be a number.`);
    return n;
};

/** Credit term (staff only). usedCredit, status and approvedBy can't be set from the body. */
export function parseCreditTermBody(body: unknown) {
    const b = obj(body);
    const userId = reqStr(b.userId, 'userId', 64);
    const creditLimit = Number(b.creditLimit);
    if (!Number.isFinite(creditLimit) || creditLimit < 0) throw new BadRequestException('creditLimit must be 0 or more.');
    const paymentTermDays = Number(b.paymentTermDays);
    if (!Number.isInteger(paymentTermDays) || paymentTermDays < 1 || paymentTermDays > 365) throw new BadRequestException('paymentTermDays must be whole days from 1 to 365.');
    return { userId, creditLimit, paymentTermDays, notes: str(b.notes, 1000) };
}

/**
 * Tax exemption submission. Staff name the account; a buyer's own id is always used for them
 * (a userId in their body is ignored). status/reviewedBy are never taken from the body, so a
 * new exemption is always PENDING.
 */
export function parseTaxExemptionBody(body: unknown, actor: FinanceActor) {
    const b = obj(body);
    const userId = actor.staff ? reqStr(b.userId, 'userId', 64) : actor.id;
    return {
        userId,
        certificateUrl: reqStr(b.certificateUrl, 'certificateUrl', 2048),
        certificateType: str(b.certificateType, 64),
        validFrom: optDate(b.validFrom, 'validFrom'),
        validUntil: optDate(b.validUntil, 'validUntil'),
    };
}

export const REVIEW_STATUSES = ['APPROVED', 'REJECTED'] as const;

export function parseReviewBody(body: unknown) {
    const b = obj(body);
    const status = String(b.status || '').toUpperCase();
    if (!(REVIEW_STATUSES as readonly string[]).includes(status)) throw new BadRequestException('status must be APPROVED or REJECTED.');
    return { status, notes: str(b.notes, 1000) };
}

export interface WarehouseInput {
    name?: string; address?: string; city?: string; country?: string; zipCode?: string;
    latitude?: number; longitude?: number; isDefault?: boolean; supplierId?: string;
}

/**
 * Dispatch location fields. On create, staff name the supplier and a supplier is pinned to
 * themselves; on update the owner never changes (supplierId in the body is ignored).
 */
export function parseWarehouseBody(body: unknown, actor: FinanceActor, mode: 'create' | 'update'): WarehouseInput {
    const b = obj(body);
    const out: WarehouseInput = {};
    if (mode === 'create') {
        out.name = reqStr(b.name, 'name', 200);
        out.address = reqStr(b.address, 'address', 500);
        out.city = reqStr(b.city, 'city', 200);
        out.country = reqStr(b.country, 'country', 100);
        out.supplierId = actor.staff ? reqStr(b.supplierId, 'supplierId', 64) : actor.id;
    } else {
        for (const k of ['name', 'address', 'city', 'country'] as const) {
            if (b[k] !== undefined) out[k] = reqStr(b[k], k, k === 'address' ? 500 : 200);
        }
    }
    if (b.zipCode !== undefined) out.zipCode = str(b.zipCode, 32);
    const lat = optNum(b.latitude, 'latitude'); if (lat !== undefined) out.latitude = lat;
    const lng = optNum(b.longitude, 'longitude'); if (lng !== undefined) out.longitude = lng;
    if (b.isDefault !== undefined) out.isDefault = b.isDefault === true;
    return out;
}
