-- Per-offer discount (single % applied across all variants).
ALTER TABLE "Offer" ADD COLUMN "discountPercent" DOUBLE PRECISION;
-- Per-variant overrides keyed by variant signature.
ALTER TABLE "Offer" ADD COLUMN "variantDiscounts" JSONB;
