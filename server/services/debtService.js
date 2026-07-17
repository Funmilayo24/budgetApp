const prisma = require("../prisma");

const allowedCurrencies = new Set(["USD", "NGN", "EUR", "GBP"]);
const debtCategories = [
  "CREDIT_CARD",
  "PERSONAL_LOAN",
  "MORTGAGE",
  "STUDENT_LOAN",
  "FAMILY_LOAN",
  "CAR_FINANCE",
  "BUY_NOW_PAY_LATER",
  "OTHER"
];

async function listPlanning(userId, monthValue) {
  const month = parseMonth(monthValue);
  const cycle = await getOrCreateSalaryCycle(userId, month);

  // Repair legacy or externally-updated debts whose balance reached zero
  // without their lifecycle status being updated.
  await prisma.debt.updateMany({
    where: {
      userId,
      deletedAt: null,
      status: "ACTIVE",
      currentBalance: { lte: 0 }
    },
    data: {
      currentBalance: 0,
      status: "PAID",
      paidAt: new Date()
    }
  });

  const debts = await prisma.debt.findMany({
    where: {
      userId,
      deletedAt: null,
      status: {
        in: ["ACTIVE", "PAID"]
      }
    },
    include: {
      paymentPlans: {
        where: { salaryCycleId: cycle.id }
      },
      payments: {
        where: { salaryCycleId: cycle.id },
        orderBy: { paidOn: "desc" }
      }
    },
    orderBy: [
      { status: "asc" },
      { currentBalance: "desc" },
      { name: "asc" }
    ]
  });

  return {
    month: toMonthValue(month),
    categories: debtCategories,
    currencies: [...allowedCurrencies],
    summary: buildPlanningSummary(debts),
    debts: debts.filter((debt) => debt.status === "ACTIVE").map(serializeDebtForPlanning),
    completedDebts: debts.filter((debt) => debt.status === "PAID").map(serializeDebtForPlanning)
  };
}

async function createDebt(userId, input) {
  const name = String(input.name || "").trim();
  const category = parseDebtCategory(input.category);
  const currency = parseCurrency(input.currency);
  const originalAmount = Number(input.originalAmount);
  const currentBalance = input.currentBalance === undefined || input.currentBalance === ""
    ? originalAmount
    : Number(input.currentBalance);
  const interestRate = input.interestRate === undefined || input.interestRate === ""
    ? null
    : Number(input.interestRate);
  const minimumPayment = input.minimumPayment === undefined || input.minimumPayment === ""
    ? null
    : Number(input.minimumPayment);
  const dueDay = input.dueDay === undefined || input.dueDay === ""
    ? null
    : Number(input.dueDay);
  const notes = String(input.notes || "").trim();

  if (!name || !category || !currency || !Number.isFinite(originalAmount) || originalAmount <= 0) {
    throw validationError("Enter a valid debt name, category, amount, and currency.");
  }

  if (!Number.isFinite(currentBalance) || currentBalance < 0 || currentBalance > originalAmount) {
    throw validationError("Current balance must be between zero and the original amount.");
  }

  if (interestRate !== null && (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100)) {
    throw validationError("Interest rate must be between 0 and 100.");
  }

  if (minimumPayment !== null && (!Number.isFinite(minimumPayment) || minimumPayment < 0 || minimumPayment > currentBalance)) {
    throw validationError("Minimum payment must be between zero and the current balance.");
  }

  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
    throw validationError("Due date must be a day between 1 and 31.");
  }

  const debt = await prisma.debt.create({
    data: {
      userId,
      name,
      category,
      originalAmount: roundCurrency(originalAmount),
      currentBalance: roundCurrency(currentBalance),
      currency,
      interestRate,
      minimumPayment: minimumPayment === null ? null : roundCurrency(minimumPayment),
      dueDay,
      notes: notes || null,
      status: currentBalance === 0 ? "PAID" : "ACTIVE",
      paidAt: currentBalance === 0 ? new Date() : null
    }
  });

  return serializeDebt(debt);
}

async function savePaymentPlan(userId, input) {
  const debt = await findEditableDebt(userId, input.debtId);
  const month = parseMonth(input.month);
  assertEditableCycle(month);

  const amount = Number(input.amount);
  const note = String(input.note || "").trim();

  if (!Number.isFinite(amount) || amount < 0) {
    throw validationError("Enter a valid planned payment.");
  }

  if (amount > Number(debt.currentBalance)) {
    throw validationError("Planned payment cannot exceed the remaining balance.");
  }

  const cycle = await getOrCreateSalaryCycle(userId, month);
  const plan = await prisma.debtPaymentPlan.upsert({
    where: {
      debtId_salaryCycleId: {
        debtId: debt.id,
        salaryCycleId: cycle.id
      }
    },
    update: {
      amount: roundCurrency(amount),
      currency: debt.currency,
      note: note || null
    },
    create: {
      debtId: debt.id,
      salaryCycleId: cycle.id,
      amount: roundCurrency(amount),
      currency: debt.currency,
      note: note || null
    }
  });

  return serializePlan(plan);
}

async function recordDebtPayment(userId, input) {
  const debt = await findEditableDebt(userId, input.debtId);
  const month = parseMonth(input.month);
  assertEditableCycle(month);

  const amount = Number(input.amount);
  const paidOn = parseDate(input.paidOn) || new Date();
  const note = String(input.note || "").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    throw validationError("Enter a valid actual payment.");
  }

  if (amount > Number(debt.currentBalance)) {
    throw validationError("Payment cannot exceed the remaining balance.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const cycle = await tx.salaryCycle.upsert({
      where: {
        userId_month: {
          userId,
          month
        }
      },
      update: {},
      create: {
        userId,
        month
      }
    });

    const payment = await tx.debtPayment.create({
      data: {
        debtId: debt.id,
        salaryCycleId: cycle.id,
        amount: roundCurrency(amount),
        currency: debt.currency,
        paidOn,
        note: note || null
      }
    });

    const newBalance = roundCurrency(Number(debt.currentBalance) - amount);
    const updatedDebt = await tx.debt.update({
      where: { id: debt.id },
      data: {
        currentBalance: newBalance,
        status: newBalance === 0 ? "PAID" : "ACTIVE",
        paidAt: newBalance === 0 ? new Date() : null
      }
    });

    return { payment, debt: updatedDebt };
  });

  return {
    payment: serializePayment(result.payment),
    debt: serializeDebt(result.debt)
  };
}

async function getDebtHistory(userId, debtId) {
  const debt = await prisma.debt.findFirst({
    where: {
      id: debtId,
      userId,
      deletedAt: null
    },
    include: {
      paymentPlans: {
        include: { salaryCycle: true },
        orderBy: { salaryCycle: { month: "asc" } }
      },
      payments: {
        include: { salaryCycle: true },
        orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!debt) {
    throw notFoundError("Debt not found.");
  }

  const months = new Map();

  for (const plan of debt.paymentPlans) {
    const month = toMonthValue(plan.salaryCycle.month);
    months.set(month, {
      month,
      planned: Number(plan.amount),
      actual: 0,
      payments: []
    });
  }

  for (const payment of debt.payments) {
    const month = toMonthValue(payment.salaryCycle.month);
    if (!months.has(month)) {
      months.set(month, {
        month,
        planned: 0,
        actual: 0,
        payments: []
      });
    }

    const row = months.get(month);
    row.actual += Number(payment.amount);
    row.payments.push(serializePayment(payment));
  }

  return {
    debt: serializeDebt(debt),
    history: [...months.values()]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((row) => ({
        ...row,
        difference: roundCurrency(row.planned - row.actual)
      }))
  };
}

async function findEditableDebt(userId, debtId) {
  const debt = await prisma.debt.findFirst({
    where: {
      id: String(debtId || ""),
      userId,
      deletedAt: null,
      status: "ACTIVE"
    }
  });

  if (!debt) {
    throw notFoundError("Active debt not found.");
  }

  return debt;
}

async function getOrCreateSalaryCycle(userId, month) {
  return prisma.salaryCycle.upsert({
    where: {
      userId_month: {
        userId,
        month
      }
    },
    update: {},
    create: {
      userId,
      month
    }
  });
}

function buildPlanningSummary(debts) {
  const activeDebts = debts.filter((debt) => debt.status === "ACTIVE");

  return debts.reduce((summary, debt) => {
    const plan = debt.paymentPlans[0];
    const actual = debt.payments.reduce((total, payment) => total + Number(payment.amount), 0);
    const currency = debt.currency;

    addCurrencyTotal(summary.totalDebtRemainingByCurrency, currency, Number(debt.currentBalance));
    addCurrencyTotal(summary.monthlyDebtPlannedByCurrency, currency, plan ? Number(plan.amount) : 0);
    addCurrencyTotal(summary.debtActuallyPaidByCurrency, currency, actual);
    return summary;
  }, {
    activeDebtCount: activeDebts.length,
    monthlyDebtPlannedByCurrency: {},
    debtActuallyPaidByCurrency: {},
    totalDebtRemainingByCurrency: {}
  });
}

function addCurrencyTotal(totals, currency, amount) {
  totals[currency] = roundCurrency((totals[currency] || 0) + amount);
}

function serializeDebtForPlanning(debt) {
  const plan = debt.paymentPlans[0] || null;
  const actualPaidThisMonth = debt.payments.reduce((total, payment) => total + Number(payment.amount), 0);

  return {
    ...serializeDebt(debt),
    plan: plan ? serializePlan(plan) : null,
    actualPaidThisMonth,
    paymentsThisMonth: debt.payments.map(serializePayment)
  };
}

function serializeDebt(debt) {
  const originalAmount = Number(debt.originalAmount);
  const currentBalance = Number(debt.currentBalance);
  const amountPaid = roundCurrency(originalAmount - currentBalance);
  const percentPaid = originalAmount > 0 ? Math.round((amountPaid / originalAmount) * 100) : 0;

  return {
    id: debt.id,
    name: debt.name,
    category: debt.category,
    originalAmount,
    currentBalance,
    amountPaid,
    percentPaid,
    percentRemaining: Math.max(0, 100 - percentPaid),
    currency: debt.currency,
    interestRate: debt.interestRate === null ? null : Number(debt.interestRate),
    minimumPayment: debt.minimumPayment === null ? null : Number(debt.minimumPayment),
    dueDay: debt.dueDay,
    notes: debt.notes,
    status: debt.status,
    paidAt: debt.paidAt
  };
}

function serializePlan(plan) {
  return {
    id: plan.id,
    debtId: plan.debtId,
    salaryCycleId: plan.salaryCycleId,
    amount: Number(plan.amount),
    currency: plan.currency,
    note: plan.note
  };
}

function serializePayment(payment) {
  return {
    id: payment.id,
    debtId: payment.debtId,
    salaryCycleId: payment.salaryCycleId,
    amount: Number(payment.amount),
    currency: payment.currency,
    paidOn: toDateValue(payment.paidOn),
    note: payment.note
  };
}

function parseDebtCategory(value) {
  const category = String(value || "").toUpperCase();
  return debtCategories.includes(category) ? category : null;
}

function parseCurrency(value) {
  const currency = String(value || "").toUpperCase();
  return allowedCurrencies.has(currency) ? currency : null;
}

function parseMonth(value) {
  const month = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return currentMonthStart();
  }

  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1));
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return null;
  }

  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function assertEditableCycle(month) {
  if (month.getTime() < currentMonthStart().getTime()) {
    throw validationError("Historical salary cycles cannot be changed.");
  }
}

function currentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function toMonthValue(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toDateValue(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFoundError(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

module.exports = {
  createDebt,
  debtCategories,
  getDebtHistory,
  listPlanning,
  recordDebtPayment,
  savePaymentPlan
};
