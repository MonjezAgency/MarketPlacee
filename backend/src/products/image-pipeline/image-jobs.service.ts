import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SupabaseStorageService } from '../../storage/supabase-storage.service';
import { barcodeProblem, missingForPublish, normaliseBarcode, realImages } from '../catalog-rules';
import { ProductsService } from '../products.service';
import { sniffImage } from '../supplier-import.service';
import { PrismaBudget, PrismaCache, serperCap } from './budget';
import { buildPipeline } from './factory';
import { downloadImage } from './http';
import { decide, type RowOutcome } from './image-outcome';
import { SOURCE_DOWN, type ImagePipeline, type PipelineDeps } from './image-pipeline';
import type { PipelineResult } from './types';

const AT_ONCE = 4;
/** A row running this long lost its worker. */
const STUCK_MS = 15 * 60 * 1000;
/** Waiting rows let back in per minute after the daily reset: the quota decides how far they get. */
const RESUME_PER_TICK = 20;
/** A waiting row is let back in this long after its last try, so an outage isn't hammered every minute. */
const RETRY_GAP_MS = 15 * 60 * 1000;
/** Tries after a source failed, about two hours of them, before the supplier is told no image was found. */
const SOURCE_RETRIES = 8;
/** No last batch after this long: the upload is treated as finished. */
const IDLE_UPLOAD_MS = 60 * 60 * 1000;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const DAILY_VISION = 50;

export const pipelineEnabled = () => (process.env.IMAGE_PIPELINE_ENABLED || '').trim() === 'true';

const isOwnStorage = (url: string) => {
    try { return new URL(url).origin === new URL((process.env.SUPABASE_URL || '').trim()).origin; } catch { return false; }
};

/** Our own storage is the one address a download may trust without the public-URL check. */
export const ownStorageDownload = (url: string) => {
    if (!isOwnStorage(url)) return downloadImage(url);
    return fetch(url, { signal: AbortSignal.timeout(45_000) }).then(async (res) => (res.ok ? { ok: true as const, bytes: Buffer.from(await res.arrayBuffer()) } : { ok: false as const, reason: `download_http_${res.status}` }), () => ({ ok: false as const, reason: 'download_failed' }));
};

/** A picture the pipeline put on the product earlier is still its own, not the supplier's, when the row runs again. */
function pipelinePicture(product: { images: unknown; imageCredits: unknown }): 'verified' | 'bg_pending' | null {
    const credit = (product.imageCredits as Record<string, any> | null)?.[realImages(product.images as string[])[0]];
    return credit?.origin === 'pipeline' ? (credit.bgPending ? 'bg_pending' : 'verified') : null;
}

/**
 * The job around ImagePipeline: rows wait in ImageRow, four run at a time, and a run
 * is safe to repeat. Nothing here runs on an existing product unless someone re-runs
 * it, and a real photo is never replaced. Off unless IMAGE_PIPELINE_ENABLED=true.
 */
@Injectable()
export class ImageJobsService {
    private readonly logger = new Logger('ImageJobs');
    private built: { pipeline: ImagePipeline; deps: PipelineDeps } | null = null;
    private running = 0;
    constructor(private readonly prisma: PrismaService, private readonly products: ProductsService, private readonly storage: SupabaseStorageService, private readonly notifications: NotificationsService) {}

    get enabled() { return pipelineEnabled(); }
    private get budget() { return new PrismaBudget(this.prisma); }
    private get engine() {
        if (!this.built) this.built = buildPipeline(new PrismaCache(this.prisma), this.budget, { download: ownStorageDownload });
        return this.built;
    }

    /** The browser names the upload, so the batches of one file meet; it is never another account's. */
    async openUpload(ownerId: string, id: string | undefined, info: { fileName?: string; catalog?: boolean }) {
        const safe = id && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined;
        if (safe) {
            const found = await this.prisma.imageUpload.findUnique({ where: { id: safe } });
            if (found && found.ownerId !== ownerId) throw new ForbiddenException('This upload belongs to another account.');
            if (found) return found;
        }
        return this.prisma.imageUpload.create({ data: { ...(safe ? { id: safe } : {}), ownerId, catalog: !!info.catalog, fileName: info.fileName?.slice(0, 200) } });
    }

    /** `blank` is what the file left empty that the product can't show: a blank stock cell is stored as 0, which is a valid stock. */
    enqueue({ blank, ...row }: { uploadId: string; productId: string; ownerId: string; sheet?: string; rowNumber?: number; name: string; ean?: string | null; photos?: string[]; blank?: string[] }) {
        return this.prisma.imageRow.create({ data: { ...row, ean: row.ean || null, photos: row.photos ?? [], ...(blank?.length ? { params: { blank } } : {}) } });
    }

    async closeUpload(id: string) {
        await this.prisma.imageUpload.updateMany({ where: { id, closedAt: null }, data: { closedAt: new Date() } });
        await this.sendSummary(id);
    }

    /** Start as many rows as there is room for. Each one finishing starts the next. */
    kick() {
        if (!this.enabled) return;
        while (this.running < AT_ONCE) {
            this.running++;
            void this.work().finally(() => { this.running--; });
        }
    }

    private async work() {
        for (;;) {
            const next = await this.prisma.imageRow.findFirst({ where: { state: 'queued' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
            if (!next) return;
            // Two instances may see the same row: only one wins it.
            const won = await this.prisma.imageRow.updateMany({ where: { id: next.id, state: 'queued' }, data: { state: 'running', startedAt: new Date(), attempts: { increment: 1 } } });
            if (won.count) await this.process(next.id).catch((e) => this.fail(next.id, e));
        }
    }

    private async fail(id: string, e: any) {
        this.logger.warn(`[job] ${id}: ${e?.message}`);
        const row = await this.prisma.imageRow.update({ where: { id }, data: { state: 'done', outcome: 'needs_attention', imageState: 'placeholder', reason: 'no_image', detail: `job_error: ${String(e?.message).slice(0, 200)}`, finishedAt: new Date() } });
        if (row.uploadId) await this.sendSummary(row.uploadId);
    }

    /** Runs every row that can run, gives back rows a dead worker left, and lets waiting rows in once vision is back. */
    @Cron(CronExpression.EVERY_MINUTE)
    async tick() {
        if (!this.enabled) return;
        await this.prisma.imageRow.updateMany({ where: { state: 'running', startedAt: { lt: new Date(Date.now() - STUCK_MS) } }, data: { state: 'queued' } });
        if (!(await this.engine.deps.vision.unavailable())) {
            const ready = await this.prisma.imageRow.findMany({ where: { state: 'waiting_vision', updatedAt: { lt: new Date(Date.now() - RETRY_GAP_MS) } }, orderBy: { updatedAt: 'asc' }, take: RESUME_PER_TICK, select: { id: true } });
            if (ready.length) await this.prisma.imageRow.updateMany({ where: { id: { in: ready.map((r) => r.id) } }, data: { state: 'queued' } });
        }
        await this.releaseVerified();
        const idle = await this.prisma.imageUpload.findMany({ where: { summarySentAt: null, OR: [{ closedAt: { not: null } }, { createdAt: { lt: new Date(Date.now() - IDLE_UPLOAD_MS) } }] }, select: { id: true }, take: 50 });
        for (const u of idle) await this.closeUpload(u.id);
        this.kick();
    }

    private async process(id: string) {
        const row = await this.prisma.imageRow.findUniqueOrThrow({ where: { id } });
        const product = row.productId ? await this.prisma.product.findUnique({ where: { id: row.productId } }) : null;
        if (!product) { await this.prisma.imageRow.update({ where: { id }, data: { state: 'done', outcome: 'needs_attention', imageState: 'placeholder', reason: 'no_image', detail: 'product_deleted', finishedAt: new Date() } }); return; }
        const hasPhoto = realImages(product.images).length > 0;
        // A real picture is never replaced, so with one there is nothing to look for: only the required fields are read again.
        const result = hasPhoto ? null : await this.engine.pipeline.run({ ean: row.ean ?? '', name: product.name, brand: product.brand, weight: product.weight, category: product.category, supplierImages: row.photos.map((url) => ({ url })) }, { policy: 'open', upload: row.uploadId ?? row.id });
        const blank: string[] = (row.params as any)?.blank ?? [];
        const missing = [...new Set([...missingForPublish(product).filter((m) => m.field !== 'images').map((m) => m.label), ...blank])];
        const verified = await this.products.mayAutoPublish(product.supplierId);
        const sourceDown = !!result?.reason.startsWith(SOURCE_DOWN);
        const sourceTries: number = (row.params as any)?.sourceTries ?? 0;
        const d = decide({ status: sourceDown && sourceTries >= SOURCE_RETRIES ? 'not_found' : result?.status ?? 'approved', hasPhoto, missing, verified });
        if (d.attach && result) await this.attach(product.id, result);
        if (d.publish) await this.products.publishFromPipeline(product.id);
        if (result) await this.prisma.product.update({ where: { id: product.id }, data: { imageStatus: result.status, imageStatusReason: result.reason.slice(0, 500) } });
        const live = await this.prisma.product.findUnique({ where: { id: product.id }, select: { status: true } });
        // A product staff took down stays down: the row says so instead of "published".
        const outcome: RowOutcome = d.outcome === 'published' && live?.status !== 'APPROVED' ? 'needs_attention' : d.outcome;
        const calls = result?.trace.calls ?? [];
        await this.prisma.imageRow.update({
            where: { id },
            data: {
                state: d.waiting ? 'waiting_vision' : 'done', outcome, imageState: pipelinePicture(product) ?? d.image, reason: d.reason ?? (outcome === 'needs_attention' ? 'missing_fields' : null),
                params: { ean: row.ean, missing, ...(blank.length ? { blank } : {}), ...(sourceDown ? { sourceTries: sourceTries + 1 } : {}) }, detail: result?.reason.slice(0, 500) ?? 'photo_kept', ...(result ? { trace: JSON.parse(JSON.stringify(result.trace)) } : {}), finishedAt: new Date(),
                visionCalls: { increment: calls.filter((c) => c.source === 'vision' && c.status !== 'cached').length },
                searches: { increment: calls.filter((c) => c.source === 'serper' && c.status === 200).length },
            },
        });
        if (row.uploadId) await this.sendSummary(row.uploadId);
        if (row.uploadId && row.outcome === 'image_preparing') await this.sendAfterWait(row.uploadId);
    }

    /**
     * Rows that passed everything and only waited for the account. Reads the account rather
     * than hooking the KYC code, so every way of verifying one counts (KYC review, owner tools).
     */
    private async releaseVerified() {
        const rows = await this.prisma.imageRow.findMany({ where: { state: 'done', outcome: 'awaiting_verification', product: { supplier: { kycStatus: 'VERIFIED' } } }, take: RESUME_PER_TICK, select: { id: true, ownerId: true } });
        const live = new Map<string, number>();
        for (const r of rows) {
            const won = await this.prisma.imageRow.updateMany({ where: { id: r.id, state: 'done', outcome: 'awaiting_verification' }, data: { state: 'running', startedAt: new Date() } });
            if (!won.count) continue;
            await this.process(r.id).catch((e) => this.fail(r.id, e));
            const after = await this.prisma.imageRow.findUnique({ where: { id: r.id }, select: { outcome: true } });
            if (after?.outcome === 'published') live.set(r.ownerId, (live.get(r.ownerId) ?? 0) + 1);
        }
        for (const [owner, count] of live) await this.notifications.notifyUser(owner, 'Your account is verified', `${count} of your products are now live.`, 'SUCCESS', { link: '/supplier/products', kind: 'IMAGE_VERIFIED_LIVE', params: { count } }).catch((e) => this.logger.warn(`[verified] ${owner}: ${e?.message}`));
    }

    /** Stored with its origin, so every picture can be audited and replaced. A real photo that appeared meanwhile stays. */
    private async attach(productId: string, result: PipelineResult) {
        const { output, chosen } = result;
        if (!output || !chosen) return false;
        const ean = result.trace.row.ean;
        const url = await this.storage.uploadProductImage(output.jpeg, `pipeline-${ean}.jpg`, 'image/jpeg');
        const webp = await this.storage.uploadProductImage(output.webp, `pipeline-${ean}.webp`, 'image/webp');
        const storedOriginal = result.status === 'bg_pending' ? await this.storage.uploadProductImage(chosen.bytes, `original-${ean}.jpg`, sniffImage(chosen.bytes) ?? 'image/jpeg') : undefined;
        const now = await this.prisma.product.findUnique({ where: { id: productId }, select: { images: true, imageCredits: true } });
        if (!now || realImages(now.images).length) return false;
        const credit = { source: chosen.source, sourceUrl: chosen.pageUrl ?? chosen.url, license: chosen.licenceLabel ?? chosen.licence, attribution: chosen.attribution, barcode: ean, addedAt: new Date().toISOString(), origin: 'pipeline', originalUrl: chosen.url, chosenBy: 'auto', webp, ...(storedOriginal ? { storedOriginal, bgPending: true } : {}) };
        await this.prisma.product.update({ where: { id: productId }, data: { images: [url], imageCredits: { ...(now.imageCredits as object | null ?? {}), [url]: credit } } });
        return true;
    }

    /** One summary per upload, sent when no row is left to run. Rows waiting for vision count as pending. */
    private async sendSummary(uploadId: string) {
        const upload = await this.prisma.imageUpload.findUnique({ where: { id: uploadId } });
        if (!upload || !upload.closedAt || upload.summarySentAt) return;
        const open = await this.prisma.imageRow.count({ where: { uploadId, state: { in: ['queued', 'running'] } } });
        if (open) return;
        const taken = await this.prisma.imageUpload.updateMany({ where: { id: uploadId, summarySentAt: null }, data: { summarySentAt: new Date() } });
        if (!taken.count) return;
        await this.notifySummary(upload, `image-upload:${uploadId}`);
    }

    /** The first summary said some images were still being prepared: a second one, once, when the last of them is decided. */
    private async sendAfterWait(uploadId: string) {
        const upload = await this.prisma.imageUpload.findUnique({ where: { id: uploadId } });
        if (!upload?.summarySentAt) return;
        if (await this.prisma.imageRow.count({ where: { uploadId, state: { in: ['queued', 'running', 'waiting_vision'] } } })) return;
        await this.notifySummary(upload, `image-upload:${uploadId}:after-wait`);
    }

    private async notifySummary(upload: { id: string; ownerId: string; catalog: boolean; fileName: string | null }, dedupeKey: string) {
        const rows = await this.prisma.imageRow.groupBy({ by: ['outcome'], where: { uploadId: upload.id }, _count: { _all: true } });
        const n = (o: RowOutcome) => rows.find((r) => r.outcome === o)?._count._all ?? 0;
        const params = { file: upload.fileName ?? '', total: rows.reduce((s, r) => s + r._count._all, 0), published: n('published'), preparing: n('image_preparing'), unverified: n('awaiting_verification'), attention: n('needs_attention') };
        const link = upload.catalog ? `/admin/products/catalog/import/status/${upload.id}` : `/supplier/products/import/status/${upload.id}`;
        await this.notifications.notifyUser(upload.ownerId, 'Your product upload is finished', `${params.total} rows: ${params.published} published, ${params.preparing} with the image being prepared, ${params.unverified} waiting for your account to be verified, ${params.attention} need your attention.`, params.attention ? 'WARNING' : 'SUCCESS', { link, kind: 'IMAGE_UPLOAD_DONE', params, dedupeKey }).catch((e) => this.logger.warn(`[summary] ${upload.id}: ${e?.message}`));
    }

    private async ownUpload(id: string, ownerId: string | null) {
        const upload = await this.prisma.imageUpload.findUnique({ where: { id } });
        // Staff work on catalog uploads only: a supplier's product stays the supplier's to edit.
        if (!upload || (ownerId === null ? !upload.catalog : upload.ownerId !== ownerId)) throw new NotFoundException('Upload not found.');
        return upload;
    }

    async uploads(ownerId: string) {
        const list = await this.prisma.imageUpload.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' }, take: 20, include: { _count: { select: { rows: true } } } });
        return list.map((u) => ({ id: u.id, fileName: u.fileName, createdAt: u.createdAt, rows: u._count.rows }));
    }

    /** What the supplier reads: no trace and no reason from the pipeline. `ownerId` null = catalog staff. */
    async uploadDetail(id: string, ownerId: string | null) {
        const upload = await this.ownUpload(id, ownerId);
        const rows = await this.prisma.imageRow.findMany({ where: { uploadId: id }, orderBy: [{ sheet: 'asc' }, { rowNumber: 'asc' }], include: { product: { select: { id: true, status: true, adminNotes: true, images: true } } } });
        return {
            id: upload.id, fileName: upload.fileName, createdAt: upload.createdAt, finished: !rows.some((r) => r.state === 'queued' || r.state === 'running'),
            rows: rows.map((r) => ({
                id: r.id, sheet: r.sheet, row: r.rowNumber, name: r.name, ean: r.ean, state: r.state, outcome: r.outcome, imageState: r.imageState, reason: r.reason, params: r.params,
                productId: r.productId, productStatus: r.product?.status ?? null, comment: r.product && ['PAUSED', 'REMOVED'].includes(r.product.status) ? r.product.adminNotes : null, image: realImages(r.product?.images)[0] ?? null,
            })),
        };
    }

    private async ownRow(id: string, ownerId: string | null) {
        const row = await this.prisma.imageRow.findUnique({ where: { id }, include: { product: true, upload: { select: { catalog: true } } } });
        if (!row || (ownerId === null ? !row.upload?.catalog : row.ownerId !== ownerId)) throw new NotFoundException('Row not found.');
        if (row.state === 'running' || row.state === 'queued') throw new BadRequestException({ code: 'BUSY', message: 'This row is already being checked.' });
        if (!row.product) throw new NotFoundException('This product no longer exists.');
        return row as typeof row & { product: NonNullable<typeof row.product> };
    }

    private async again(id: string, data: object) {
        const row = await this.prisma.imageRow.update({ where: { id }, data: { ...data, state: 'queued', outcome: null, imageState: null, reason: null, finishedAt: null } });
        this.kick();
        return { id: row.id, state: row.state };
    }

    async fixEan(id: string, ownerId: string | null, raw: string) {
        const row = await this.ownRow(id, ownerId);
        const ean = normaliseBarcode(raw);
        const problem = barcodeProblem(ean);
        if (problem) throw new BadRequestException({ code: 'INVALID_EAN', message: problem });
        const taken = await this.prisma.product.findFirst({ where: { supplierId: row.product.supplierId, ean, id: { not: row.product.id } }, select: { id: true } });
        if (taken) throw new BadRequestException({ code: 'DUPLICATE_EAN', message: 'You already have a product with this barcode.' });
        await this.products.supplierUpdate(row.product.id, row.product.supplierId, { ean });
        return this.again(id, { ean });
    }

    /** After the missing fields were filled in on the product. */
    async recheck(id: string, ownerId: string | null) {
        const row = await this.ownRow(id, ownerId);
        // A stock cell left blank is stored as 0: while it still reads 0, nothing was filled in.
        const blank: string[] = !row.product.stock ? (row.params as any)?.blank ?? [] : [];
        return this.again(id, { params: blank.length ? { blank } : Prisma.DbNull });
    }

    /** The supplier's own photo goes through the same compose and checks as any other, and is tried first. */
    async ownPhoto(id: string, ownerId: string | null, file: { buffer: Buffer; size: number } | undefined) {
        const row = await this.ownRow(id, ownerId);
        const type = file?.buffer ? sniffImage(file.buffer) : null;
        if (!type) throw new BadRequestException({ code: 'NOT_AN_IMAGE', message: 'Choose a JPEG, PNG, GIF or WebP photo.' });
        if (file!.size > MAX_PHOTO_BYTES) throw new BadRequestException({ code: 'TOO_LARGE', message: 'Choose a photo of at most 10 MB.' });
        const url = await this.storage.uploadProductImage(file!.buffer, `supplier-${row.ean ?? row.id}`, type);
        return this.again(id, { photos: [url, ...row.photos].slice(0, 5) });
    }

    /** Staff: how a product's picture was decided. */
    async traceOf(productId: string) {
        const rows = await this.prisma.imageRow.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take: 5 });
        return rows.map((r) => ({ id: r.id, state: r.state, outcome: r.outcome, imageState: r.imageState, reason: r.reason, detail: r.detail, visionCalls: r.visionCalls, searches: r.searches, attempts: r.attempts, finishedAt: r.finishedAt, trace: r.trace }));
    }

    async costs() {
        const budget = this.budget;
        return { enabled: this.enabled, serper: { used: await budget.used('serper', 'month'), cap: serperCap() }, vision: { used: await budget.used('vision', 'day'), cap: DAILY_VISION } };
    }
}
