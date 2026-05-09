-- Supplier-side offers on existing platform products. One row =
-- one (supplier, product) pair at a chosen tier and price. Supplier
-- creates → Admin approves → email blasts to all subscribers.
CREATE TABLE IF NOT EXISTS "Offer" (
    "id"           TEXT NOT NULL,
    "supplierId"   TEXT NOT NULL,
    "productId"    TEXT NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "unit"         TEXT NOT NULL,
    "quantity"     INTEGER NOT NULL,
    "validUntil"   TIMESTAMP(3),
    "notes"        TEXT,
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes"   TEXT,
    "approvedAt"   TIMESTAMP(3),
    "approvedBy"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Offer_supplierId_idx" ON "Offer"("supplierId");
CREATE INDEX IF NOT EXISTS "Offer_productId_idx"  ON "Offer"("productId");
CREATE INDEX IF NOT EXISTS "Offer_status_idx"     ON "Offer"("status");

DO $$ BEGIN
    ALTER TABLE "Offer"
        ADD CONSTRAINT "Offer_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Offer"
        ADD CONSTRAINT "Offer_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
