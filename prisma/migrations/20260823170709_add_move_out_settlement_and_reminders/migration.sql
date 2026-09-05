-- CreateEnum
CREATE TYPE "MoveOutStatus" AS ENUM ('proposed', 'acknowledged', 'settled', 'disputed');

-- AlterTable
ALTER TABLE "AgreementDraft" ADD COLUMN     "expiry30ReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "expiry7ReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MoveOut" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "proposedEndDate" TIMESTAMP(3) NOT NULL,
    "status" "MoveOutStatus" NOT NULL DEFAULT 'proposed',
    "tenantAcknowledgedAt" TIMESTAMP(3),
    "totalRentPaid" INTEGER NOT NULL DEFAULT 0,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "deductionsJson" JSONB NOT NULL DEFAULT '[]',
    "netRefund" INTEGER NOT NULL DEFAULT 0,
    "landlordConfirmedAt" TIMESTAMP(3),
    "tenantConfirmedAt" TIMESTAMP(3),
    "refundReference" TEXT,
    "refundLoggedAt" TIMESTAMP(3),
    "disputeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "MoveOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MoveOut_applicationId_key" ON "MoveOut"("applicationId");

-- AddForeignKey
ALTER TABLE "MoveOut" ADD CONSTRAINT "MoveOut_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
