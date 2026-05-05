-- Add orderId column to SupportMessage for order-linked conversations
ALTER TABLE "SupportMessage" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

-- Foreign key from SupportMessage.orderId → Order.id (set null on delete)
ALTER TABLE "SupportMessage"
  ADD CONSTRAINT "SupportMessage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for efficient order chat lookups
CREATE INDEX IF NOT EXISTS "SupportMessage_orderId_idx" ON "SupportMessage"("orderId");
