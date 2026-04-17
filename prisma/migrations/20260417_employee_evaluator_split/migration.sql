ALTER TABLE "faculty_profiles" RENAME COLUMN "teacherId" TO "employeeId";

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'EMPLOYEE', 'EVALUATOR');

ALTER TABLE "users"
ALTER COLUMN "role" TYPE "UserRole_new"
USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'ADMIN'
    WHEN 'ANALYST' THEN 'EVALUATOR'
    WHEN 'STAFF' THEN 'EMPLOYEE'
  END
)::"UserRole_new";

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
