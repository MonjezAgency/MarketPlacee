import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvoiceService } from '../invoices/invoice.service';
import { EscrowService } from '../payments/escrow.service';

const STATUS_LABELS: Record<OrderStatus, string> = {
    PENDING: 'Pending',
    PROCESSING: 'Processing',
    SHIPPED: 'Shipped',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
};

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
        private notificationsService: NotificationsService,
        private invoiceService: InvoiceService,
        private escrowService: EscrowService,
    ) { }

    async create(customerId: string, totalAmount: number, items: any[], shippingCompany?: string, shippingCost?: number) {
        const order = await this.prisma.order.create({
            data: {
                customerId,
                totalAmount,
                shippingCompany: shippingCompany ?? null,
                shippingCost: shippingCost ?? null,
                status: OrderStatus.PENDING,
                items: {
                    create: items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        price: item.price,
                    })),
                },
                history: {
                    create: {
                        newStatus: OrderStatus.PENDING,
                        changedById: customerId,
                        reason: 'Order created',
                    },
                },
            },
            include: {
                items: true,
                history: true,
                customer: { select: { email: true, name: true } },
            },
        });

        // Send Customer Confirmation Email (payment bypassed as per client request)
        if (order.customer?.email) {
            this.emailService.sendOrderConfirmationEmail(
                order.customer.email,
                order.customer.name,
                order.id,
                order.totalAmount
            ).catch(err => console.error('Failed to send order confirmation email:', err));
        }

        // Notify each supplier
        const supplierIds = [...new Set(
            order.items
                .map((item: any) => item.product?.supplierId)
                .filter(Boolean)
        )];
        for (const supplierId of supplierIds) {
            this.notificationsService.create(
                supplierId as string,
                'New Order Received',
                `You have a new order #${order.id.slice(-8).toUpperCase()} waiting for confirmation.`,
                'INFO',
                { orderId: order.id },
            ).catch(() => {});
        }

        // Notify Admins
        this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
            .then(admins => {
                for (const admin of admins) {
                    this.notificationsService.create(
                        admin.id,
                        'New Order Received',
                        `Order #${order.id.slice(-8).toUpperCase()} has been placed by ${order.customer?.name}.`,
                        'INFO',
                        { orderId: order.id }
                    ).catch(() => {});
                }
            })
            .catch(() => {});

        return order;
    }

    async findAll() {
        const orders = await this.prisma.order.findMany({
            include: {
                customer: {
                    select: { id: true, name: true, email: true, phone: true }
                },
                supplier: {
                    select: { id: true, name: true, email: true }
                },
                items: {
                    include: {
                        product: {
                            include: {
                                supplier: {
                                    select: { id: true, name: true, email: true }
                                }
                            }
                        }
                    }
                },
                history: true,
            },
        });

        // Map to format suitable for Admin Dashboard
        return orders.map(order => {
            const customerId = order.customer?.id;
            const customerName = order.customer?.name ?? 'Unknown Buyer';

            // Collect unique supplier names from order items, excluding the buyer themselves
            const supplierNamesFromItems: string[] = [];
            const supplierIdsFromItems = new Set<string>();
            for (const item of order.items) {
                const sup = item.product?.supplier;
                if (!sup) continue;
                if (sup.id === customerId) continue; // buyer bought their own product (test data)
                if (supplierIdsFromItems.has(sup.id)) continue;
                supplierIdsFromItems.add(sup.id);
                supplierNamesFromItems.push(sup.name);
            }

            // Prefer the order-level supplierId relation only if it differs from the buyer
            let supplierNames: string;
            if (order.supplier && order.supplier.id !== customerId) {
                supplierNames = order.supplier.name;
            } else if (supplierNamesFromItems.length > 0) {
                supplierNames = supplierNamesFromItems.join(', ');
            } else {
                supplierNames = 'Platform Inventory';
            }

            let supplierProfit = 0;
            for (const item of order.items) {
                supplierProfit += item.price * item.quantity;
            }
            const feePercent = Number(process.env.PLATFORM_FEE_PERCENT) || 5;
            const adminProfit = order.totalAmount * (feePercent / 100);

            return {
                id: order.id,
                customer: customerName,
                customerEmail: order.customer?.email,
                customerPhone: order.customer?.phone,
                supplier: supplierNames,
                total: order.totalAmount,
                supplierProfit,
                adminProfit,
                status: order.status,
                date: order.createdAt.toISOString().split('T')[0],
                shippingCompany: order.shippingCompany,
                shippingCost: order.shippingCost,
                items: order.items.map(i => ({
                    product: i.product?.name ?? 'Unknown Product',
                    quantity: i.quantity,
                    price: i.price,
                })),
            };
        });
    }

    async findByBuyer(customerId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where: { customerId },
                include: {
                    items: {
                        include: {
                            product: { select: { id: true, name: true, images: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.order.count({ where: { customerId } }),
        ]);
        return { data: orders, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findByIdForBuyer(orderId: string, customerId: string) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, customerId },
            include: {
                items: {
                    include: {
                        product: { select: { id: true, name: true, images: true, supplier: { select: { name: true } } } },
                    },
                },
                history: { orderBy: { createdAt: 'asc' } },
            },
        });
        if (!order) throw new NotFoundException('Order not found');
        return order;
    }

    async findBySupplier(supplierId: string) {
        const orders = await this.prisma.order.findMany({
            where: {
                items: { some: { product: { supplierId } } },
            },
            include: {
                customer: { select: { id: true, name: true, email: true } },
                items: {
                    where: { product: { supplierId } },
                    include: { product: { select: { id: true, name: true, images: true, supplierId: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return orders.map(order => ({
            id: order.id,
            status: order.status,
            totalAmount: order.totalAmount,
            shippingCompany: order.shippingCompany,
            createdAt: order.createdAt,
            customer: {
                name: order.customer?.name ? order.customer.name.split(' ').map((p, i) => i === 0 ? p[0] + '***' : p[0] + '***').join(' ') : 'Customer',
                email: order.customer?.email ? order.customer.email.replace(/^(.{2}).*@/, '$1***@') : '',
            },
            items: order.items.map(item => ({
                id: item.id,
                productId: item.productId,
                name: item.product.name,
                image: item.product.images?.[0] ?? null,
                quantity: item.quantity,
                price: item.price,
            })),
        }));
    }

    // ─── Admin Stats ─────────────────────────────────────────────────
    async countPending(): Promise<number> {
        return this.prisma.order.count({
            where: { status: OrderStatus.PENDING },
        });
    }

    async getOrderStats() {
        const [pending, processing, shipped, delivered, cancelled, total] = await Promise.all([
            this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
            this.prisma.order.count({ where: { status: OrderStatus.PROCESSING } }),
            this.prisma.order.count({ where: { status: OrderStatus.SHIPPED } }),
            this.prisma.order.count({ where: { status: OrderStatus.DELIVERED } }),
            this.prisma.order.count({ where: { status: OrderStatus.CANCELLED } }),
            this.prisma.order.count(),
        ]);

        // Total revenue in EGP (all non-cancelled orders)
        const revenueResult = await this.prisma.order.aggregate({
            where: { status: { not: OrderStatus.CANCELLED } },
            _sum: { totalAmount: true },
        });

        return {
            pending,
            processing,
            shipped,
            delivered,
            cancelled,
            total,
            totalRevenue: revenueResult._sum.totalAmount || 0,
        };
    }

    // ─── Update Status ───────────────────────────────────────────────
    async updateStatus(orderId: string, status: OrderStatus, changedById: string, reason?: string) {
        return this.internalUpdateStatus(orderId, status, changedById, reason);
    }

    async bulkUpdateStatus(orderIds: string[], status: OrderStatus, changedById: string) {
        const results = [];
        for (const orderId of orderIds) {
            try {
                const updated = await this.internalUpdateStatus(orderId, status, changedById, `Bulk update to ${status}`);
                results.push({ orderId, success: true });
            } catch (err: any) {
                results.push({ orderId, success: false, error: err.message });
            }
        }
        return results;
    }

    private async internalUpdateStatus(orderId: string, status: OrderStatus, changedById: string, reason?: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: { select: { email: true, name: true } },
                items: {
                    include: {
                        product: {
                            include: {
                                supplier: { select: { id: true, name: true, email: true } }
                            }
                        }
                    }
                },
            },
        });

        if (!order) throw new NotFoundException(`Order ${orderId} not found`);

        const previousStatus = order.status;

        // Update order status + create history entry
        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                status,
                history: {
                    create: {
                        previousStatus,
                        newStatus: status,
                        changedById,
                        reason: reason || `Status changed to ${STATUS_LABELS[status] || status}`,
                    },
                },
            },
            include: {
                items: true,
                history: true,
                customer: { select: { email: true, name: true } },
            },
        });

        // Send email notification to customer
        try {
            const statusLabel = STATUS_LABELS[status] || status;
            await this.emailService.sendMail(
                order.customer.email,
                `Order #${orderId.slice(-8).toUpperCase()} — ${statusLabel}`,
                `<p>Hi ${order.customer.name},</p>
                       <p>Your order <strong>#${orderId.slice(-8).toUpperCase()}</strong> status has been updated to <strong>${statusLabel}</strong>.</p>
                       ${reason ? `<p>Note: ${reason}</p>` : ''}
                       <p>— Atlantis Marketplace</p>`
            );
        } catch (e) {
            console.error(`[ORDER_EMAIL_FAIL] ${orderId}:`, e);
        }

        // Notify each supplier involved
        const supplierIds = [...new Set(
            order.items.map((item: any) => item.product?.supplier?.id).filter(Boolean)
        )];
        for (const supplierId of supplierIds) {
            this.notificationsService.create(
                supplierId as string,
                `Order ${STATUS_LABELS[status] || status}`,
                `Order #${orderId.slice(-8).toUpperCase()} has been updated to ${STATUS_LABELS[status] || status}.`,
                'INFO',
                { orderId },
            ).catch(() => {});
        }

        // Handle invoice generation on delivery
        if (status === OrderStatus.DELIVERED) {
            try {
                await this.invoiceService.createInvoiceForOrder(orderId);
            } catch (e) {
                console.error(`[ORDER_INVOICE_FAIL] ${orderId}:`, e);
            }
        }

        // Handle Escrow Void/Refund on Cancellation
        if (status === OrderStatus.CANCELLED) {
            try {
                const escrow = await this.prisma.escrowTransaction.findUnique({ where: { orderId } });
                if (escrow) {
                    if (escrow.status === 'HOLDING') {
                        await this.escrowService.voidEscrow(orderId, reason || 'Order cancelled by admin/supplier');
                    } else if (escrow.status === 'RELEASED' || escrow.status === 'CAPTURED') {
                        await this.escrowService.refundEscrow(orderId, reason || 'Order cancelled/refunded');
                    }
                }
            } catch (err: any) {
                console.error(`[ORDER_CANCEL_ESCROW_ERROR] Failed for ${orderId}:`, err.message);
            }
        }

        return updated;
    }


    // ─── Supplier Analytics ───────────────────────────────────────────

    async getSupplierAnalytics(supplierId: string, days: number) {
        const since = new Date(Date.now() - days * 86_400_000);

        // All orders that contain at least one product owned by this supplier
        const orders = await this.prisma.order.findMany({
            where: {
                createdAt: { gte: since },
                items: { some: { product: { supplierId } } },
            },
            include: {
                items: {
                    where: { product: { supplierId } },
                    include: { product: { select: { id: true, name: true, basePrice: true, category: true } } },
                },
            },
        });

        // Revenue = sum of item.price * item.quantity (customer-facing prices)
        let totalRevenue = 0;
        let totalItems = 0;
        const productMap: Record<string, { name: string; orders: number; revenue: number; category: string }> = {};
        const categoryMap: Record<string, number> = {};

        for (const order of orders) {
            if (order.status === 'CANCELLED') continue;
            for (const item of order.items) {
                const lineTotal = item.price * item.quantity;
                totalRevenue += lineTotal;
                totalItems += item.quantity;
                const pid = item.product?.id ?? 'unknown';
                const pname = item.product?.name ?? 'Unknown';
                const cat = item.product?.category ?? 'Other';
                if (!productMap[pid]) productMap[pid] = { name: pname, orders: 0, revenue: 0, category: cat };
                productMap[pid].orders += item.quantity;
                productMap[pid].revenue += lineTotal;
                categoryMap[cat] = (categoryMap[cat] ?? 0) + lineTotal;
            }
        }

        // Monthly revenue buckets (last 7 months)
        const monthlyMap: Record<string, { revenue: number; orders: number }> = {};
        for (const order of orders) {
            if (order.status === 'CANCELLED') continue;
            const key = new Date(order.createdAt).toLocaleString('en-US', { month: 'short', year: '2-digit' });
            if (!monthlyMap[key]) monthlyMap[key] = { revenue: 0, orders: 0 };
            monthlyMap[key].orders += 1;
            for (const item of order.items) monthlyMap[key].revenue += item.price * item.quantity;
        }

        const topProducts = Object.entries(productMap)
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const categoryBreakdown = Object.entries(categoryMap)
            .map(([name, value]) => ({ name, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value);

        const activeProducts = await this.prisma.product.count({
            where: { supplierId, status: 'APPROVED' },
        });

        const totalOrders = orders.filter(o => o.status !== 'CANCELLED').length;
        const deliveredOrders = orders.filter(o => o.status === 'DELIVERED').length;

        return {
            totalRevenue,
            totalOrders,
            deliveredOrders,
            totalItems,
            activeProducts,
            conversionRate: totalOrders > 0 ? ((deliveredOrders / totalOrders) * 100).toFixed(1) : '0',
            monthlyData: Object.entries(monthlyMap).map(([month, v]) => ({ month, ...v })),
            topProducts,
            categoryBreakdown,
        };
    }

    async findByIdWithItems(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                images: true,
                                price: true,
                            }
                        }
                    }
                },
                customer: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                },
                supplier: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        stripeAccountId: true,
                        stripeOnboarded: true,
                    }
                }
            }
        });

        if (!order) {
            throw new NotFoundException(
                `Order ${orderId} not found`
            );
        }

        return order;
    }

    async confirmDelivery(orderId: string, customerId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.customerId !== customerId) {
            throw new ForbiddenException('This order does not belong to you');
        }
        if (order.status !== OrderStatus.SHIPPED) {
            throw new BadRequestException(
                `Order must be SHIPPED to confirm delivery. Current status: ${order.status}`
            );
        }
        return this.updateStatus(orderId, OrderStatus.DELIVERED, customerId, 'Customer confirmed delivery');
    }
}
