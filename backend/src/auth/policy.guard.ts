import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class PolicyGuard implements CanActivate {
    constructor(private prisma: PrismaService, private reflector: Reflector) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            return false;
        }

        // Staff bypass — anyone with a platform-management role skips
        // the ownership check. Previously only ADMIN bypassed, which
        // meant OWNER/MODERATOR/SUPPORT users hit a "You do not have
        // permission to access this resource" 403 even though they
        // legitimately manage every order/product on the platform.
        const role = String(user.role || '').toUpperCase();
        if (['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'LOGISTICS'].includes(role)) {
            return true;
        }

        const handler = context.getHandler();
        const checkOwnership = this.reflector.get<string>(
            'checkOwnership',
            handler,
        );

        if (!checkOwnership) {
            return true;
        }

        const resourceId = request.params.id;
        if (!resourceId) {
            return true;
        }

        // Dynamic ownership check based on resource type
        let isOwner = false;

        switch (checkOwnership) {
            case 'PRODUCT':
                const product = await this.prisma.product.findUnique({
                    where: { id: resourceId },
                    select: { supplierId: true },
                });
                isOwner = product?.supplierId === user.sub;
                break;
            case 'ORDER': {
                // An order has TWO legitimate owners: the customer who
                // placed it AND every supplier whose products appear in
                // it. Previously only the customer was checked, so the
                // supplier clicked "Confirm Order" → PATCH bounced back
                // with a 403 → frontend showed "You do not have
                // permission to access this resource". Now both paths
                // pass.
                const order = await this.prisma.order.findUnique({
                    where: { id: resourceId },
                    select: {
                        customerId: true,
                        supplierId: true,
                        items: {
                            select: { product: { select: { supplierId: true } } },
                        },
                    },
                });
                if (!order) {
                    isOwner = false;
                    break;
                }
                if (order.customerId === user.sub) {
                    isOwner = true;
                    break;
                }
                // Direct supplierId on the order (set when the order was
                // routed to a single supplier).
                if (order.supplierId && order.supplierId === user.sub) {
                    isOwner = true;
                    break;
                }
                // Otherwise: does the caller supply any product on the
                // order? That's how multi-supplier orders qualify the
                // supplier as an "owner of the line they care about".
                isOwner = order.items.some(it => it.product?.supplierId === user.sub);
                break;
            }
            // Add more resources as needed
        }

        if (!isOwner) {
            throw new ForbiddenException('You do not have permission to access this resource');
        }

        return true;
    }
}
