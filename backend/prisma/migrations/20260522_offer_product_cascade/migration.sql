-- Offer.product FK had no onDelete rule (defaulted to RESTRICT), which
-- blocked admins from deleting a product that had any offer attached.
-- Switch it to ON DELETE CASCADE so removing a product also clears its
-- offers automatically.
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_productId_fkey";

ALTER TABLE "Offer"
    ADD CONSTRAINT "Offer_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
