-- Add Shopify-style variant + tier snapshot columns to OrderItem.
--
-- When a buyer places an order from a configurable product (size /
-- flavour / pack / colour) the variants they picked travel with the
-- order line, so the admin and the supplier both see the exact
-- configuration that was ordered — not just "12 cases of Glucerna"
-- but "12 cases of Glucerna · Vanilla · 12-pack".
--
-- selectedVariants stores a flat {group: value} map as JSON, e.g.
--   { "Size": "Large", "Flavour": "Vanilla", "Pack": "12-pack" }
-- selectedTier records which tier (truck / pallet / case) was active
-- on the PDP at checkout time, so the admin can verify the price
-- math without re-deriving it from quantity × markup.
--
-- Both columns are nullable so existing OrderItem rows stay valid and
-- non-configurable products still write null.

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "selectedVariants" JSONB,
  ADD COLUMN IF NOT EXISTS "selectedTier" TEXT;
