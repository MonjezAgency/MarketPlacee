-- Supplier-uploaded invoice / receipt image (or PDF) attached to an order.
-- Customer + admin can view it on the respective order detail pages.
ALTER TABLE "Order" ADD COLUMN "supplierInvoiceUrl" TEXT;
