-- Add a per-variant stock map to Product.
--
-- Suppliers list configurable products (Size: Small/Medium/Large) and
-- need to track how many of each combination they actually have in
-- the warehouse — "Small: 12, Medium: 0, Large: 4" instead of one
-- lumped count. The variantStock column stores a flat
--   { "Size=Small": 12, "Size=Large|Flavour=Vanilla": 4 }
-- map, where each KEY is the deterministic variant signature
-- (groups sorted alphabetically, joined by "|").
--
-- The existing Product.stock column stays as the global counter for
-- non-configurable products and as a quick aggregate the buyer page
-- can still read. variantStock is nullable so legacy rows keep
-- working unchanged.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "variantStock" JSONB;
