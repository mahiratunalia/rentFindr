-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateTable
CREATE TABLE "LandlordVerification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "nidNumber" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "nidPhotoUrl" TEXT,
    "ownershipProofUrl" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "LandlordVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LandlordVerification_profileId_key" ON "LandlordVerification"("profileId");

-- AddForeignKey
ALTER TABLE "LandlordVerification" ADD CONSTRAINT "LandlordVerification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
