require("dotenv").config({ override: true });

const express = require("express");
const path = require("node:path");

const prisma = require("./prisma");
const debtRoutes = require("./routes/debts");
const {
  clearSession,
  createRandomToken,
  createSession,
  getCurrentUser,
  hashPassword,
  hashToken,
  isValidEmail,
  normalizeEmail,
  requireUser,
  verifyPassword
} = require("./auth");
const { getAppBaseUrl, sendInviteEmail } = require("./email");
const { sendSalaryPlanningReminders, startReminderScheduler } = require("./services/reminderService");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "..", "public");
const allowedCurrencies = new Set(["USD", "NGN", "EUR", "GBP"]);
const allowedIncomeFrequencies = new Set([
  "ONE_TIME",
  "WEEKLY",
  "BI_WEEKLY",
  "SEMI_MONTHLY",
  "MONTHLY",
  "QUARTERLY",
  "ANNUAL"
]);
const allowedFutureGoalTypes = new Set([
  "HOUSE",
  "CAR",
  "VACATION",
  "EDUCATION",
  "WEDDING",
  "BUSINESS",
  "OTHER"
]);
const allowedGoalFundingStrategies = new Set([
  "FULL_COST",
  "DOWN_PAYMENT",
  "CUSTOM_TARGET"
]);
const defaultBudgetAmounts = {
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

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(express.static(publicDir, {
  extensions: ["html"],
  setHeaders(res, filePath) {
    if (/\.(?:html|js|css)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    }
  }
}));
app.use("/api", debtRoutes);

app.get("/api/health", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", async (req, res, next) => {
  try {
    const user = await getCurrentUser(req);
    const userCount = await prisma.user.count();
    res.json({ user, canBootstrapInvite: userCount === 0 });
  } catch (error) {
    next(error);
  }
});

app.post("/api/register", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const acceptedPrivacyPolicy = req.body.acceptedPrivacyPolicy === true;

    if (!name || name.length > 80) {
      res.status(400).json({ error: "Enter your name." });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    if (!acceptedPrivacyPolicy) {
      res.status(400).json({ error: "Accept the Privacy Policy to create an account." });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }

    const [userCount, passwordHash] = await Promise.all([
      prisma.user.count(),
      hashPassword(password)
    ]);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: userCount === 0 ? "OWNER" : "MEMBER"
        }
      });

      await createDefaultBudgetsForUser(tx, createdUser.id);
      return createdUser;
    });

    await createSession(res, user.id);
    res.status(201).json({ user: serializeUser(user) });
  } catch (error) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!isValidEmail(email) || !password) {
      res.status(400).json({ error: "Enter a valid email and password." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    await createSession(res, user.id);
    res.json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", async (req, res, next) => {
  try {
    await clearSession(req, res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/account", requireUser, async (req, res, next) => {
  try {
    const password = String(req.body.password || "");
    const confirmation = String(req.body.confirmation || "").trim().toUpperCase();

    if (!password) {
      res.status(400).json({ error: "Enter your password to delete your account." });
      return;
    }

    if (confirmation !== "DELETE") {
      res.status(400).json({ error: "Type DELETE to confirm account deletion." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      res.status(403).json({ error: "The password you entered is incorrect." });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Invitations use SetNull relations and can otherwise retain the deleted
      // user's email address or tokens after the account itself is removed.
      await tx.invitation.deleteMany({
        where: {
          OR: [
            { email: user.email },
            { invitedById: user.id },
            { acceptedById: user.id }
          ]
        }
      });

      // User-owned financial records and sessions are removed by the Cascade
      // relations defined in the Prisma schema.
      await tx.user.delete({ where: { id: user.id } });
    });

    await clearSession(req, res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invites", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    const currentUser = await getCurrentUser(req);
    const userCount = await prisma.user.count();

    if (userCount > 0 && !currentUser) {
      res.status(401).json({ error: "Log in before inviting someone." });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: "That email already has an account." });
      return;
    }

    const token = createRandomToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await prisma.invitation.create({
      data: {
        email,
        tokenHash: hashToken(token),
        expiresAt,
        invitedById: currentUser?.id
      }
    });

    const inviteUrl = `${getAppBaseUrl()}/accept-invite.html?token=${encodeURIComponent(token)}`;
    const emailResult = await sendInviteEmailSafely({
      to: email,
      inviteUrl,
      invitedBy: currentUser
    });

    const shouldReturnInviteUrl = process.env.NODE_ENV !== "production"
      || process.env.RETURN_INVITE_LINK === "true"
      || !emailResult.sent;

    res.status(201).json({
      invite: {
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
        emailSent: emailResult.sent
      },
      inviteUrl: shouldReturnInviteUrl ? inviteUrl : undefined,
      message: emailResult.sent
        ? "Invite sent."
        : `Invite created, but email was not sent. ${emailResult.reason || "Check email settings."}`
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/invites/:token", async (req, res, next) => {
  try {
    const invitation = await findValidInvitation(req.params.token);

    if (!invitation) {
      res.status(404).json({ error: "Invite link is invalid or expired." });
      return;
    }

    res.json({
      invitation: {
        email: invitation.email,
        expiresAt: invitation.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invites/:token/accept", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "");

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    const invitation = await findValidInvitation(req.params.token);
    if (!invitation) {
      res.status(404).json({ error: "Invite link is invalid or expired." });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) {
      res.status(409).json({ error: "This invite was already used. Log in instead." });
      return;
    }

    const userCount = await prisma.user.count();
    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: invitation.email,
          name: name || null,
          passwordHash,
          role: userCount === 0 ? "OWNER" : "MEMBER"
        }
      });

      await createDefaultBudgetsForUser(tx, createdUser.id);

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date(),
          acceptedById: createdUser.id
        }
      });

      return createdUser;
    });

    await createSession(res, user.id);
    res.status(201).json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/categories", requireUser, async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ kind: "asc" }, { name: "asc" }]
    });

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

app.get("/api/transactions", requireUser, async (req, res, next) => {
  try {
    const month = getMonthParam(req.query.month);
    const { start, end } = getMonthRange(month);

    const [transactions, fixedExpenseOccurrences] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: req.user.id,
          date: {
            gte: start,
            lt: end
          }
        },
        include: { category: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }]
      }),
      getFixedExpenseOccurrences(req.user.id, month)
    ]);

    const monthlyTransactions = [
      ...transactions.map(serializeTransaction),
      ...fixedExpenseOccurrences
    ].sort(sortTransactionsByDateDesc);

    res.json({ transactions: monthlyTransactions });
  } catch (error) {
    next(error);
  }
});

app.post("/api/transactions", requireUser, async (req, res, next) => {
  try {
    const type = String(req.body.type || "").toUpperCase();
    const description = String(req.body.description || "").trim();
    const date = parseDate(req.body.date);
    const amount = Number(req.body.amount);
    const categoryId = String(req.body.categoryId || "");

    if (!["INCOME", "EXPENSE"].includes(type) || !date || !description || !Number.isFinite(amount) || amount <= 0 || !categoryId) {
      res.status(400).json({ error: "Enter a valid transaction." });
      return;
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.kind !== type) {
      res.status(400).json({ error: "Choose a matching category." });
      return;
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId: req.user.id,
        type,
        date,
        amount: roundCurrency(amount),
        description,
        categoryId
      },
      include: { category: true }
    });

    res.status(201).json({ transaction: serializeTransaction(transaction) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/transactions/:id", requireUser, async (req, res, next) => {
  try {
    const transaction = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!transaction) {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }

    await prisma.transaction.delete({ where: { id: transaction.id } });
    res.json({ ok: true });
  } catch (error) {
    if (error.code === "P2025") {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }
    next(error);
  }
});

app.get("/api/budgets", requireUser, async (req, res, next) => {
  try {
    const month = getMonthParam(req.query.month);
    const monthDate = parseMonth(month);
    const budgets = await prisma.monthlyBudget.findMany({
      where: { userId: req.user.id, month: monthDate },
      include: { category: true },
      orderBy: { category: { name: "asc" } }
    });

    res.json({ budgets: budgets.map(serializeBudget) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/budgets", requireUser, async (req, res, next) => {
  try {
    const month = getMonthParam(req.body.month);
    const monthDate = parseMonth(month);
    const amount = Number(req.body.amount);
    const categoryId = String(req.body.categoryId || "");

    if (!categoryId || !Number.isFinite(amount) || amount < 0) {
      res.status(400).json({ error: "Enter a valid budget amount." });
      return;
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.kind !== "EXPENSE") {
      res.status(400).json({ error: "Choose an expense category." });
      return;
    }

    const budget = await prisma.monthlyBudget.upsert({
      where: {
        userId_categoryId_month: {
          userId: req.user.id,
          categoryId,
          month: monthDate
        }
      },
      update: { amount: roundCurrency(amount) },
      create: {
        userId: req.user.id,
        categoryId,
        month: monthDate,
        amount: roundCurrency(amount)
      },
      include: { category: true }
    });

    res.json({ budget: serializeBudget(budget) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/fixed-expenses", requireUser, async (req, res, next) => {
  try {
    const month = getMonthParam(req.query.month);
    const [fixedExpenses, categories, occurrences] = await Promise.all([
      prisma.fixedExpense.findMany({
        where: { userId: req.user.id },
        include: { category: true },
        orderBy: [{ active: "desc" }, { name: "asc" }]
      }),
      prisma.category.findMany({
        where: { kind: "EXPENSE" },
        orderBy: { name: "asc" }
      }),
      getFixedExpenseOccurrences(req.user.id, month)
    ]);

    res.json({
      month,
      currencies: [...allowedCurrencies],
      categories: categories.map(serializeCategory),
      fixedExpenses: fixedExpenses.map(serializeFixedExpense),
      occurrences,
      totals: getCurrencyTotals(occurrences),
      activeCount: fixedExpenses.filter((expense) => expense.active).length
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/fixed-expenses", requireUser, async (req, res, next) => {
  try {
    const payload = await parseFixedExpensePayload(req.body);
    if (payload.error) {
      res.status(400).json({ error: payload.error });
      return;
    }

    const fixedExpense = await prisma.fixedExpense.create({
      data: {
        userId: req.user.id,
        name: payload.name,
        amount: payload.amount,
        currency: payload.currency,
        categoryId: payload.categoryId,
        dueDay: payload.dueDay,
        startMonth: payload.startMonth,
        active: payload.active,
        notes: payload.notes
      },
      include: { category: true }
    });

    res.status(201).json({ fixedExpense: serializeFixedExpense(fixedExpense) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/fixed-expenses/:id", requireUser, async (req, res, next) => {
  try {
    const existingFixedExpense = await prisma.fixedExpense.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!existingFixedExpense) {
      res.status(404).json({ error: "Fixed expense not found." });
      return;
    }

    const payload = await parseFixedExpensePayload(req.body);
    if (payload.error) {
      res.status(400).json({ error: payload.error });
      return;
    }

    const fixedExpense = await prisma.fixedExpense.update({
      where: { id: existingFixedExpense.id },
      data: {
        name: payload.name,
        amount: payload.amount,
        currency: payload.currency,
        categoryId: payload.categoryId,
        dueDay: payload.dueDay,
        startMonth: payload.startMonth,
        active: payload.active,
        notes: payload.notes
      },
      include: { category: true }
    });

    res.json({ fixedExpense: serializeFixedExpense(fixedExpense) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/savings", requireUser, async (req, res, next) => {
  try {
    const month = getMonthParam(req.query.month);
    const { start, end } = getMonthRange(month);
    const goals = await prisma.savingsGoal.findMany({
      where: {
        userId: req.user.id,
        archivedAt: null
      },
      include: {
        contributions: {
          orderBy: [{ savedOn: "desc" }, { createdAt: "desc" }]
        }
      },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }]
    });

    const serializedGoals = goals.map(serializeSavingsGoal);
    const monthlyContributions = goals.flatMap((goal) => goal.contributions
      .filter((contribution) => contribution.savedOn >= start && contribution.savedOn < end)
      .map((contribution) => serializeSavingsContribution(contribution, goal)));

    monthlyContributions.sort(sortSavingsContributionsByDateDesc);

    res.json({
      month,
      currencies: [...allowedCurrencies],
      goals: serializedGoals,
      contributions: monthlyContributions,
      totals: getSavingsTotals(serializedGoals, monthlyContributions)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/savings-goals", requireUser, async (req, res, next) => {
  try {
    const payload = parseSavingsGoalPayload(req.body);
    if (payload.error) {
      res.status(400).json({ error: payload.error });
      return;
    }

    const goal = await prisma.savingsGoal.create({
      data: {
        userId: req.user.id,
        name: payload.name,
        goalType: payload.goalType,
        fundingStrategy: payload.fundingStrategy,
        totalCost: payload.totalCost,
        targetAmount: payload.targetAmount,
        currency: payload.currency,
        deadline: payload.deadline,
        notes: payload.notes
      },
      include: {
        contributions: {
          orderBy: [{ savedOn: "desc" }, { createdAt: "desc" }]
        }
      }
    });

    res.status(201).json({ goal: serializeSavingsGoal(goal) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/savings-goals/:id", requireUser, async (req, res, next) => {
  try {
    const existingGoal = await prisma.savingsGoal.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
        archivedAt: null
      }
    });

    if (!existingGoal) {
      res.status(404).json({ error: "Savings goal not found." });
      return;
    }

    const payload = parseSavingsGoalPayload(req.body, existingGoal);
    if (payload.error) {
      res.status(400).json({ error: payload.error });
      return;
    }

    const goal = await prisma.savingsGoal.update({
      where: { id: existingGoal.id },
      data: {
        name: payload.name,
        goalType: payload.goalType,
        fundingStrategy: payload.fundingStrategy,
        totalCost: payload.totalCost,
        targetAmount: payload.targetAmount,
        currency: payload.currency,
        deadline: payload.deadline,
        notes: payload.notes
      },
      include: {
        contributions: {
          orderBy: [{ savedOn: "desc" }, { createdAt: "desc" }]
        }
      }
    });

    res.json({ goal: serializeSavingsGoal(goal) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/savings-goals/:id/contributions", requireUser, async (req, res, next) => {
  try {
    const goal = await prisma.savingsGoal.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
        archivedAt: null
      }
    });

    if (!goal) {
      res.status(404).json({ error: "Savings goal not found." });
      return;
    }

    const amount = Number(req.body.amount);
    const savedOn = parseDate(req.body.savedOn);
    const note = String(req.body.note || "").trim();

    if (!Number.isFinite(amount) || amount <= 0 || !savedOn) {
      res.status(400).json({ error: "Enter a valid saved amount and date." });
      return;
    }

    const contribution = await prisma.savingsContribution.create({
      data: {
        savingsGoalId: goal.id,
        amount: roundCurrency(amount),
        savedOn,
        note: note || null
      }
    });

    res.status(201).json({
      contribution: serializeSavingsContribution(contribution, goal)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/income", requireUser, async (req, res, next) => {
  try {
    const month = getMonthParam(req.query.month);
    const { start, end } = getMonthRange(month);

    const [entries, sources] = await Promise.all([
      prisma.incomeEntry.findMany({
        where: {
          userId: req.user.id,
          receivedOn: {
            gte: start,
            lt: end
          }
        },
        orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }]
      }),
      prisma.incomeSource.findMany({
        where: {
          userId: req.user.id,
          active: true
        },
        include: {
          versions: {
            orderBy: { effectiveFrom: "asc" }
          }
        },
        orderBy: { name: "asc" }
      })
    ]);

    res.json({
      month,
      currencies: [...allowedCurrencies],
      entries: entries.map(serializeIncomeEntry),
      sources: sources.map((source) => serializeIncomeSource(source, new Date(end.getTime() - 1))),
      totals: getIncomeTotals(entries)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/income-entries", requireUser, async (req, res, next) => {
  try {
    const sourceName = String(req.body.sourceName || "").trim();
    const amount = Number(req.body.amount);
    const currency = parseCurrency(req.body.currency);
    const receivedOn = parseDate(req.body.receivedOn);
    const note = String(req.body.note || "").trim();
    const frequency = parseIncomeFrequency(req.body.frequency)
      || (Boolean(req.body.isFixed) ? "MONTHLY" : "ONE_TIME");
    const isFixed = frequency !== "ONE_TIME";
    const paymentDay = parsePaymentDay(req.body.paymentDay);
    const hasPaymentDay = hasValue(req.body.paymentDay);

    if (!sourceName || !Number.isFinite(amount) || amount <= 0 || !currency || !receivedOn) {
      res.status(400).json({ error: "Enter a valid income source, amount, currency, and date." });
      return;
    }

    if (isFixed && hasPaymentDay && !paymentDay) {
      res.status(400).json({ error: "Payment day must be between 1 and 31." });
      return;
    }

    const sourcePaymentDay = paymentDay || receivedOn.getUTCDate();

    const entry = await prisma.$transaction(async (tx) => {
      let source = null;

      if (isFixed) {
        source = await tx.incomeSource.upsert({
          where: {
            userId_name: {
              userId: req.user.id,
              name: sourceName
            }
          },
          update: {
            isFixed: true,
            frequency,
            paymentDay: sourcePaymentDay,
            active: true
          },
          create: {
            userId: req.user.id,
            name: sourceName,
            isFixed: true,
            frequency,
            paymentDay: sourcePaymentDay
          }
        });

        await tx.incomeVersion.upsert({
          where: {
            incomeSourceId_effectiveFrom: {
              incomeSourceId: source.id,
              effectiveFrom: receivedOn
            }
          },
          update: {
            amount: roundCurrency(amount),
            currency
          },
          create: {
            incomeSourceId: source.id,
            amount: roundCurrency(amount),
            currency,
            effectiveFrom: receivedOn
          }
        });
      }

      return tx.incomeEntry.create({
        data: {
          userId: req.user.id,
          incomeSourceId: source?.id,
          sourceName,
          amount: roundCurrency(amount),
          currency,
          frequency,
          receivedOn,
          note: note || null
        }
      });
    });

    res.status(201).json({ entry: serializeIncomeEntry(entry) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/income-sources/:id/versions", requireUser, async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const currency = parseCurrency(req.body.currency);
    const effectiveFrom = parseDate(req.body.effectiveFrom);
    const paymentDay = parsePaymentDay(req.body.paymentDay);
    const hasPaymentDay = hasValue(req.body.paymentDay);

    if (!Number.isFinite(amount) || amount <= 0 || !currency || !effectiveFrom) {
      res.status(400).json({ error: "Enter a valid amount, currency, and effective date." });
      return;
    }

    if (hasPaymentDay && !paymentDay) {
      res.status(400).json({ error: "Payment day must be between 1 and 31." });
      return;
    }

    const source = await prisma.incomeSource.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!source) {
      res.status(404).json({ error: "Income source not found." });
      return;
    }

    await prisma.incomeSource.update({
      where: { id: source.id },
      data: {
        isFixed: true,
        active: true,
        ...(paymentDay ? { paymentDay } : {})
      }
    });

    await prisma.incomeVersion.upsert({
      where: {
        incomeSourceId_effectiveFrom: {
          incomeSourceId: source.id,
          effectiveFrom
        }
      },
      update: {
        amount: roundCurrency(amount),
        currency
      },
      create: {
        incomeSourceId: source.id,
        effectiveFrom,
        amount: roundCurrency(amount),
        currency
      }
    });

    const updatedSource = await prisma.incomeSource.findUnique({
      where: { id: source.id },
      include: {
        versions: {
          orderBy: { effectiveFrom: "asc" }
        }
      }
    });

    res.json({ source: serializeIncomeSource(updatedSource, effectiveFrom) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reminders/salary-planning/run", requireUser, async (req, res, next) => {
  try {
    if (req.user.role !== "OWNER") {
      res.status(403).json({ error: "Only the owner can run reminders." });
      return;
    }

    const result = await sendSalaryPlanningReminders({
      dryRun: Boolean(req.body?.dryRun)
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Something went wrong." });
});

app.listen(port, () => {
  console.log(`Budget app listening on http://localhost:${port}`);
  startReminderScheduler();
});

async function findValidInvitation(token) {
  if (!token) return null;

  return prisma.invitation.findFirst({
    where: {
      tokenHash: hashToken(token),
      acceptedAt: null,
      expiresAt: {
        gt: new Date()
      }
    }
  });
}

async function sendInviteEmailSafely({ to, inviteUrl, invitedBy }) {
  try {
    return await sendInviteEmail({ to, inviteUrl, invitedBy });
  } catch (error) {
    console.error("Invite email failed.", error);
    return {
      sent: false,
      reason: error.message || "Email provider rejected the invite."
    };
  }
}

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

function serializeTransaction(transaction) {
  return {
    id: transaction.id,
    type: transaction.type.toLowerCase(),
    date: toDateValue(transaction.date),
    amount: Number(transaction.amount),
    currency: "USD",
    description: transaction.description,
    category: serializeCategory(transaction.category),
    isFixedExpense: false
  };
}

function serializeCategory(category) {
  return category
    ? {
        id: category.id,
        name: category.name,
        kind: category.kind.toLowerCase(),
        color: category.color
      }
    : null;
}

function serializeBudget(budget) {
  return {
    id: budget.id,
    month: toDateValue(budget.month),
    amount: Number(budget.amount),
    category: serializeCategory(budget.category)
  };
}

function serializeFixedExpense(fixedExpense) {
  return {
    id: fixedExpense.id,
    name: fixedExpense.name,
    amount: Number(fixedExpense.amount),
    currency: fixedExpense.currency,
    categoryId: fixedExpense.categoryId,
    category: serializeCategory(fixedExpense.category),
    dueDay: fixedExpense.dueDay,
    startMonth: toMonthValue(fixedExpense.startMonth),
    active: fixedExpense.active,
    notes: fixedExpense.notes,
    createdAt: fixedExpense.createdAt
  };
}

function serializeFixedExpenseOccurrence(fixedExpense, month) {
  const dueDate = getFixedExpenseDueDate(month, fixedExpense.dueDay);

  return {
    id: `fixed-expense:${fixedExpense.id}:${month}`,
    type: "expense",
    date: toDateValue(dueDate),
    amount: Number(fixedExpense.amount),
    currency: fixedExpense.currency,
    description: fixedExpense.name,
    category: serializeCategory(fixedExpense.category),
    isFixedExpense: true,
    fixedExpenseId: fixedExpense.id
  };
}

function serializeSavingsGoal(goal) {
  const contributions = goal.contributions || [];
  const savedAmount = roundCurrency(contributions.reduce((total, contribution) => total + Number(contribution.amount), 0));
  const targetAmount = Number(goal.targetAmount);
  const remainingAmount = roundCurrency(Math.max(0, targetAmount - savedAmount));
  const percentSaved = targetAmount > 0 ? Math.min(100, Math.round((savedAmount / targetAmount) * 100)) : 0;

  return {
    id: goal.id,
    name: goal.name,
    goalType: goal.goalType || "OTHER",
    fundingStrategy: goal.fundingStrategy || "CUSTOM_TARGET",
    totalCost: goal.totalCost === null || goal.totalCost === undefined ? null : Number(goal.totalCost),
    targetAmount,
    savedAmount,
    remainingAmount,
    percentSaved,
    currency: goal.currency,
    deadline: toDateValue(goal.deadline),
    daysLeft: getDaysUntil(goal.deadline),
    isComplete: savedAmount >= targetAmount,
    notes: goal.notes,
    contributions: contributions.slice(0, 6).map((contribution) => serializeSavingsContribution(contribution, goal)),
    createdAt: goal.createdAt
  };
}

function serializeSavingsContribution(contribution, goal) {
  return {
    id: contribution.id,
    savingsGoalId: goal.id,
    goalName: goal.name,
    amount: Number(contribution.amount),
    currency: goal.currency,
    savedOn: toDateValue(contribution.savedOn),
    note: contribution.note,
    createdAt: contribution.createdAt
  };
}

function serializeIncomeSource(source, asOfDate = new Date()) {
  const versions = source.versions || [];
  return {
    id: source.id,
    name: source.name,
    isFixed: source.isFixed,
    frequency: source.frequency,
    paymentDay: source.paymentDay,
    active: source.active,
    currentVersion: serializeIncomeVersion(getCurrentIncomeVersion(versions, asOfDate)),
    versions: versions.map(serializeIncomeVersion).filter(Boolean),
    createdAt: source.createdAt
  };
}

function serializeIncomeVersion(version) {
  if (!version) return null;

  return {
    id: version.id,
    amount: Number(version.amount),
    currency: version.currency,
    effectiveFrom: toDateValue(version.effectiveFrom)
  };
}

function serializeIncomeEntry(entry) {
  return {
    id: entry.id,
    sourceName: entry.sourceName,
    amount: Number(entry.amount),
    currency: entry.currency,
    frequency: entry.frequency,
    receivedOn: toDateValue(entry.receivedOn),
    note: entry.note,
    incomeSourceId: entry.incomeSourceId
  };
}

function getCurrentIncomeVersion(versions, asOfDate) {
  const asOfTime = asOfDate.getTime();
  const effectiveVersions = versions.filter((version) => version.effectiveFrom.getTime() <= asOfTime);

  if (effectiveVersions.length) {
    return effectiveVersions[effectiveVersions.length - 1];
  }

  return versions[versions.length - 1] || null;
}

function getIncomeTotals(entries) {
  return entries.reduce((totals, entry) => {
    const currency = entry.currency;
    totals[currency] = (totals[currency] || 0) + Number(entry.amount);
    return totals;
  }, {});
}

async function getFixedExpenseOccurrences(userId, month) {
  const { end } = getMonthRange(month);
  const fixedExpenses = await prisma.fixedExpense.findMany({
    where: {
      userId,
      active: true,
      startMonth: {
        lt: end
      }
    },
    include: { category: true },
    orderBy: [{ dueDay: "asc" }, { name: "asc" }]
  });

  return fixedExpenses.map((fixedExpense) => serializeFixedExpenseOccurrence(fixedExpense, month));
}

async function parseFixedExpensePayload(body) {
  const name = String(body.name || "").trim();
  const amount = Number(body.amount);
  const currency = parseCurrency(body.currency);
  const categoryId = String(body.categoryId || "").trim() || null;
  const dueDay = parseDueDay(body.dueDay);
  const startMonth = parseRequiredMonth(body.startMonth);
  const notes = String(body.notes || "").trim();
  const active = parseBoolean(body.active, true);

  if (!name || !Number.isFinite(amount) || amount <= 0 || !currency || !startMonth) {
    return { error: "Enter a valid name, amount, currency, and start month." };
  }

  if (!dueDay) {
    return { error: "Due day must be between 1 and 31." };
  }

  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.kind !== "EXPENSE") {
      return { error: "Choose a valid expense category." };
    }
  }

  return {
    name,
    amount: roundCurrency(amount),
    currency,
    categoryId,
    dueDay,
    startMonth,
    active,
    notes: notes || null
  };
}

function parseSavingsGoalPayload(body, existingGoal = null) {
  const name = String(body.name || "").trim();
  const goalTypeValue = body.goalType === undefined ? existingGoal?.goalType : body.goalType;
  const fundingValue = body.fundingStrategy === undefined ? existingGoal?.fundingStrategy : body.fundingStrategy;
  const goalType = allowedFutureGoalTypes.has(String(goalTypeValue || "").toUpperCase())
    ? String(goalTypeValue).toUpperCase()
    : "OTHER";
  const fundingStrategy = allowedGoalFundingStrategies.has(String(fundingValue || "").toUpperCase())
    ? String(fundingValue).toUpperCase()
    : "CUSTOM_TARGET";
  const submittedTotalCost = body.totalCost === undefined ? existingGoal?.totalCost : body.totalCost;
  const parsedTotalCost = hasValue(submittedTotalCost) ? Number(submittedTotalCost) : null;
  let targetAmount = Number(body.targetAmount);
  const currency = parseCurrency(body.currency);
  const deadline = parseDate(body.deadline);
  const notes = String(body.notes || "").trim();

  if (parsedTotalCost !== null && (!Number.isFinite(parsedTotalCost) || parsedTotalCost <= 0)) {
    return { error: "Enter a valid total cost." };
  }

  if (fundingStrategy === "FULL_COST") {
    if (parsedTotalCost === null) {
      return { error: "Enter the total cost for a full-cost goal." };
    }
    targetAmount = parsedTotalCost;
  }

  if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0 || !currency || !deadline) {
    return { error: "Enter a valid goal, target amount, currency, and deadline." };
  }

  if (fundingStrategy === "DOWN_PAYMENT" && parsedTotalCost === null) {
    return { error: "Enter the house or car's total cost." };
  }

  if (parsedTotalCost !== null && targetAmount > parsedTotalCost) {
    return { error: "The savings target cannot exceed the total cost." };
  }

  return {
    name,
    goalType,
    fundingStrategy,
    totalCost: parsedTotalCost === null ? null : roundCurrency(parsedTotalCost),
    targetAmount: roundCurrency(targetAmount),
    currency,
    deadline,
    notes: notes || null
  };
}

function getCurrencyTotals(items) {
  return items.reduce((totals, item) => {
    const currency = item.currency || "USD";
    addCurrencyTotal(totals, currency, item.amount);
    return totals;
  }, {});
}

function getSavingsTotals(goals, monthlyContributions) {
  const totals = {
    targetByCurrency: {},
    savedByCurrency: {},
    remainingByCurrency: {},
    savedThisMonthByCurrency: {}
  };

  goals.forEach((goal) => {
    addCurrencyTotal(totals.targetByCurrency, goal.currency, goal.targetAmount);
    addCurrencyTotal(totals.savedByCurrency, goal.currency, goal.savedAmount);
    addCurrencyTotal(totals.remainingByCurrency, goal.currency, goal.remainingAmount);
  });

  monthlyContributions.forEach((contribution) => {
    addCurrencyTotal(totals.savedThisMonthByCurrency, contribution.currency, contribution.amount);
  });

  return totals;
}

function addCurrencyTotal(totals, currency, amount) {
  totals[currency] = roundCurrency((totals[currency] || 0) + Number(amount || 0));
}

function sortTransactionsByDateDesc(left, right) {
  const dateSort = right.date.localeCompare(left.date);
  if (dateSort) {
    return dateSort;
  }

  return String(left.description || "").localeCompare(String(right.description || ""));
}

function sortSavingsContributionsByDateDesc(left, right) {
  const dateSort = right.savedOn.localeCompare(left.savedOn);
  if (dateSort) {
    return dateSort;
  }

  return String(left.goalName || "").localeCompare(String(right.goalName || ""));
}

function parseCurrency(value) {
  const currency = String(value || "").toUpperCase();
  return allowedCurrencies.has(currency) ? currency : null;
}

function parseIncomeFrequency(value) {
  const frequency = String(value || "").toUpperCase();
  return allowedIncomeFrequencies.has(frequency) ? frequency : null;
}

function parsePaymentDay(value) {
  if (!hasValue(value)) {
    return null;
  }

  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function parseDueDay(value) {
  if (!hasValue(value)) {
    return null;
  }

  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["true", "1", "on", "yes"].includes(String(value).toLowerCase());
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getMonthParam(value) {
  const month = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(month)) {
    return month;
  }
  return toMonthValue(new Date());
}

function getMonthRange(month) {
  const start = parseMonth(month);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function parseMonth(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1));
}

function parseRequiredMonth(value) {
  const month = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const [, monthIndex] = month.split("-").map(Number);
  return monthIndex >= 1 && monthIndex <= 12 ? parseMonth(month) : null;
}

function getFixedExpenseDueDate(month, dueDay) {
  const [year, monthIndex] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), lastDay);
  return new Date(Date.UTC(year, monthIndex - 1, day));
}

function getDaysUntil(date) {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const targetUtc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return Math.ceil((targetUtc.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000));
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return null;
  }

  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toMonthValue(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toDateValue(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

async function createDefaultBudgetsForUser(tx, userId) {
  const categories = await tx.category.findMany({
    where: {
      kind: "EXPENSE",
      name: { in: Object.keys(defaultBudgetAmounts) }
    },
    select: { id: true, name: true }
  });
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  if (!categories.length) return;

  await tx.monthlyBudget.createMany({
    data: categories.map((category) => ({
      userId,
      categoryId: category.id,
      month,
      amount: defaultBudgetAmounts[category.name]
    })),
    skipDuplicates: true
  });
}
