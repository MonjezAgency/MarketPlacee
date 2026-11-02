-- Additive only: two nullable columns and three new tables.
-- Rollback (nothing else depends on these yet):
--   DROP TABLE "ImageCandidate"; DROP TABLE "ImageJob"; DROP TABLE "ImageLookupCache";
--   ALTER TABLE "Product" DROP COLUMN "imageStatus", DROP COLUMN "imageStatusReason";
ALTER TABLE "Product" ADD COLUMN "imageStatus" TEXT, ADD COLUMN "imageStatusReason" TEXT;

CREATE TABLE "ImageJob" (
    "id" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "productId" TEXT,
    "uploadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "trace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImageJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ImageJob_gtin_key" ON "ImageJob"("gtin");
CREATE INDEX "ImageJob_status_idx" ON "ImageJob"("status");
CREATE INDEX "ImageJob_uploadId_idx" ON "ImageJob"("uploadId");

CREATE TABLE "ImageCandidate" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "licence" TEXT NOT NULL,
    "composedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImageCandidate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImageCandidate_jobId_idx" ON "ImageCandidate"("jobId");
ALTER TABLE "ImageCandidate" ADD CONSTRAINT "ImageCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImageJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ImageLookupCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImageLookupCache_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "ImageLookupCache_expiresAt_idx" ON "ImageLookupCache"("expiresAt");
