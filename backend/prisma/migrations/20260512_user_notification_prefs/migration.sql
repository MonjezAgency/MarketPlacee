-- Per-user notification preferences map.
--
-- Operator request: every user should control which notification
-- types they receive (e.g. mute "low-stock alerts" but keep "new
-- comments on my product"), and an overall "mute toast popups" flag.
--
-- Shape stored as JSONB:
--   {
--     "orderUpdates":     true,
--     "productComments":  true,
--     "lowStockAlerts":   true,
--     "inboundOffers":    true,
--     "marketingEmails":  true,
--     "muteToasts":       false
--   }
--
-- Nullable so every existing row keeps the legacy "everything on"
-- behaviour. Settings page seeds the full map on first save.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
