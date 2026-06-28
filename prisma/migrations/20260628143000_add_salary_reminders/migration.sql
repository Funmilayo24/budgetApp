CREATE TYPE "ReminderType" AS ENUM ('SALARY_PLANNING');

ALTER TABLE "IncomeSource"
  ADD COLUMN "paymentDay" INTEGER;

UPDATE "IncomeSource" AS source
SET "paymentDay" = EXTRACT(DAY FROM first_version."effectiveFrom")::INTEGER
FROM (
  SELECT DISTINCT ON ("incomeSourceId") "incomeSourceId", "effectiveFrom"
  FROM "IncomeVersion"
  ORDER BY "incomeSourceId", "effectiveFrom" ASC
) AS first_version
WHERE source."id" = first_version."incomeSourceId"
  AND source."isFixed" = true
  AND source."paymentDay" IS NULL;

CREATE TABLE "ReminderEmail" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "incomeSourceId" TEXT,
  "type" "ReminderType" NOT NULL DEFAULT 'SALARY_PLANNING',
  "dueOn" DATE NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "reason" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReminderEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReminderEmail_dueOn_idx" ON "ReminderEmail"("dueOn");

CREATE INDEX "ReminderEmail_userId_idx" ON "ReminderEmail"("userId");

CREATE UNIQUE INDEX "ReminderEmail_userId_incomeSourceId_type_dueOn_key"
  ON "ReminderEmail"("userId", "incomeSourceId", "type", "dueOn");

ALTER TABLE "ReminderEmail"
  ADD CONSTRAINT "ReminderEmail_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReminderEmail"
  ADD CONSTRAINT "ReminderEmail_incomeSourceId_fkey"
  FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
