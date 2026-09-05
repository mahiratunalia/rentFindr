-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "houseRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
