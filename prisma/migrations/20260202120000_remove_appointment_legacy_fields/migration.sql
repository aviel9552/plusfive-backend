-- Remove legacy/unused columns from appointments table
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "businessId";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "byCustomer";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "employeeId";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "businessName";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "employeeName";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "customerPhone";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "appointmentCount";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "customerFullName";