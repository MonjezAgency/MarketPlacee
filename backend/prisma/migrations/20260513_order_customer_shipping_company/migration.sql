-- Preserve the shipping company the buyer chose at checkout, so admin
-- re-assigning a different carrier later doesn't erase the original.
ALTER TABLE "Order" ADD COLUMN "customerShippingCompany" TEXT;
