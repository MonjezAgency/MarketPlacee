import { Role } from '@prisma/client';

/** Staff who may read every invoice (SUPPORT answers buyer questions). */
export const INVOICE_READ_ROLES: Role[] = [Role.OWNER, Role.ADMIN, Role.SUPPORT];

/** Staff who may generate an invoice or mark one paid (changes money records and credit). */
export const INVOICE_WRITE_ROLES: Role[] = [Role.OWNER, Role.ADMIN];

export const isInvoiceStaff = (role?: string | null) =>
    !!role && INVOICE_READ_ROLES.some((r) => r === role.toUpperCase());

/**
 * What a buyer may see of the order behind an invoice: a reference only.
 * Terms, fulfillment and items carry supplier ids and supplier net prices.
 */
export const BUYER_INVOICE_ORDER_SELECT = { id: true, status: true, createdAt: true } as const;
