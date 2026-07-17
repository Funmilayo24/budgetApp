-- Add user ownership without discarding legacy records. Existing shared records
-- are assigned to the oldest account when one exists. Records from a database
-- that has never had an account remain unassigned and are not exposed by the API.
ALTER TABLE "Transaction" ADD COLUMN "userId" TEXT;
ALTER TABLE "MonthlyBudget" ADD COLUMN "userId" TEXT;

UPDATE "Transaction"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "MonthlyBudget"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "userId" IS NULL;

DROP INDEX "MonthlyBudget_categoryId_month_key";

CREATE UNIQUE INDEX "MonthlyBudget_userId_categoryId_month_key"
  ON "MonthlyBudget"("userId", "categoryId", "month");
CREATE INDEX "MonthlyBudget_userId_month_idx" ON "MonthlyBudget"("userId", "month");
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MonthlyBudget"
  ADD CONSTRAINT "MonthlyBudget_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
