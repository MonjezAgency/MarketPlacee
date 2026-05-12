-- Add a videos array to Product.
--
-- Same shape as `images` — each entry is a public URL (uploaded
-- MP4/WebM/MOV stored under /uploads, or an https direct link the
-- supplier pasted). The frontend caps clip length at 60 seconds and
-- file size at 25 MB; YouTube / Vimeo embeds are rejected on paste
-- because the operator's rule is "short demo clips only".
--
-- Default empty array so every existing Product row stays valid.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "videos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
