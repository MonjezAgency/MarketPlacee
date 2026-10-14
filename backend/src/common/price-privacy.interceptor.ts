import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from './prisma.service';
import { applyPricePrivacy, isOwnerScoped, isPriceStaff, type Markups } from './price-privacy';

/** Applies price-privacy (see price-privacy.ts) to every JSON response. */
@Injectable()
export class PricePrivacyInterceptor implements NestInterceptor {
    private cache: { at: number; m: Markups } | null = null;
    constructor(private readonly prisma: PrismaService) {}

    async markups(): Promise<Markups> {
        if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.m;
        const keys = ['MARKUP_PERCENTAGE_PIECE', 'MARKUP_PERCENTAGE', 'MARKUP_PERCENTAGE_PALLET', 'MARKUP_PERCENTAGE_CONTAINER', 'MARKUP_PERCENTAGE_MIX'];
        const rows = await this.prisma.appConfig.findMany({ where: { key: { in: keys } } }).catch(() => [] as any[]);
        const val = (k: string) => { const r = rows.find((x: any) => x.key === k); const n = r ? parseFloat(r.value) : NaN; return Number.isFinite(n) && n >= 1 ? n : null; };
        const m = {
            piece: val('MARKUP_PERCENTAGE_PIECE') ?? val('MARKUP_PERCENTAGE') ?? 1.1,
            pallet: val('MARKUP_PERCENTAGE_PALLET') ?? 1.05,
            container: val('MARKUP_PERCENTAGE_CONTAINER') ?? 1.02,
            mix: val('MARKUP_PERCENTAGE_MIX') ?? 1.15,
        };
        this.cache = { at: Date.now(), m };
        return m;
    }

    intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
        if (ctx.getType() !== 'http') return next.handle();
        const req = ctx.switchToHttp().getRequest();
        return next.handle().pipe(mergeMap((body) => from((async () => {
            const viewer = req.user ? { id: req.user.sub ?? req.user.userId, role: req.user.role } : null;
            if (!body || typeof body !== 'object' || Buffer.isBuffer(body) || isPriceStaff(viewer)) return body;
            // Copy exactly as it would be serialized (JSON.stringify, which is what
            // Nest sends) so cached objects are never mutated and nothing else changes.
            let plain: any;
            try { plain = JSON.parse(JSON.stringify(body)); } catch { return body; }
            return applyPricePrivacy(plain, viewer, await this.markups(), 0, isOwnerScoped(String(req.originalUrl || req.url || ''), viewer));
        })())));
    }
}
