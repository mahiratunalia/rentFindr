-- AlterTable
ALTER TABLE "AgreementDraft" ADD COLUMN     "landlordSignature" TEXT,
ADD COLUMN     "landlordSignedAt" TIMESTAMP(3),
ADD COLUMN     "tenantSignature" TEXT,
ADD COLUMN     "tenantSignedAt" TIMESTAMP(3);
