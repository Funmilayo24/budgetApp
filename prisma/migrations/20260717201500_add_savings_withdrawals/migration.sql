CREATE TYPE "SavingsEntryType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

ALTER TABLE "SavingsContribution"
  ADD COLUMN "type" "SavingsEntryType" NOT NULL DEFAULT 'DEPOSIT';
