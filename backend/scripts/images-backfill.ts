import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { SupabaseStorageService } from '../src/storage/supabase-storage.service';
import { PrismaBudget, PrismaCache } from '../src/products/image-pipeline/budget';
import { buildPipeline, liveCutouts } from '../src/products/image-pipeline/factory';
import { backfillBgPending } from '../src/products/image-pipeline/image-backfill';
import { ownStorageDownload } from '../src/products/image-pipeline/image-jobs.service';

/** npm run images:backfill [-- --limit 50]. Refuses to spend anything unless PHOTOROOM_LIVE=true and a live key is set. */
async function main() {
    const at = process.argv.indexOf('--limit');
    const limit = at > 0 ? Number(process.argv[at + 1]) : undefined;
    if (!liveCutouts()) throw new Error('PHOTOROOM_LIVE is not true: nothing was done.');
    const prisma = new PrismaClient();
    const { deps, photoroom } = buildPipeline(new PrismaCache(prisma as any), new PrismaBudget(prisma as any), { download: ownStorageDownload });
    if (!photoroom.configured || photoroom.testMode) throw new Error('A live PHOTOROOM_API_KEY is needed: nothing was done.');
    const storage = new SupabaseStorageService();
    const report = await backfillBgPending({ prisma: prisma as any, pipeline: deps, upload: (bytes, name, type) => storage.uploadProductImage(bytes, name, type) }, { limit });
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
