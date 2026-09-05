-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('pending', 'acknowledged', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "DisputeType" AS ENUM ('unlawful_eviction', 'unpaid_deposit', 'property_damage', 'other');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'resolved');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "categoryRatings" JSONB;

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrl" TEXT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "inProgressAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "filedByProfileId" TEXT NOT NULL,
    "filedByRole" TEXT NOT NULL,
    "type" "DisputeType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "evidenceJson" JSONB NOT NULL,
    "aiSummary" TEXT,
    "aiInconsistencies" JSONB,
    "aiSuggestedSplit" TEXT,
    "aiSource" TEXT,
    "resolution" TEXT,
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "senderProfileId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingMatchPreference" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "budgetCeiling" INTEGER NOT NULL,
    "commuteAnchorLabel" TEXT NOT NULL,
    "commuteAnchorLat" DOUBLE PRECISION NOT NULL,
    "commuteAnchorLng" DOUBLE PRECISION NOT NULL,
    "roomType" TEXT NOT NULL,
    "hasPets" BOOLEAN NOT NULL DEFAULT false,
    "smokes" BOOLEAN NOT NULL DEFAULT false,
    "frequentVisitors" BOOLEAN NOT NULL DEFAULT false,
    "mustHaves" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingMatchPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dispute_applicationId_idx" ON "Dispute"("applicationId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Message_applicationId_idx" ON "Message"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingMatchPreference_profileId_key" ON "ListingMatchPreference"("profileId");

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_filedByProfileId_fkey" FOREIGN KEY ("filedByProfileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderProfileId_fkey" FOREIGN KEY ("senderProfileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingMatchPreference" ADD CONSTRAINT "ListingMatchPreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
