-- Server-validated mixed pallets / truckloads + duplicate-submit protection.
ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
ALTER TABLE "OrderItem" ADD COLUMN "mixedLoadId" TEXT;

CREATE TABLE "MixedLoad" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "supplierId" TEXT,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MixedLoad_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MixedLoad_customerId_status_idx" ON "MixedLoad"("customerId", "status");
