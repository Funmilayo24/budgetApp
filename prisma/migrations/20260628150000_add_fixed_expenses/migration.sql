CREATE TABLE "FixedExpense" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" "CurrencyCode" NOT NULL DEFAULT 'USD',
  "categoryId" TEXT,
  "dueDay" INTEGER,
  "startMonth" DATE NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FixedExpense_userId_active_idx" ON "FixedExpense"("userId", "active");

CREATE INDEX "FixedExpense_categoryId_idx" ON "FixedExpense"("categoryId");

CREATE INDEX "FixedExpense_startMonth_idx" ON "FixedExpense"("startMonth");

ALTER TABLE "FixedExpense"
  ADD CONSTRAINT "FixedExpense_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixedExpense"
  ADD CONSTRAINT "FixedExpense_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
