-- CreateEnum
CREATE TYPE "CriterionDecision" AS ENUM ('PENDING', 'APPROVED', 'DISAPPROVED');

-- CreateTable
CREATE TABLE "criterion_reviews" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "panelKey" TEXT NOT NULL,
    "decision" "CriterionDecision" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "criterion_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "criterion_reviews_profileId_panelKey_key" ON "criterion_reviews"("profileId", "panelKey");

-- AddForeignKey
ALTER TABLE "criterion_reviews" ADD CONSTRAINT "criterion_reviews_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "faculty_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterion_reviews" ADD CONSTRAINT "criterion_reviews_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
