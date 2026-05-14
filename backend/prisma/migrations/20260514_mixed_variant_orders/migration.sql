-- Per-variant pricing + display metadata so the supplier can give each
-- variant its own price and image for the mix-composer at checkout.
ALTER TABLE "Product" ADD COLUMN "variantPrices" JSONB;
ALTER TABLE "Product" ADD COLUMN "variantMeta"   JSONB;

-- Mixed-tier composition: per-variant breakdown when the buyer used
-- the mix composer to fill a single truck/pallet with multiple variants.
ALTER TABLE "OrderItem" ADD COLUMN "mixComposition" JSONB;
