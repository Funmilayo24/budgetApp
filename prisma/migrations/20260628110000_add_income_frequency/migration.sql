CREATE TYPE "IncomeFrequency" AS ENUM (
  'ONE_TIME',
  'WEEKLY',
  'BI_WEEKLY',
  'SEMI_MONTHLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL'
);

ALTER TABLE "IncomeSource"
  ADD COLUMN "frequency" "IncomeFrequency" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "IncomeEntry"
  ADD COLUMN "frequency" "IncomeFrequency" NOT NULL DEFAULT 'ONE_TIME';

UPDATE "IncomeEntry"
SET "frequency" = 'MONTHLY'
WHERE "incomeSourceId" IS NOT NULL;
