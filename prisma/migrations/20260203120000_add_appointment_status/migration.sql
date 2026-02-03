-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('booked', 'cancelled', 'scheduled');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "appointmentStatus" "AppointmentStatus" NOT NULL DEFAULT 'booked';
