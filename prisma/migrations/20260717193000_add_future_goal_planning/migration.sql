CREATE TYPE "FutureGoalType" AS ENUM (
  'HOUSE',
  'CAR',
  'VACATION',
  'EDUCATION',
  'WEDDING',
  'BUSINESS',
  'OTHER'
);

CREATE TYPE "GoalFundingStrategy" AS ENUM (
  'FULL_COST',
  'DOWN_PAYMENT',
  'CUSTOM_TARGET'
);

ALTER TABLE "SavingsGoal"
  ADD COLUMN "goalType" "FutureGoalType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "fundingStrategy" "GoalFundingStrategy" NOT NULL DEFAULT 'CUSTOM_TARGET',
  ADD COLUMN "totalCost" DECIMAL(12, 2);
