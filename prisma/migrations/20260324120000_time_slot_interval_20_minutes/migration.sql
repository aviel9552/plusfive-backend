-- Replace legacy half-hour (duplicate of 30 min) with explicit 30-minutes; default new rows to 20-minutes.
UPDATE "client_permissions" SET "timeSlotInterval" = '30-minutes' WHERE "timeSlotInterval" = 'half-hour';

ALTER TABLE "client_permissions" ALTER COLUMN "timeSlotInterval" SET DEFAULT '20-minutes';
