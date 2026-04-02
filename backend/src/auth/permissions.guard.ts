import {
    Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * PermissionsGuard — يتحقق من صلاحيات الـ User من حقل permissions (JSON array).
 *
 * الاستخدام:
 *   @RequirePermissions('manage_users', 'view_finance')
 *
 * الـ OWNER يعدي دائماً بدون فحص.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[]>('permissions', [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required || required.length === 0) return true;

        const { user } = context.switchToHttp().getRequest();
        if (!user) return false;

        // OWNER يتجاوز كل القيود
        if (user.role === 'OWNER') return true;

        const userPermissions: string[] = Array.isArray(user.permissions)
            ? user.permissions
            : [];

        const hasAll = required.every(p => userPermissions.includes(p));
        if (!hasAll) {
            throw new ForbiddenException('ليس لديك الصلاحية للقيام بهذا الإجراء');
        }
        return true;
    }
}
