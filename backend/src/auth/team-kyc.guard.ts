import {
    Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * TeamKycGuard — يمنع أعضاء الفريق من الوصول لو KYC مش Verified.
 *
 * الأدوار المطلوب منها KYC: ADMIN, MODERATOR, SUPPORT, EDITOR, DEVELOPER, LOGISTICS
 * الـ OWNER و SUPPLIER و CUSTOMER مش داخلين هنا (OWNER فوق الكل، الباقيين عندهم حماية تانية).
 */
const TEAM_ROLES = new Set(['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS']);

@Injectable()
export class TeamKycGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const { user } = context.switchToHttp().getRequest();
        if (!user) return false;

        // OWNER معفي — بيعدي دائماً
        if (user.role === 'OWNER') return true;

        // لو مش في الفريق — مش شغل الـ guard ده
        if (!TEAM_ROLES.has(user.role?.toUpperCase())) return true;

        // تحقق من KYC
        const dbUser = await this.prisma.user.findUnique({
            where: { id: user.sub },
            select: { kycStatus: true },
        });

        if (dbUser?.kycStatus !== 'VERIFIED') {
            throw new ForbiddenException(
                'يجب إكمال التحقق من الهوية (KYC) قبل الوصول للوحة التحكم. يرجى رفع وثائقك للمراجعة.',
            );
        }

        return true;
    }
}
