-- Persisted history of every sent Newsletter campaign. The HTML is
-- stored verbatim so the admin can re-open and re-send any past
-- campaign from the History tab without rebuilding it block-by-block.
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id"         TEXT NOT NULL,
    "subject"    TEXT NOT NULL,
    "html"       TEXT NOT NULL,
    "audience"   TEXT NOT NULL,                    -- PLATFORM | NEWSLETTER
    "sentCount"  INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "status"     TEXT NOT NULL DEFAULT 'SENT',     -- SENT | DRAFT | FAILED
    "sentBy"     TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Campaign_createdAt_idx" ON "Campaign"("createdAt");
CREATE INDEX IF NOT EXISTS "Campaign_status_idx" ON "Campaign"("status");
