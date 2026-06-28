-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('USD', 'NGN', 'EUR', 'GBP');

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeVersion" (
    "id" TEXT NOT NULL,
    "incomeSourceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomeSourceId" TEXT,
    "sourceName" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "receivedOn" DATE NOT NULL,
    "note" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeSource_userId_idx" ON "IncomeSource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeSource_userId_name_key" ON "IncomeSource"("userId", "name");

-- CreateIndex
CREATE INDEX "IncomeVersion_effectiveFrom_idx" ON "IncomeVersion"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeVersion_incomeSourceId_effectiveFrom_key" ON "IncomeVersion"("incomeSourceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "IncomeEntry_userId_receivedOn_idx" ON "IncomeEntry"("userId", "receivedOn");

-- CreateIndex
CREATE INDEX "IncomeEntry_incomeSourceId_idx" ON "IncomeEntry"("incomeSourceId");

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeVersion" ADD CONSTRAINT "IncomeVersion_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeEntry" ADD CONSTRAINT "IncomeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeEntry" ADD CONSTRAINT "IncomeEntry_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
