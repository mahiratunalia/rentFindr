-- CreateEnum
CREATE TYPE "ImprovementCostStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SettlementMethod" AS ENUM ('deduct_from_deposit', 'deduct_from_rent', 'reimburse_separately');

-- CreateTable
CREATE TABLE "ImprovementCost" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "loggedByProfileId" TEXT NOT NULL,
    "loggedByRole" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "photoUrl" TEXT,
    "settlementMethod" "SettlementMethod" NOT NULL,
    "status" "ImprovementCostStatus" NOT NULL DEFAULT 'pending',
    "decidedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ImprovementCost_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ImprovementCost" ADD CONSTRAINT "ImprovementCost_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
