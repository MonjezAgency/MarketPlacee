-- Per-offer batch details required by the supplier New Offer form
-- (operator: "this is what the supplier must fill for every offer").
-- All nullable so existing rows survive the migration; the controller
-- enforces required-ness at submit time.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "productNameSnap" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "bbd"             TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "eanCode"         TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "unitsPerCase"    INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "casesPerPallet"  INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "exwLocation"     TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "leadTime"        TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "origin"          TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "offerImageUrl"   TEXT;
