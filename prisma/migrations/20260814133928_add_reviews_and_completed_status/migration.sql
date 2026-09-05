/*
  Warnings:

  - You are about to drop the `MaintenanceRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE 'completed';

-- DropForeignKey
ALTER TABLE "MaintenanceRequest" DROP CONSTRAINT "MaintenanceRequest_applicationId_fkey";

-- DropTable
DROP TABLE "MaintenanceRequest";

-- DropEnum
DROP TYPE "MaintenanceStatus";

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "raterProfileId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_applicationId_raterProfileId_key" ON "Review"("applicationId", "raterProfileId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_raterProfileId_fkey" FOREIGN KEY ("raterProfileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
