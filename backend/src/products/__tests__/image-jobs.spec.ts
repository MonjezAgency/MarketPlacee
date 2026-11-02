import { Prisma } from '@prisma/client';
import { decide } from '../image-pipeline/image-outcome';
import { backfillBgPending } from '../image-pipeline/image-backfill';
import { ImageJobsService, ownStorageDownload } from '../image-pipeline/image-jobs.service';
import { composeCrop } from '../image-pipeline/compose';
import { packBox, rawRgb } from '../image-pipeline/pixels';
import { sharp } from '../image-pipeline/sharp';

const none = { status: 'not_found' as const, hasPhoto: false, missing: [], verified: true };

describe('what a pipeline result means for the product', () => {
    it('a verified picture goes on and the product is published', () => {
        expect(decide({ ...none, status: 'approved' })).toMatchObject({ attach: true, publish: true, image: 'verified', outcome: 'published', reason: null });
    });
    it('a crop is published and marked for the cut-out', () => {
        expect(decide({ ...none, status: 'bg_pending' })).toMatchObject({ attach: true, publish: true, image: 'bg_pending', outcome: 'published' });
    });
    it.each([['not_found', 'no_image'], ['failed', 'no_image'], ['needs_review', 'not_verified'], ['needs_better_image', 'not_verified'], ['low_res', 'photo_too_small'], ['invalid_ean', 'invalid_ean']] as const)('%s: not published, the supplier is told %s', (status, reason) => {
        expect(decide({ ...none, status })).toMatchObject({ attach: false, publish: false, outcome: 'needs_attention', reason });
    });
    it('a verified picture on a row with a field missing: attached, not published, supplier told', () => {
        expect(decide({ ...none, status: 'approved', missing: ['Price'] })).toMatchObject({ attach: true, publish: false, outcome: 'needs_attention', reason: 'missing_fields' });
    });
    it('quota gone: stays a draft, waits for the reset, nothing attached', () => {
        expect(decide({ ...none, status: 'pending_vision' })).toMatchObject({ attach: false, publish: false, waiting: true, image: 'pending_vision', outcome: 'image_preparing', reason: null });
    });
    it('quota gone with a field missing: stays a draft and still resumes', () => {
        expect(decide({ ...none, status: 'pending_vision', missing: ['Price'] })).toMatchObject({ waiting: true, outcome: 'needs_attention', reason: 'missing_fields' });
    });
    it('an unverified supplier: picture attached, still a draft, told why', () => {
        expect(decide({ ...none, status: 'approved', verified: false })).toMatchObject({ attach: true, publish: false, outcome: 'awaiting_verification', reason: null });
        expect(decide({ ...none, status: 'bg_pending', verified: false })).toMatchObject({ attach: true, publish: false, outcome: 'awaiting_verification' });
        expect(decide({ ...none, status: 'approved', hasPhoto: true, verified: false })).toMatchObject({ publish: false, outcome: 'awaiting_verification' });
    });
    it('an unverified supplier with a problem: the problem comes first', () => {
        expect(decide({ ...none, status: 'approved', missing: ['Price'], verified: false })).toMatchObject({ publish: false, outcome: 'needs_attention', reason: 'missing_fields' });
        expect(decide({ ...none, verified: false })).toMatchObject({ publish: false, outcome: 'needs_attention', reason: 'no_image' });
        expect(decide({ ...none, status: 'pending_vision', verified: false })).toMatchObject({ publish: false, waiting: true, outcome: 'image_preparing' });
    });
    it('a real photo is never replaced', () => {
        for (const status of ['approved', 'bg_pending'] as const) expect(decide({ ...none, status, hasPhoto: true })).toMatchObject({ attach: false, image: 'kept' });
    });
});

describe('crop to the pack', () => {
    const scene = () => sharp({ create: { width: 1600, height: 1600, channels: 3, background: '#88aacc' } }).composite([{ input: { create: { width: 500, height: 1000, channels: 3, background: '#113355' } }, left: 550, top: 300 }]).jpeg().toBuffer();

    it('finds the pack on a plain backdrop and centres it at 880 on the 1000 canvas', async () => {
        const input = await scene();
        const box = packBox(await rawRgb(input, 500));
        expect(box).not.toBeNull();
        const made = await composeCrop(input, box!);
        expect(made.status).toBe('ok');
        if (made.status !== 'ok') return;
        expect(await sharp(made.jpeg).metadata()).toMatchObject({ width: 1000, height: 1000 });
        expect(made.checks.longestSide).toBe(880);
    });
    it('never enlarges past 1.5x', async () => {
        const made = await composeCrop(await sharp({ create: { width: 500, height: 500, channels: 3, background: '#88aacc' } }).jpeg().toBuffer(), [0.1, 0.1, 0.9, 0.9]);
        expect(made.status).toBe('low_res');
    });
});

describe('downloads from storage', () => {
    const was = process.env.SUPABASE_URL;
    afterAll(() => { process.env.SUPABASE_URL = was; });
    it('a look-alike of our own address gets the public-URL check, not the trust', async () => {
        process.env.SUPABASE_URL = 'http://127.0.0.1:9999';
        expect(await ownStorageDownload('http://127.0.0.1:9999.evil.test/x.jpg')).toMatchObject({ ok: false });
        expect(await ownStorageDownload('http://127.0.0.2/x.jpg')).toMatchObject({ ok: false, reason: expect.stringMatching(/unsafe/) });
    });
});

function jobs(rows: any[], uploads: any[] = [], products: any = {}) {
    const prisma: any = {
        imageRow: {
            findUnique: jest.fn(async ({ where }: any) => { const r = rows.find((x) => x.id === where.id); return r ? { ...r, product: r.product ?? { id: 'p', supplierId: 's1' }, upload: r.upload ?? { catalog: false } } : null; }),
            update: jest.fn(async ({ where, data }: any) => ({ ...rows.find((x) => x.id === where.id), ...data })),
            groupBy: jest.fn(async () => [{ outcome: 'published', _count: { _all: 2 } }, { outcome: 'needs_attention', _count: { _all: 1 } }]),
            count: jest.fn(async () => 0),
            findMany: jest.fn(async () => rows),
        },
        imageUpload: { findUnique: jest.fn(async ({ where }: any) => uploads.find((u) => u.id === where.id) ?? null), updateMany: jest.fn(async () => ({ count: 1 })), create: jest.fn(async ({ data }: any) => data) },
        product: { findFirst: jest.fn(async () => null) },
    };
    const service = new ImageJobsService(prisma, products, { uploadProductImage: jest.fn(async () => 'https://store/x.jpg') } as any, { notifyUser: jest.fn(async () => undefined) } as any);
    jest.spyOn(service, 'kick').mockImplementation(() => undefined);
    return { service, prisma };
}

describe('uploads and rows', () => {
    it('another account\'s row and another account\'s upload do not exist for you', async () => {
        const { service } = jobs([{ id: 'r', ownerId: 's1', state: 'done', ean: '5449000000439', photos: [] }], [{ id: 'u', ownerId: 's1', catalog: false }]);
        await expect(service.uploadDetail('u', 's2')).rejects.toMatchObject({ status: 404 });
        await expect(service.fixEan('r', 's2', '5449000000439')).rejects.toMatchObject({ status: 404 });
        await expect(service.ownPhoto('r', 's2', { buffer: Buffer.from('x'), size: 1 })).rejects.toMatchObject({ status: 404 });
    });
    it('staff reach catalog uploads only: a supplier product stays the supplier\'s', async () => {
        const { service } = jobs([{ id: 'r', ownerId: 's1', state: 'done', photos: [] }], [{ id: 'u', ownerId: 's1', catalog: false }]);
        await expect(service.uploadDetail('u', null)).rejects.toMatchObject({ status: 404 });
        await expect(service.fixEan('r', null, '5449000000439')).rejects.toMatchObject({ status: 404 });
    });
    it('an upload id of someone else cannot be joined', async () => {
        const id = '11111111-1111-4111-8111-111111111111';
        const { service } = jobs([], [{ id, ownerId: 's1' }]);
        await expect(service.openUpload('s2', id, {})).rejects.toMatchObject({ status: 403 });
    });
    it('the supplier reads no trace and no pipeline reason', async () => {
        const row = { id: 'r', sheet: 'S', rowNumber: 2, name: 'N', ean: '1', state: 'done', outcome: 'needs_attention', imageState: 'placeholder', reason: 'no_image', params: {}, productId: 'p', detail: 'internal', trace: { secret: 1 }, product: { id: 'p', status: 'DRAFT', adminNotes: null, images: [] } };
        const { service } = jobs([row], [{ id: 'u', ownerId: 's1', catalog: false }]);
        const out = await service.uploadDetail('u', 's1');
        expect(out.rows[0]).not.toHaveProperty('trace');
        expect(out.rows[0]).not.toHaveProperty('detail');
    });
    it('the supplier sees the staff comment only on a product staff took down', async () => {
        const row = (status: string) => ({ id: status, name: 'N', state: 'done', product: { id: 'p', status, adminNotes: 'Wrong pack', images: [] } });
        const { service } = jobs([row('PAUSED'), row('APPROVED')], [{ id: 'u', ownerId: 's1', catalog: false }]);
        const out = await service.uploadDetail('u', 's1');
        expect(out.rows.map((r) => r.comment)).toEqual(['Wrong pack', null]);
    });
    it('a wrong barcode is refused before anything runs', async () => {
        const products: any = { supplierUpdate: jest.fn() };
        const { service } = jobs([{ id: 'r', ownerId: 's1', state: 'done', photos: [] }], [], products);
        await expect(service.fixEan('r', 's1', '123')).rejects.toMatchObject({ status: 400 });
        expect(products.supplierUpdate).not.toHaveBeenCalled();
    });
    it('a fixed barcode runs again, and a busy row does not', async () => {
        const products: any = { supplierUpdate: jest.fn(async () => ({})) };
        const { service, prisma } = jobs([{ id: 'r', ownerId: 's1', state: 'done', photos: [] }, { id: 'busy', ownerId: 's1', state: 'running', photos: [] }], [], products);
        await service.fixEan('r', 's1', '5449000000439');
        expect(prisma.imageRow.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ean: '5449000000439', state: 'queued' }) }));
        await expect(service.fixEan('busy', 's1', '5449000000439')).rejects.toMatchObject({ status: 400 });
    });
    it('a photo that is not one is refused', async () => {
        const { service } = jobs([{ id: 'r', ownerId: 's1', state: 'done', photos: [] }]);
        await expect(service.ownPhoto('r', 's1', { buffer: Buffer.from('not a picture'), size: 13 })).rejects.toMatchObject({ status: 400 });
    });
    it('off by default', () => {
        delete process.env.IMAGE_PIPELINE_ENABLED;
        expect(jobs([]).service.enabled).toBe(false);
    });
    it('the summary goes out once, and only when no row is left to run', async () => {
        const { service, prisma } = jobs([], [{ id: 'u', ownerId: 's1', closedAt: new Date(), summarySentAt: null, fileName: 'a.xlsx' }]);
        const notify = (service as any).notifications.notifyUser;
        prisma.imageRow.count.mockResolvedValueOnce(3);
        await (service as any).sendSummary('u');
        expect(notify).not.toHaveBeenCalled();
        await (service as any).sendSummary('u');
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][4]).toMatchObject({ kind: 'IMAGE_UPLOAD_DONE', dedupeKey: 'image-upload:u', params: { total: 3, published: 2, attention: 1, preparing: 0, unverified: 0 } });
    });
});

describe('a blank cell from the file', () => {
    it('is kept for the row, and cleared when the supplier asks for a check after filling it in', async () => {
        const rows = [{ id: 'r1', ownerId: 's1', params: { blank: ['Stock (cases)'] } }];
        const { service, prisma } = jobs(rows);
        await service.recheck('r1', 's1');
        expect(prisma.imageRow.update.mock.calls[0][0].data.params).toBe(Prisma.DbNull);
    });
});

describe('an account verified later', () => {
    it('publishes its complete drafts and says so once, per account', async () => {
        const rows = [{ id: 'r1', ownerId: 's1', productId: 'p1', outcome: 'awaiting_verification', state: 'done', photos: [] }, { id: 'r2', ownerId: 's1', productId: 'p2', outcome: 'awaiting_verification', state: 'done', photos: [] }];
        const { service, prisma } = jobs(rows);
        prisma.imageRow.updateMany = jest.fn(async () => ({ count: 1 }));
        (service as any).process = jest.fn(async (id: string) => { rows.find((r) => r.id === id)!.outcome = 'published'; });
        await (service as any).releaseVerified();
        expect((service as any).process).toHaveBeenCalledTimes(2);
        expect(prisma.imageRow.findMany.mock.calls[0][0].where).toMatchObject({ outcome: 'awaiting_verification', product: { supplier: { kycStatus: 'VERIFIED' } } });
        const notify = (service as any).notifications.notifyUser;
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][4]).toMatchObject({ kind: 'IMAGE_VERIFIED_LIVE', params: { count: 2 } });
    });
    it('two instances: only the one that wins the row runs it', async () => {
        const { service, prisma } = jobs([{ id: 'r1', ownerId: 's1', outcome: 'awaiting_verification', state: 'done', photos: [] }]);
        prisma.imageRow.updateMany = jest.fn(async () => ({ count: 0 }));
        (service as any).process = jest.fn();
        await (service as any).releaseVerified();
        expect((service as any).process).not.toHaveBeenCalled();
    });
});

describe('the second summary', () => {
    const upload = { id: 'u1', ownerId: 's1', catalog: false, fileName: 'a.xlsx', summarySentAt: new Date() };
    it('goes once the last waiting row is decided, under its own key', async () => {
        const { service } = jobs([], [upload]);
        await (service as any).sendAfterWait('u1');
        expect((service as any).notifications.notifyUser.mock.calls[0][4].dedupeKey).toBe('image-upload:u1:after-wait');
    });
    it('waits while a row is still waiting', async () => {
        const { service, prisma } = jobs([], [upload]);
        prisma.imageRow.count = jest.fn(async () => 1);
        await (service as any).sendAfterWait('u1');
        expect((service as any).notifications.notifyUser).not.toHaveBeenCalled();
    });
});

describe('backfill of crops, with a mocked Photoroom', () => {
    const cut = async (image: Buffer) => {
        const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let p = 0; p < info.width * info.height; p++) { const x = p % info.width, y = Math.floor(p / info.width); data[p * 4 + 3] = x >= 300 && x < 900 && y >= 100 && y < 1100 ? 255 : 0; }
        return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    };
    const setup = async (over: any = {}, verdict: any = { passed: true, confidence: 0.95, failed: [] }) => {
        const original = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: '#88aacc' } }).composite([{ input: { create: { width: 600, height: 1000, channels: 3, background: '#113355' } }, left: 300, top: 100 }]).jpeg().toBuffer();
        const row = { id: 'p1', ean: '5449000000439', name: 'Acme Lemon 500ml', brand: 'Acme', images: ['https://s/crop.jpg'], imageCredits: { 'https://s/crop.jpg': { source: 'serper', sourceUrl: 'https://x', license: 'unknown', storedOriginal: 'https://s/o.jpg', bgPending: true } } };
        const prisma = { product: { findMany: jest.fn(async () => [row]), update: jest.fn(async () => ({})) } };
        const removeBackground = jest.fn(cut);
        const pipeline: any = { vision: { unavailable: async () => null, check: jest.fn(async () => [verdict]) }, removeBackground, reserveCutout: jest.fn(async () => true), style: async () => [], download: async () => ({ ok: true, bytes: original }), ...over };
        const upload = jest.fn(async (_b: Buffer, name: string) => `https://s/${name}`);
        return { prisma, pipeline, upload, removeBackground };
    };

    it('replaces the crop with the cut-out vision passed, and keeps the origin', async () => {
        const { prisma, pipeline, upload, removeBackground } = await setup();
        const report = await backfillBgPending({ prisma, pipeline, upload } as any);
        expect(report).toMatchObject({ total: 1, replaced: 1, kept: [] });
        expect(removeBackground).toHaveBeenCalledTimes(1);
        const data = (prisma.product.update.mock.calls as any)[0][0].data;
        expect(data.imageStatus).toBe('approved');
        expect(data.images).toEqual(['https://s/pipeline-5449000000439.jpg']);
        expect(data.imageCredits['https://s/pipeline-5449000000439.jpg']).toMatchObject({ source: 'serper', sourceUrl: 'https://x', license: 'unknown', bgPending: false });
        expect(data.imageCredits['https://s/crop.jpg']).toBeUndefined();
    });
    it('a cut-out vision refuses leaves the crop alone', async () => {
        const { prisma, pipeline, upload } = await setup({}, { passed: false, confidence: 0.5, failed: ['edges_clean'] });
        const report = await backfillBgPending({ prisma, pipeline, upload } as any);
        expect(report.replaced).toBe(0);
        expect(report.kept[0].reason).toMatch(/edges_clean/);
        expect(prisma.product.update).not.toHaveBeenCalled();
    });
    it('Photoroom failing leaves the crop alone', async () => {
        const { prisma, pipeline, upload } = await setup({ removeBackground: jest.fn(async () => { throw new Error('down'); }) });
        const report = await backfillBgPending({ prisma, pipeline, upload } as any);
        expect(report.kept[0].reason).toMatch(/photoroom_failed/);
        expect(prisma.product.update).not.toHaveBeenCalled();
    });
    it('stops at the spending cap and at the vision quota, without paying first', async () => {
        const a = await setup({ reserveCutout: async () => false });
        expect((await backfillBgPending({ prisma: a.prisma, pipeline: a.pipeline, upload: a.upload } as any)).stopped).toBe('photoroom_cap_reached');
        expect(a.removeBackground).not.toHaveBeenCalled();
        const b = await setup({ vision: { unavailable: async () => 'vision_quota', check: jest.fn() } });
        expect((await backfillBgPending({ prisma: b.prisma, pipeline: b.pipeline, upload: b.upload } as any)).stopped).toBe('vision_unavailable');
        expect(b.removeBackground).not.toHaveBeenCalled();
    });
});

describe('staff control after publishing', () => {
    const { ProductsService } = require('../products.service');
    const actor = { id: 'staff', role: 'ADMIN', name: 'Staff' };
    const svc = (product: any, owner: any = { role: 'SUPPLIER', kycStatus: 'VERIFIED' }) => {
        const s = Object.create(ProductsService.prototype);
        s.prisma = { product: { findUnique: jest.fn(async () => product), update: jest.fn(async ({ data }: any) => ({ ...product, ...data })) }, user: { findUnique: jest.fn(async () => owner) } };
        s.review = { record: jest.fn(async () => undefined) };
        s.notificationsService = { notifyUser: jest.fn(async () => undefined) };
        s.priceHistory = { record: jest.fn(async () => undefined) };
        s.logger = { warn: jest.fn() };
        s.findOne = jest.fn(async () => product);
        return s;
    };
    const live = { id: 'p', name: 'Acme', status: 'APPROVED', supplierId: 's1' };

    it('no comment, no take-down', async () => {
        const s = svc(live);
        await expect(s.takeDown('p', 'pause', '   ', actor)).rejects.toMatchObject({ status: 400 });
        expect(s.prisma.product.update).not.toHaveBeenCalled();
    });
    it('pause keeps the comment for the supplier, records who, and tells them', async () => {
        const s = svc(live);
        await s.takeDown('p', 'pause', 'Pack shown is the old design', actor);
        expect(s.prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAUSED', adminNotes: 'Pack shown is the old design' } }));
        expect(s.review.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAUSED', actor }));
        expect(s.notificationsService.notifyUser.mock.calls[0][4]).toMatchObject({ kind: 'PRODUCT_PAUSED', params: { reason: 'Pack shown is the old design' } });
    });
    it('remove keeps the record', async () => {
        const s = svc(live);
        await s.takeDown('p', 'remove', 'Discontinued', actor);
        expect(s.prisma.product.update.mock.calls[0][0].data.status).toBe('REMOVED');
    });
    it('only a live product can be paused', async () => {
        await expect(svc({ ...live, status: 'DRAFT' }).takeDown('p', 'pause', 'x', actor)).rejects.toMatchObject({ status: 400 });
    });
    it('re-publish needs a complete product, and only a taken-down one', async () => {
        await expect(svc(live).republish('p', actor)).rejects.toMatchObject({ status: 400 });
        await expect(svc({ ...live, status: 'PAUSED', images: [] }).republish('p', actor)).rejects.toMatchObject({ status: 400 });
    });
    it('the pipeline never re-publishes what staff took down', async () => {
        for (const status of ['PAUSED', 'REMOVED', 'REJECTED']) {
            const s = svc({ ...live, status });
            expect(await s.publishFromPipeline('p')).toBe(false);
            expect(s.prisma.product.update).not.toHaveBeenCalled();
        }
    });
    describe('auto-publish', () => {
        const full = { ...live, ...{ name: 'Acme Lemon', brand: 'Acme', category: 'Beverages', ean: '5449000000439', origin: 'Spain', exwLocation: 'Madrid', weight: '500 ml', price: 10, stock: 5, unitsPerCase: 12, casesPerPallet: 80, unit: 'piece', moq: 1, moqUnit: 'CASE', images: [] }, status: 'DRAFT', supplierId: 's', images: ['https://s/a.jpg'] };
        it('a placeholder alone is never enough, and neither is a paused one to re-publish', async () => {
            expect(await svc({ ...full, images: [] }).publishFromPipeline('p')).toBe(false);
            await expect(svc({ ...full, status: 'PAUSED', images: [], imageStatus: 'pending_vision' }).republish('p', actor)).rejects.toMatchObject({ status: 400 });
        });
        it('a verified supplier publishes', async () => {
            expect(await svc(full).publishFromPipeline('p')).toBe(true);
        });
        it.each(['UNVERIFIED', 'PENDING', 'REJECTED'])('a %s supplier stays a draft', async (kycStatus) => {
            const s = svc(full, { role: 'SUPPLIER', kycStatus });
            expect(await s.publishFromPipeline('p')).toBe(false);
            expect(s.prisma.product.update).not.toHaveBeenCalled();
        });
        it('the catalog account has no KYC and publishes', async () => {
            expect(await svc(full, { role: 'OWNER', kycStatus: 'UNVERIFIED' }).publishFromPipeline('p')).toBe(true);
        });
    });
});
