import { Injectable, Logger, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extname } from 'path';
import * as crypto from 'crypto';

const KYC_BUCKET = 'kyc-documents';
const PRODUCT_BUCKET = 'product-images';
// Same bucket as images but tagged in a `videos/` prefix so we can
// audit storage cost separately. Public so the buyer's <video> tag
// can stream it without a signed URL.
const PRODUCT_VIDEO_BUCKET = 'product-videos';
// Signed URL valid for 1 hour — admin reviews within this window
const SIGNED_URL_EXPIRES_IN = 3600;

@Injectable()
export class SupabaseStorageService implements OnModuleInit {
    private readonly client: SupabaseClient;
    private readonly logger = new Logger(SupabaseStorageService.name);

    constructor() {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
            this.logger.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — KYC uploads will fail');
        }

        this.client = createClient(url ?? '', key ?? '', {
            auth: { persistSession: false },
        });
    }

    async onModuleInit() {
        try {
            await this.ensureBucketExists();
            this.logger.log('Supabase buckets verified.');
        } catch (err) {
            this.logger.error('Failed to initialize Supabase buckets:', err.message);
        }
    }

    /**
     * Upload a product image to a public bucket.
     * Returns a public URL.
     */
    async uploadProductImage(
        fileBuffer: Buffer,
        originalName: string,
        mimeType: string,
    ): Promise<string> {
        // Fail fast with an actionable message if Supabase env vars are
        // missing — previously this produced an opaque
        // "Failed to upload product image" 500 with no clue why, and
        // customers saw a generic "Upload failed" toast on avatar upload.
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const reason = 'Image upload service is not configured on the server. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on Railway and redeploy.';
            this.logger.error(`[PRODUCT_UPLOAD_FAIL] ${reason}`);
            throw new InternalServerErrorException(reason);
        }

        const ext = extname(originalName) || '.jpg';
        const uniqueName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
        const storagePath = `public/${uniqueName}`;

        const { error } = await this.client.storage
            .from(PRODUCT_BUCKET)
            .upload(storagePath, fileBuffer, {
                contentType: mimeType,
                upsert: false,
            });

        if (error) {
            // Surface the real Supabase error to the API consumer instead
            // of swallowing it. Common causes: bucket doesn't exist,
            // RLS policy blocking the service role, file too large.
            this.logger.error(`[PRODUCT_UPLOAD_FAIL] ${error.message}`, error);
            throw new InternalServerErrorException(
                `Image upload failed: ${error.message}. Check Supabase bucket "${PRODUCT_BUCKET}" exists + service role key is valid.`,
            );
        }

        const { data } = this.client.storage
            .from(PRODUCT_BUCKET)
            .getPublicUrl(storagePath);

        return data.publicUrl;
    }

    /**
     * Upload a short product demo video to a public bucket. Returns
     * a public URL the PDP can stream with a native <video> tag.
     *
     * Caller is responsible for enforcing duration / size limits —
     * we cap the request body at 25 MB in the controller and reject
     * non-video mime types there too. The bucket is created with a
     * 30 MB ceiling as a defence-in-depth.
     */
    async uploadProductVideo(
        fileBuffer: Buffer,
        originalName: string,
        mimeType: string,
    ): Promise<string> {
        const ext = extname(originalName) || '.mp4';
        const uniqueName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
        const storagePath = `public/${uniqueName}`;

        const { error } = await this.client.storage
            .from(PRODUCT_VIDEO_BUCKET)
            .upload(storagePath, fileBuffer, {
                contentType: mimeType,
                upsert: false,
            });

        if (error) {
            this.logger.error(`[PRODUCT_VIDEO_UPLOAD_FAIL] ${error.message}`);
            throw new InternalServerErrorException('Failed to upload product video.');
        }

        const { data } = this.client.storage
            .from(PRODUCT_VIDEO_BUCKET)
            .getPublicUrl(storagePath);

        return data.publicUrl;
    }

    /**
     * Upload a KYC file buffer to Supabase Storage.
     * Returns the storage path (not a public URL — use getSignedUrl to view it).
     */
    async uploadKycFile(
        userId: string,
        fileBuffer: Buffer,
        originalName: string,
        mimeType: string,
    ): Promise<string> {
        const ext = extname(originalName) || '.jpg';
        const uniqueName = `${crypto.randomBytes(12).toString('hex')}${ext}`;
        const storagePath = `${userId}/${uniqueName}`;

        const { error } = await this.client.storage
            .from(KYC_BUCKET)
            .upload(storagePath, fileBuffer, {
                contentType: mimeType,
                upsert: false,
            });

        if (error) {
            this.logger.error(`[SUPABASE_UPLOAD_FAIL] ${error.message}`);
            throw new InternalServerErrorException('Failed to upload KYC file. Please try again.');
        }

        this.logger.log(`[SUPABASE_UPLOAD] Uploaded KYC file: ${storagePath}`);
        // Return the storage path — we generate signed URLs on-demand
        return `supabase://${KYC_BUCKET}/${storagePath}`;
    }

    /**
     * Generate a temporary signed URL for a stored KYC file.
     * The URL expires after SIGNED_URL_EXPIRES_IN seconds.
     */
    async getSignedUrl(storagePath: string): Promise<string> {
        // Parse supabase://bucket/path format
        const path = storagePath.replace(/^supabase:\/\/[^/]+\//, '');

        const { data, error } = await this.client.storage
            .from(KYC_BUCKET)
            .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);

        if (error || !data?.signedUrl) {
            this.logger.error(`[SUPABASE_SIGNED_URL_FAIL] ${error?.message}`);
            throw new InternalServerErrorException('Could not generate secure file URL.');
        }

        return data.signedUrl;
    }

    /**
     * Delete a KYC file from Supabase Storage.
     */
    async deleteKycFile(storagePath: string): Promise<void> {
        const path = storagePath.replace(/^supabase:\/\/[^/]+\//, '');
        const { error } = await this.client.storage.from(KYC_BUCKET).remove([path]);
        if (error) {
            this.logger.warn(`[SUPABASE_DELETE_FAIL] ${error.message} — path: ${path}`);
        }
    }

    /**
     * Ensure buckets exist (called on app startup).
     */
    async ensureBucketExists(): Promise<void> {
        const { data: buckets } = await this.client.storage.listBuckets();
        
        // KYC Bucket
        if (!buckets?.some(b => b.name === KYC_BUCKET)) {
            await this.client.storage.createBucket(KYC_BUCKET, { public: false });
        }

        // Product Bucket
        if (!buckets?.some(b => b.name === PRODUCT_BUCKET)) {
            await this.client.storage.createBucket(PRODUCT_BUCKET, {
                public: true,
                fileSizeLimit: 15 * 1024 * 1024 // 15MB
            });
        }

        // Product Video Bucket — 30 MB ceiling. Frontend rejects clips
        // longer than 60 seconds and the controller caps the request
        // body at 25 MB, so the bucket limit is just defence-in-depth.
        if (!buckets?.some(b => b.name === PRODUCT_VIDEO_BUCKET)) {
            await this.client.storage.createBucket(PRODUCT_VIDEO_BUCKET, {
                public: true,
                fileSizeLimit: 30 * 1024 * 1024, // 30 MB
            });
        }
    }
}
