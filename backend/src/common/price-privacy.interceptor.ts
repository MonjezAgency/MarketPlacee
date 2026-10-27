import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from './prisma.service';
import { readMarkups } from './markups';
import { applyPricePrivacy, isOwnerScoped, isPriceStaff, type Markups } from './price-privacy';

/** Applies price-privacy (see price-privacy.ts) to every JSON response. */
@Injectable()
export class PricePrivacyInterceptor implements NestInterceptor {
    constructor(private readonly prisma: PrismaService) {}

    markups(): Promise<Markups> { return readMarkups(this.prisma); }

    intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
        if (ctx.getType() !== 'http') return next.handle();
        const req = ctx.switchToHttp().getRequest();
        return next.handle().pipe(mergeMap((body) => from((async () => {
            const viewer = req.user ? { id: req.user.sub ?? req.user.userId, role: req.user.role } : null;
            // Downloads are built by their handler, which applies price privacy itself (e.g. users/me/data-export).
            if (!body || typeof body !== 'object' || Buffer.isBuffer(body) || body instanceof StreamableFile || isPriceStaff(viewer)) return body;
            // Copy exactly as it would be serialized (JSON.stringify, which is what
            // Nest sends) so cached objects are never mutated and nothing else changes.
            let plain: any;
            try { plain = JSON.parse(JSON.stringify(body)); } catch { return body; }
            return applyPricePrivacy(plain, viewer, await this.markups(), 0, isOwnerScoped(String(req.originalUrl || req.url || ''), viewer));
        })())));
    }
}
