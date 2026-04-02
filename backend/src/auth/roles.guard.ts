import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredRoles) {
            return true;
        }
        const { user } = context.switchToHttp().getRequest();
        if (!user || !user.role) return false;

        // OWNER يتجاوز كل قيود الصلاحيات تلقائياً
        if (user.role.toUpperCase() === 'OWNER') return true;

        return requiredRoles.some((role) => user.role.toUpperCase() === role.toUpperCase());
    }
}
