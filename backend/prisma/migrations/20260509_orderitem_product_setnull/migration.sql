-- Allow admins to delete products even after orders have been placed against
-- them. Order history is preserved: OrderItem keeps its quantity + price
-- snapshot and a name snapshot, but the productId column nulls out when the
-- product is removed.

-- 1) Add the snapshot column for product name (preserves history when product is deleted)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "productNameSnapshot" TEXT;

-- 2) Backfill snapshot from the linked product where possible
UPDATE "OrderItem" oi
SET "productNameSnapshot" = p.name
FROM "Product" p
WHERE oi."productId" = p.id
  AND oi."productNameSnapshot" IS NULL;

-- 3) Make productId nullable
ALTER TABLE "OrderItem" ALTER COLUMN "productId" DROP NOT NULL;

-- 4) Replace the foreign key with one that uses ON DELETE SET NULL
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_productId_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
