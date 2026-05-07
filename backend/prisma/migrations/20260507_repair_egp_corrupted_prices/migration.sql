-- ============================================================================
-- Migration: repair products whose prices were stored as ~1.8% of real value
-- ============================================================================
--
-- BACKGROUND
-- The frontend's getActiveCurrency() defaulted to 'EGP' when the user had not
-- explicitly chosen a currency (SSR fallback + unknown-timezone branch). The
-- bulk-upload form sent that default 'EGP' tag along with the file. The
-- backend, on receipt, looked up TO_EUR['EGP'] = 0.018 and computed:
--
--     priceInBase = dto.price * 0.018
--     basePrice   = priceInBase                                    // wrong
--     price       = priceInBase * finalMarkup                       // wrong
--
-- Result: a 16.00 EUR supplier price was stored as 0.288 EUR (× 0.018), and
-- the customer-facing price as 0.317 EUR (× markup of ~1.10).
--
-- The frontend default has been corrected to 'EUR' so this can no longer
-- reproduce. This migration repairs the existing corrupted rows by reversing
-- the divisor.
--
-- IDEMPOTENCY
-- Restricted to rows with basePrice < 2.0. After running once, every repaired
-- row will have basePrice >= ~16, so a second run skips them all. Real EUR
-- prices below 2.0 are vanishingly rare in B2B wholesale (a single piece of
-- gum at €0.30 still shows up correctly because it carries a real EAN-derived
-- basePrice that matches the supplier sheet — those legit small-value rows
-- WILL be inflated by this migration if any exist, so review before running.)
--
-- TO RUN
--   prisma migrate deploy   (production)
--   prisma migrate dev      (development)
-- Or apply ad-hoc:
--   psql $DATABASE_URL -f migration.sql
-- ============================================================================

-- Repair rows where the corrupt-price signature is present.
-- Both basePrice and price were multiplied by 0.018, so dividing both by
-- 0.018 restores the original numbers.
UPDATE "Product"
SET
    "basePrice" = "basePrice" / 0.018,
    "price"     = "price"     / 0.018
WHERE "basePrice" IS NOT NULL
  AND "basePrice" < 2.0
  AND "basePrice" > 0;
