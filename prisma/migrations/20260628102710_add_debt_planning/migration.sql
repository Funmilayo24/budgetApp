-- CreateEnum
CREATE TYPE "DebtCategory" AS ENUM ('CREDIT_CARD', 'PERSONAL_LOAN', 'MORTGAGE', 'STUDENT_LOAN', 'FAMILY_LOAN', 'CAR_FINANCE', 'BUY_NOW_PAY_LATER', 'OTHER');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'PAID', 'ARCHIVED');

-- CreateTable
CREATE TABLE "SalaryCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" "DebtCategory" NOT NULL DEFAULT 'OTHER',
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "currentBalance" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "interestRate" DECIMAL(5,2),
    "minimumPayment" DECIMAL(12,2),
    "dueDay" INTEGER,
    "notes" VARCHAR(500),
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "paidAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPaymentPlan" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "salaryCycleId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "note" VARCHAR(240),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtPaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "salaryCycleId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" VARCHAR(240),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryCycle_userId_idx" ON "SalaryCycle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryCycle_userId_month_key" ON "SalaryCycle"("userId", "month");

-- CreateIndex
CREATE INDEX "Debt_userId_status_idx" ON "Debt"("userId", "status");

-- CreateIndex
CREATE INDEX "Debt_userId_category_idx" ON "Debt"("userId", "category");

-- CreateIndex
CREATE INDEX "Debt_deletedAt_idx" ON "Debt"("deletedAt");

-- CreateIndex
CREATE INDEX "DebtPaymentPlan_salaryCycleId_idx" ON "DebtPaymentPlan"("salaryCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtPaymentPlan_debtId_salaryCycleId_key" ON "DebtPaymentPlan"("debtId", "salaryCycleId");

-- CreateIndex
CREATE INDEX "DebtPayment_debtId_idx" ON "DebtPayment"("debtId");

-- CreateIndex
CREATE INDEX "DebtPayment_salaryCycleId_idx" ON "DebtPayment"("salaryCycleId");

-- CreateIndex
CREATE INDEX "DebtPayment_paidOn_idx" ON "DebtPayment"("paidOn");

-- AddForeignKey
ALTER TABLE "SalaryCycle" ADD CONSTRAINT "SalaryCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPaymentPlan" ADD CONSTRAINT "DebtPaymentPlan_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPaymentPlan" ADD CONSTRAINT "DebtPaymentPlan_salaryCycleId_fkey" FOREIGN KEY ("salaryCycleId") REFERENCES "SalaryCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_salaryCycleId_fkey" FOREIGN KEY ("salaryCycleId") REFERENCES "SalaryCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
