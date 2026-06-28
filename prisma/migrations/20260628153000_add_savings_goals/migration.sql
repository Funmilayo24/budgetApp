CREATE TABLE "SavingsGoal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "targetAmount" DECIMAL(12,2) NOT NULL,
  "currency" "CurrencyCode" NOT NULL DEFAULT 'USD',
  "deadline" DATE NOT NULL,
  "notes" VARCHAR(240),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavingsContribution" (
  "id" TEXT NOT NULL,
  "savingsGoalId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "savedOn" DATE NOT NULL,
  "note" VARCHAR(160),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SavingsContribution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavingsGoal_userId_archivedAt_idx" ON "SavingsGoal"("userId", "archivedAt");

CREATE INDEX "SavingsGoal_deadline_idx" ON "SavingsGoal"("deadline");

CREATE INDEX "SavingsContribution_savingsGoalId_savedOn_idx" ON "SavingsContribution"("savingsGoalId", "savedOn");

CREATE INDEX "SavingsContribution_savedOn_idx" ON "SavingsContribution"("savedOn");

ALTER TABLE "SavingsGoal"
  ADD CONSTRAINT "SavingsGoal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavingsContribution"
  ADD CONSTRAINT "SavingsContribution_savingsGoalId_fkey"
  FOREIGN KEY ("savingsGoalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
