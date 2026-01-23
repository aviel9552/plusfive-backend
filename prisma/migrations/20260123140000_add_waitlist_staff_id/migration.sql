-- AlterTable
ALTER TABLE "waitlist" ADD COLUMN "staffId" TEXT;

-- AddForeignKey
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
