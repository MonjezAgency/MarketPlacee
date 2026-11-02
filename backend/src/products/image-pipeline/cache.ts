import type { PrismaService } from '../../common/prisma.service';
import type { LookupCache } from './http';

/** The 30-day answer cache, in the database, so a restart or a re-run spends nothing. */
export class PrismaLookupCache implements LookupCache {
    constructor(private readonly prisma: PrismaService, private readonly now: () => number = Date.now) {}

    async get(key: string) {
        const row = await this.prisma.imageLookupCache.findUnique({ where: { key } });
        return row && row.expiresAt.getTime() > this.now() ? row.value : undefined;
    }

    async set(key: string, value: unknown, days: number) {
        const expiresAt = new Date(this.now() + days * 86_400_000);
        const json = (value ?? {}) as object;
        await this.prisma.imageLookupCache.upsert({ where: { key }, create: { key, value: json, expiresAt }, update: { value: json, expiresAt } });
    }
}
