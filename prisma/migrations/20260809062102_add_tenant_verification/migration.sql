-- CreateTable
CREATE TABLE "TenantVerification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "nidNumber" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "nidPhotoUrl" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "TenantVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantVerification_profileId_key" ON "TenantVerification"("profileId");

-- AddForeignKey
ALTER TABLE "TenantVerification" ADD CONSTRAINT "TenantVerification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
