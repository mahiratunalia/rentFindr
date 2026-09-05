-- CreateEnum
CREATE TYPE "LandlordDocumentType" AS ENUM ('utility_bill', 'sublet_agreement');

-- AlterTable
ALTER TABLE "LandlordVerification" ADD COLUMN     "selfiePhotoUrl" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LandlordDocument" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "LandlordDocumentType" NOT NULL,
    "label" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandlordDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandlordDocument_profileId_idx" ON "LandlordDocument"("profileId");

-- AddForeignKey
ALTER TABLE "LandlordDocument" ADD CONSTRAINT "LandlordDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

