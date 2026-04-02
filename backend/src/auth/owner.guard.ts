import {
    Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';

/**
 * OwnerGuard — يسمح فقط لـ OWNER بالوصول.
 * يُستخدم على endpoints الحساسة جداً (تغيير الصلاحيات، إلغاء العضويات، إلخ).
 */
@Injectable()
export class OwnerGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const { user } = context.switchToHttp().getRequest();
        if (!user || user.role !== 'OWNER') {
            throw new ForbiddenException('هذه الصفحة للمالك فقط');
        }
        return true;
    }
}
