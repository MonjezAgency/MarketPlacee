-- Append-only email-tracking log. SENT rows are written when an
-- email goes out, OPEN rows when the recipient's mail client loads
-- the 1×1 tracking pixel, CLICK rows when a wrapped link is clicked.
-- All keyed on trackingId so the analytics page can join them.
CREATE TABLE IF NOT EXISTS "EmailEvent" (
    "id"          TEXT NOT NULL,
    "trackingId"  TEXT NOT NULL,
    "type"        TEXT NOT NULL,           -- SENT | OPEN | CLICK | BOUNCE
    "recipient"   TEXT NOT NULL,
    "subject"     TEXT,
    "campaignId"  TEXT,
    "offerId"     TEXT,
    "linkUrl"     TEXT,
    "userAgent"   TEXT,
    "ip"          TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailEvent_trackingId_key"   ON "EmailEvent"("trackingId");
CREATE INDEX        IF NOT EXISTS "EmailEvent_campaignId_idx"   ON "EmailEvent"("campaignId");
CREATE INDEX        IF NOT EXISTS "EmailEvent_offerId_idx"      ON "EmailEvent"("offerId");
CREATE INDEX        IF NOT EXISTS "EmailEvent_recipient_idx"    ON "EmailEvent"("recipient");
CREATE INDEX        IF NOT EXISTS "EmailEvent_type_idx"         ON "EmailEvent"("type");
CREATE INDEX        IF NOT EXISTS "EmailEvent_createdAt_idx"    ON "EmailEvent"("createdAt");
