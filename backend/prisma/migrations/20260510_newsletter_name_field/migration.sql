-- Newsletter clients now have an optional display name (filled by the
-- bulk-upload importer from the sheet's "Name" column) and the status
-- column gets two new logical values, BLOCKED and HIDDEN, that the
-- admin Newsletter UI uses for soft-archive / block flows.
-- Status stays a free-form string column so no enum migration needed.
ALTER TABLE "NewsletterSubscriber" ADD COLUMN IF NOT EXISTS "name" TEXT;
