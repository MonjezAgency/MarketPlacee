-- Add moqUnit column so suppliers can express minimum order in PIECE / CASE
-- / PALLET / TRUCK rather than only as a raw piece count.
-- Existing rows keep moq as their per-piece minimum (default PIECE).

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "moqUnit" TEXT DEFAULT 'PIECE';
