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

        // Admins bypass all ownership checks
        if (user.role === 'ADMIN') {
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
            case 'ORDER':
                const order = await this.prisma.order.findUnique({
                    where: { id: resourceId },
                    select: { customerId: true },
                });
                isOwner = order?.customerId === user.sub;
                break;
            // Add more resources as needed
        }

        if (!isOwner) {
            throw new ForbiddenException('You do not have permission to access this resource');
        }

        return true;
    }
}
