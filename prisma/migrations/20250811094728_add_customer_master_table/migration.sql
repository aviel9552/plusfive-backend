-- AlterTable
ALTER TABLE "users" ALTER COLUMN "referralCode" DROP NOT NULL;

-- CreateTable
CREATE TABLE "customer_master" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalVisits" INTEGER DEFAULT 0,
    "lastVisit" TIMESTAMP(3),
    "totalSpent" DOUBLE PRECISION DEFAULT 0.00,
    "rating" DOUBLE PRECISION DEFAULT 0.0,
    "lastPayment" DOUBLE PRECISION DEFAULT 0.00,
    "totalPaid" DOUBLE PRECISION DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_master_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_master_userId_customerId_key" ON "customer_master"("userId", "customerId");

-- AddForeignKey
ALTER TABLE "customer_master" ADD CONSTRAINT "customer_master_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_master" ADD CONSTRAINT "customer_master_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
