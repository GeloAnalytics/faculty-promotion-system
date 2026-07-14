-- AlterTable
ALTER TABLE "users" ADD COLUMN "employeeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");
