import { Logger } from '@nestjs/common';
import { realImages } from '../catalog-rules';
import { composeCutout } from './compose';
import { parseGtin } from './gtin';
import { buildIdentity } from './identity';
import { cleanName } from './name';
import type { PipelineDeps } from './image-pipeline';
import { visionModel } from './vision';

export interface BackfillDeps {
    prisma: { product: { findMany(args: any): Promise<any[]>; update(args: any): Promise<any> } };
    pipeline: Pick<PipelineDeps, 'vision' | 'removeBackground' | 'reserveCutout' | 'style' | 'download'>;
    upload: (bytes: Buffer, name: string, type: string) => Promise<string>;
}
export interface BackfillReport { total: number; replaced: number; kept: { id: string; reason: string }[]; stopped: string | null }

const logger = new Logger('ImageBackfill');

/**
 * Every published crop still showing its own background gets the cut-out it was
 * waiting for. Vision judges the finished picture, as it does for any other; one
 * that fails keeps the crop it has. Safe to run again: a replaced product leaves the list.
 */
export async function backfillBgPending(deps: BackfillDeps, opts: { limit?: number } = {}): Promise<BackfillReport> {
    const { pipeline } = deps;
    if (!pipeline.removeBackground) throw new Error('no cut-out service');
    const rows = await deps.prisma.product.findMany({ where: { imageStatus: 'bg_pending' }, orderBy: { createdAt: 'asc' }, take: opts.limit ?? 1000, select: { id: true, ean: true, name: true, brand: true, images: true, imageCredits: true } });
    const report: BackfillReport = { total: rows.length, replaced: 0, kept: [], stopped: null };
    const style = await pipeline.style?.().catch(() => []) ?? [];
    for (const p of rows) {
        const current = realImages(p.images)[0];
        const credit = p.imageCredits?.[current];
        if (!credit?.storedOriginal) { report.kept.push({ id: p.id, reason: 'no_stored_original' }); continue; }
        const got = await (pipeline.download ?? (async () => ({ ok: false as const, reason: 'no_download' })))(credit.storedOriginal);
        if (got.ok === false) { report.kept.push({ id: p.id, reason: got.reason }); continue; }
        if (await pipeline.vision.unavailable()) { report.stopped = 'vision_unavailable'; break; }
        if (pipeline.reserveCutout && !(await pipeline.reserveCutout())) { report.stopped = 'photoroom_cap_reached'; break; }
        const made = await composeCutout(got.bytes, pipeline.removeBackground);
        if (made.status !== 'ok') { report.kept.push({ id: p.id, reason: `compose: ${made.reason}` }); continue; }
        const identity = buildIdentity(parseGtin(p.ean ?? ''), cleanName(p.name, p.brand), []);
        const [verdict] = await pipeline.vision.check(visionModel(), identity, [made.jpeg], [], style, [], 'final');
        if (!verdict.passed) { report.kept.push({ id: p.id, reason: `vision: ${verdict.failed.join(', ')}` }); continue; }
        const url = await deps.upload(made.jpeg, `pipeline-${p.ean}.jpg`, 'image/jpeg');
        const webp = await deps.upload(made.webp, `pipeline-${p.ean}.webp`, 'image/webp');
        const { [current]: old, ...others } = p.imageCredits;
        await deps.prisma.product.update({ where: { id: p.id }, data: { images: p.images.map((i: string) => (i === current ? url : i)), imageCredits: { ...others, [url]: { ...old, webp, bgPending: false, cutoutAt: new Date().toISOString() } }, imageStatus: 'approved', imageStatusReason: `vision ${verdict.confidence.toFixed(2)}, cut-out replaced the crop` } });
        report.replaced++;
        logger.log(`[backfill] ${p.id} replaced`);
    }
    return report;
}
