-- Store max advance and cancel window in minutes (same as constants), instead of weeks/hours.
-- This keeps DB values aligned with CLIENT_PERMISSIONS_TIME_OPTIONS (e.g. 10, 180, 30240).

-- Add new columns with defaults (safe if already exist)
ALTER TABLE "client_permissions" ADD COLUMN IF NOT EXISTS "maxAdvanceBookingMinutes" INTEGER NOT NULL DEFAULT 30240;
ALTER TABLE "client_permissions" ADD COLUMN IF NOT EXISTS "cancelBeforeMinutes" INTEGER NOT NULL DEFAULT 180;

-- Migrate existing data only when old columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_permissions' AND column_name = 'maxAdvanceBookingWeeks') THEN
    UPDATE "client_permissions"
    SET
      "maxAdvanceBookingMinutes" = ROUND(COALESCE("maxAdvanceBookingWeeks", 3) * 7 * 24 * 60),
      "cancelBeforeMinutes" = ROUND(COALESCE("cancelBeforeHours", 3) * 60);
  END IF;
END $$;

-- Drop old columns
ALTER TABLE "client_permissions" DROP COLUMN IF EXISTS "maxAdvanceBookingWeeks";
ALTER TABLE "client_permissions" DROP COLUMN IF EXISTS "cancelBeforeHours";
