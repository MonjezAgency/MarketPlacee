-- Add NEEDS_CHANGES to the ProductStatus enum so the admin can
-- send a comment to the supplier ("the photo is blurry, please
-- re-upload" / "EXW missing", etc.). Supplier sees the comment
-- on their /supplier/products page, fixes the row, clicks
-- "Resend for Review" to flip the status back to PENDING.
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'NEEDS_CHANGES';
