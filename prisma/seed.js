const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const expenseCategories = [
  ["Housing", "#16794f"],
  ["Food", "#2563a9"],
  ["Transport", "#a86d00"],
  ["Utilities", "#6855a4"],
  ["Health", "#b4473e"],
  ["Shopping", "#0f766e"],
  ["Entertainment", "#7c3aed"],
  ["Savings", "#15803d"],
  ["Debt", "#be123c"],
  ["Other", "#68737f"]
];

const incomeCategories = [
  ["Paycheck", "#16794f"],
  ["Freelance", "#2563a9"],
  ["Business", "#6855a4"],
  ["Interest", "#a86d00"],
  ["Other Income", "#68737f"]
];

const defaultBudgets = {
  Housing: 1200,
  Food: 500,
  Transport: 180,
  Utilities: 260,
  Health: 120,
  Shopping: 200,
  Entertainment: 150,
  Savings: 300,
  Debt: 0,
  Other: 100
};

async function main() {
  for (const [name, color] of expenseCategories) {
    await prisma.category.upsert({
      where: { name_kind: { name, kind: "EXPENSE" } },
      update: { color },
      create: { name, color, kind: "EXPENSE" }
    });
  }

  for (const [name, color] of incomeCategories) {
    await prisma.category.upsert({
      where: { name_kind: { name, kind: "INCOME" } },
      update: { color },
      create: { name, color, kind: "INCOME" }
    });
  }

  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  for (const [name, amount] of Object.entries(defaultBudgets)) {
    const category = await prisma.category.findUnique({
      where: { name_kind: { name, kind: "EXPENSE" } }
    });

    if (!category) continue;

    await prisma.monthlyBudget.upsert({
      where: {
        categoryId_month: {
          categoryId: category.id,
          month: currentMonth
        }
      },
      update: { amount },
      create: {
        categoryId: category.id,
        month: currentMonth,
        amount
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

