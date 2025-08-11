/*
  Warnings:

  - You are about to drop the column `accountStatus` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `adCampaignSource` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `affiliateId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `affiliateLinkUrl` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `deviceInfo` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `landingPageUrl` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `stripeCustomerId` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[referralCode]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `referralCode` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "accountStatus",
DROP COLUMN "adCampaignSource",
DROP COLUMN "affiliateId",
DROP COLUMN "affiliateLinkUrl",
DROP COLUMN "deviceInfo",
DROP COLUMN "landingPageUrl",
DROP COLUMN "stripeCustomerId",
ADD COLUMN     "referralCode" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
