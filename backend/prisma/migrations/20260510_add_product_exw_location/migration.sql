-- Add EXW (Ex Works) location to Product. Captures where the goods
-- physically sit today so the Atlantis logistics team can estimate
-- transport cost from origin and so buyers see this alongside MOQ /
-- Country of Origin on the PDP. Nullable for backfill — older
-- products without an EXW are tagged "PENDING_EXW" by the importer
-- and held in PENDING status until the supplier provides the value.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "exwLocation" TEXT;
