import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { linesFromOrderItems, variantKeyOf, normaliseTier, cleanQty, MAX_LIST_ITEMS, type ListLine } from './list-lines';

const PRODUCT_VIEW = { id: true, name: true, brand: true, ean: true, images: true, status: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true, supplierId: true } as const;

@Injectable()
export class ListsService {
    constructor(private prisma: PrismaService) {}

    private async own(userId: string, id: string) {
        const list = await this.prisma.shoppingList.findFirst({ where: { id, userId } });
        if (!list) throw new NotFoundException('List not found');
        return list;
    }

    /** Lists with items and the CURRENT product record (no stored prices). */
    async all(userId: string) {
        const lists = await this.prisma.shoppingList.findMany({
            where: { userId }, orderBy: { updatedAt: 'desc' },
            include: { items: { orderBy: { createdAt: 'asc' } } },
        });
        const ids = [...new Set(lists.flatMap((l) => l.items.map((i) => i.productId)))];
        const products = ids.length ? await this.prisma.product.findMany({ where: { id: { in: ids } }, select: PRODUCT_VIEW }) : [];
        const byId = new Map(products.map((p) => [p.id, { ...p, image: p.images?.[0] ?? null, images: undefined, available: p.status === 'APPROVED' }]));
        return lists.map((l) => ({ ...l, items: l.items.map((i) => ({ ...i, product: byId.get(i.productId) ?? null })) }));
    }

    async create(userId: string, name: string) {
        const n = String(name || '').trim().slice(0, 80);
        if (!n) throw new BadRequestException('Give the list a name.');
        return this.prisma.shoppingList.create({ data: { userId, name: n } });
    }

    /** Name, description and reorder reminder (date + repeat). */
    async updateDetails(userId: string, id: string, body: { name?: string; description?: string | null; nextReminderAt?: string | null; reminderRepeat?: string }) {
        await this.own(userId, id);
        const data: any = {};
        if (body.name !== undefined) { const n = String(body.name || '').trim().slice(0, 80); if (!n) throw new BadRequestException('Give the list a name.'); data.name = n; }
        if (body.description !== undefined) data.description = String(body.description || '').trim().slice(0, 500) || null;
        if (body.reminderRepeat !== undefined) {
            if (!['none', 'weekly', 'monthly'].includes(String(body.reminderRepeat))) throw new BadRequestException('Repeat must be none, weekly or monthly.');
            data.reminderRepeat = body.reminderRepeat;
        }
        if (body.nextReminderAt !== undefined) {
            if (!body.nextReminderAt) data.nextReminderAt = null;
            else {
                const d = new Date(body.nextReminderAt);
                if (isNaN(d.getTime())) throw new BadRequestException('Invalid reminder date.');
                if (d.getTime() < Date.now() - 60_000) throw new BadRequestException('Pick a reminder date in the future.');
                data.nextReminderAt = d;
            }
        }
        return this.prisma.shoppingList.update({ where: { id }, data });
    }

    async rename(userId: string, id: string, name: string) {
        await this.own(userId, id);
        const n = String(name || '').trim().slice(0, 80);
        if (!n) throw new BadRequestException('Give the list a name.');
        return this.prisma.shoppingList.update({ where: { id }, data: { name: n } });
    }

    async remove(userId: string, id: string) {
        await this.own(userId, id);
        await this.prisma.shoppingList.delete({ where: { id } });
        return { ok: true };
    }

    /** Upsert lines: an existing product/variant/tier row is UPDATED to the new quantity, never duplicated. */
    async putLines(userId: string, id: string, lines: ListLine[]) {
        await this.own(userId, id);
        const clean = lines.filter((l) => l.productId && l.quantity > 0);
        if (!clean.length) throw new BadRequestException('Nothing to save.');
        const count = await this.prisma.shoppingListItem.count({ where: { listId: id } });
        if (count + clean.length > MAX_LIST_ITEMS * 2) throw new BadRequestException('This list is full.');
        const known = await this.prisma.product.findMany({ where: { id: { in: clean.map((l) => l.productId) } }, select: { id: true } });
        const ok = new Set(known.map((p) => p.id));
        await this.prisma.$transaction(clean.filter((l) => ok.has(l.productId)).map((l) => this.prisma.shoppingListItem.upsert({
            where: { listId_productId_variantKey_tier: { listId: id, productId: l.productId, variantKey: l.variantKey, tier: l.tier } },
            create: { listId: id, productId: l.productId, variantKey: l.variantKey, selectedVariants: (l.selectedVariants ?? undefined) as any, tier: l.tier, quantity: l.quantity },
            update: { quantity: l.quantity },
        })));
        await this.prisma.shoppingList.update({ where: { id }, data: { updatedAt: new Date() } });
        return { saved: clean.filter((l) => ok.has(l.productId)).length, skipped: clean.length - clean.filter((l) => ok.has(l.productId)).length };
    }

    addItems(userId: string, id: string, raw: any[]) {
        const lines: ListLine[] = (Array.isArray(raw) ? raw : []).slice(0, MAX_LIST_ITEMS).map((r) => {
            const sel = r?.selectedVariants && typeof r.selectedVariants === 'object' ? r.selectedVariants : null;
            return { productId: String(r?.productId || ''), variantKey: variantKeyOf(sel), selectedVariants: sel, tier: normaliseTier(r?.tier), quantity: cleanQty(r?.quantity) };
        });
        return this.putLines(userId, id, lines);
    }

    /** "Save these items to a list for next time" — only from the buyer's own order. */
    async fromOrder(userId: string, orderId: string, target: { listId?: string; name?: string }) {
        const order = await this.prisma.order.findFirst({ where: { id: orderId, customerId: userId }, include: { items: true } });
        if (!order) throw new NotFoundException('Order not found');
        const listId = target.listId ? (await this.own(userId, target.listId)).id : (await this.create(userId, target.name || `Order ${orderId.slice(0, 8).toUpperCase()}`)).id;
        const res = await this.putLines(userId, listId, linesFromOrderItems(order.items as any[]));
        return { listId, ...res };
    }

    async setQty(userId: string, id: string, itemId: string, quantity: number) {
        await this.own(userId, id);
        const q = cleanQty(quantity);
        if (!q) throw new BadRequestException('Quantity must be at least 1.');
        const res = await this.prisma.shoppingListItem.updateMany({ where: { id: itemId, listId: id }, data: { quantity: q } });
        if (!res.count) throw new NotFoundException('Item not found');
        return { ok: true };
    }

    async removeItem(userId: string, id: string, itemId: string) {
        await this.own(userId, id);
        await this.prisma.shoppingListItem.deleteMany({ where: { id: itemId, listId: id } });
        return { ok: true };
    }
}
