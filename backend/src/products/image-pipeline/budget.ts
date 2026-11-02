import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { PrismaService } from '../../common/prisma.service';

/** Counters that survive a restart, so a limit is a limit and not a per-process hope. All dates are UTC. */
export type Period = 'day' | 'month' | 'ever';
export interface Budget {
    /** Takes one. False when the limit is reached, and nothing is taken. */
    reserve(name: string, limit: number, period: Period): Promise<boolean>;
    used(name: string, period: Period): Promise<number>;
}

export const SERPER_DEFAULT_CAP = 200;
export const serperCap = () => Number(process.env.SERPER_MONTHLY_CAP) || SERPER_DEFAULT_CAP;
/** Paid cut-outs allowed for this test, counted across runs. */
export const PHOTOROOM_DEFAULT_CAP = 60;
export const photoroomCap = () => Number(process.env.PHOTOROOM_CAP) || PHOTOROOM_DEFAULT_CAP;

/**
 * What each barcode database gives for nothing. A source that isn't listed has
 * no free allowance we can prove, so it isn't called. Barcode Spider's only free
 * use is its trial, so it needs BARCODESPIDER_TRIAL_UNTIL set to the trial's end.
 */
export const FREE_ALLOWANCE: Record<string, { limit: number; period: Period }> = {
    upcitemdb: { limit: 100, period: 'day' },
    'ean-db': { limit: 250, period: 'ever' },
    'go-upc': { limit: 150, period: 'month' },
    'barcode-spider': { limit: 100, period: 'day' },
};

export function periodKey(name: string, period: Period, now: number) {
    const iso = new Date(now).toISOString();
    return period === 'ever' ? name : `${name}:${iso.slice(0, period === 'day' ? 10 : 7)}`;
}

export class MemoryBudget implements Budget {
    private readonly map = new Map<string, number>();
    constructor(private readonly now: () => number = Date.now) {}
    async used(name: string, period: Period) { return this.map.get(periodKey(name, period, this.now())) ?? 0; }
    async reserve(name: string, limit: number, period: Period) {
        const key = periodKey(name, period, this.now());
        const used = this.map.get(key) ?? 0;
        if (used >= limit) return false;
        this.map.set(key, used + 1);
        return true;
    }
}

/** For local scripts: a gitignored JSON file. */
export class FileBudget implements Budget {
    constructor(private readonly file: string, private readonly now: () => number = Date.now) {}
    private read(): Record<string, number> { return existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {}; }
    async used(name: string, period: Period) { return this.read()[periodKey(name, period, this.now())] ?? 0; }
    async reserve(name: string, limit: number, period: Period) {
        const all = this.read();
        const key = periodKey(name, period, this.now());
        const used = all[key] ?? 0;
        if (used >= limit) return false;
        all[key] = used + 1;
        writeFileSync(this.file, JSON.stringify(all, null, 1));
        return true;
    }
}

/** One from the allowance in `AppConfig`, with no two callers getting the same one. Fails closed. */
export async function reserveCount(prisma: PrismaService, key: string, limit: number): Promise<boolean> {
    for (let i = 0; i < 6; i++) {
        const row = await prisma.appConfig.findUnique({ where: { key } });
        const used = Number(row?.value) || 0;
        if (used >= limit) return false;
        if (!row) {
            if (await prisma.appConfig.create({ data: { key, value: '1' } }).then(() => true, () => false)) return true;
            continue;
        }
        const r = await prisma.appConfig.updateMany({ where: { key, value: row.value }, data: { value: String(used + 1) } });
        if (r.count) return true;
    }
    return false;
}

export class PrismaBudget implements Budget {
    constructor(private readonly prisma: PrismaService, private readonly now: () => number = Date.now) {}
    private key(name: string, period: Period) { return `imagePipeline:budget:${periodKey(name, period, this.now())}`; }
    async used(name: string, period: Period) {
        const row = await this.prisma.appConfig.findUnique({ where: { key: this.key(name, period) } });
        return Number(row?.value) || 0;
    }
    reserve(name: string, limit: number, period: Period) { return reserveCount(this.prisma, this.key(name, period), limit).catch(() => false); }
}
