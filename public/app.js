const currencyMeta = {
  USD: { locale: "en-US", currency: "USD" },
  NGN: { locale: "en-NG", currency: "NGN" },
  EUR: { locale: "de-DE", currency: "EUR" },
  GBP: { locale: "en-GB", currency: "GBP" }
};

const elements = {
  logoutButton: document.querySelector("#logoutButton"),
  nextSalary: document.querySelector("#nextSalary"),
  salaryHint: document.querySelector("#salaryHint"),
  plannedCycle: document.querySelector("#plannedCycle"),
  plannedHint: document.querySelector("#plannedHint"),
  paidCycle: document.querySelector("#paidCycle"),
  paidHint: document.querySelector("#paidHint"),
  totalDebt: document.querySelector("#totalDebt"),
  activeDebtCount: document.querySelector("#activeDebtCount"),
  debtChart: document.querySelector("#debtChart"),
  activeDebts: document.querySelector("#activeDebts"),
  recentActivity: document.querySelector("#recentActivity"),
  cycleBudget: document.querySelector("#cycleBudget")
};

const selectedMonth = toMonthValue(new Date());

initialize();

async function initialize() {
  bindEvents();

  try {
    await requireSession();
    const [income, debtPlanning, transactions, budgets] = await Promise.all([
      apiRequest(`/api/income?month=${encodeURIComponent(selectedMonth)}`),
      apiRequest(`/api/debt-planning?month=${encodeURIComponent(selectedMonth)}`),
      apiRequest(`/api/transactions?month=${encodeURIComponent(selectedMonth)}`),
      apiRequest(`/api/budgets?month=${encodeURIComponent(selectedMonth)}`)
    ]);

    renderDashboard({ income, debtPlanning, transactions, budgets });
  } catch (error) {
    renderError(error.message || "Could not load dashboard.");
  }
}

function bindEvents() {
  elements.logoutButton.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });
}

async function requireSession() {
  const { user } = await apiRequest("/api/me");
  if (!user) {
    window.location.href = "login.html";
    throw new Error("Redirecting to login.");
  }
}

function renderDashboard({ income, debtPlanning, transactions, budgets }) {
  renderGlanceCards(income, debtPlanning);
  renderDebtChart(debtPlanning);
  renderActiveDebts(debtPlanning.debts || []);
  renderRecentActivity(income.entries || [], transactions.transactions || [], debtPlanning.debts || []);
  renderCycleBudget(
    transactions.transactions || [],
    budgets.budgets || [],
    income.totals || {},
    debtPlanning.summary || {}
  );
}

function renderGlanceCards(income, debtPlanning) {
  const fixedSource = (income.sources || []).find((source) => source.currentVersion);
  if (fixedSource) {
    elements.nextSalary.textContent = formatCurrency(fixedSource.currentVersion.amount, fixedSource.currentVersion.currency);
    elements.salaryHint.textContent = fixedSource.name;
  } else {
    elements.nextSalary.textContent = "-";
    elements.salaryHint.textContent = "Add income";
  }

  const summary = debtPlanning.summary || {};
  elements.plannedCycle.textContent = formatTotals(summary.monthlyDebtPlannedByCurrency);
  elements.paidCycle.textContent = formatTotals(summary.debtActuallyPaidByCurrency);
  elements.totalDebt.textContent = formatTotals(summary.totalDebtRemainingByCurrency);
  elements.activeDebtCount.textContent = `${summary.activeDebtCount || 0} active`;

  elements.plannedHint.textContent = hasTotals(summary.monthlyDebtPlannedByCurrency) ? "Ready for payday" : "-";
  elements.paidHint.textContent = hasTotals(summary.debtActuallyPaidByCurrency) ? "Nice progress" : "-";
}

function renderDebtChart(debtPlanning) {
  const paidTotals = debtPlanning.summary?.debtActuallyPaidByCurrency || {};
  const entries = Object.entries(paidTotals).filter(([, value]) => value > 0);

  if (!entries.length) {
    elements.debtChart.innerHTML = `
      <div class="friendly-empty">
        <strong>No payments yet.</strong>
        <span>Record your first payment from the Debts page.</span>
      </div>
    `;
    return;
  }

  const max = Math.max(...entries.map(([, value]) => value));
  elements.debtChart.innerHTML = entries.map(([currency, value]) => {
    const height = Math.max(18, Math.round((value / max) * 120));
    return `
      <div class="chart-column">
        <span class="chart-bar" style="height: ${height}px"></span>
        <strong>${formatCurrency(value, currency)}</strong>
      </div>
    `;
  }).join("");
}

function renderActiveDebts(debts) {
  const activeDebts = debts.filter((debt) => debt.status === "ACTIVE").slice(0, 4);

  if (!activeDebts.length) {
    elements.activeDebts.innerHTML = `
      <div class="friendly-empty compact-empty">
        <strong>No debts yet.</strong>
        <a href="debts.html">Add one</a>
      </div>
    `;
    return;
  }

  elements.activeDebts.innerHTML = activeDebts.map((debt) => `
    <a class="mini-debt" href="debts.html">
      <span>
        <strong>${escapeHtml(debt.name)}</strong>
        <small>${debt.percentPaid}% paid</small>
      </span>
      <em>${formatCurrency(debt.currentBalance, debt.currency)}</em>
    </a>
  `).join("");
}

function renderRecentActivity(incomeEntries, transactions, debts) {
  const debtPayments = debts.flatMap((debt) => (debt.paymentsThisMonth || []).map((payment) => ({
    type: "Debt payment",
    label: debt.name,
    amount: payment.amount,
    currency: payment.currency,
    date: payment.paidOn
  })));

  const incomeActivity = incomeEntries.map((entry) => ({
    type: "Income",
    label: entry.sourceName,
    amount: entry.amount,
    currency: entry.currency,
    date: entry.receivedOn
  }));

  const transactionActivity = transactions.slice(0, 4).map((transaction) => ({
    type: transaction.isFixedExpense ? "Fixed expense" : (transaction.type === "income" ? "Income" : "Expense"),
    label: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency || "USD",
    date: transaction.date
  }));

  const activity = [...debtPayments, ...incomeActivity, ...transactionActivity]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  if (!activity.length) {
    elements.recentActivity.innerHTML = `
      <div class="friendly-empty compact-empty">
        <strong>No activity yet.</strong>
        <span>Your first income, expense, or debt payment will show here.</span>
      </div>
    `;
    return;
  }

  elements.recentActivity.innerHTML = activity.map((item) => `
    <div class="activity-item">
      <span>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.type)} - ${formatDate(item.date)}</small>
      </span>
      <em>${formatCurrency(item.amount, item.currency)}</em>
    </div>
  `).join("");
}

function renderCycleBudget(transactions, budgets, incomeTotals, debtSummary) {
  const incomeByCurrency = { ...incomeTotals };
  const fixedExpensesByCurrency = {};
  const otherSpendingByCurrency = {};
  const debtPaymentsByCurrency = { ...(debtSummary.debtActuallyPaidByCurrency || {}) };
  const budgetByCurrency = {};

  transactions.forEach((transaction) => {
    const currency = transaction.currency || "USD";
    if (transaction.type === "income") {
      addToCurrencyTotals(incomeByCurrency, currency, transaction.amount);
    } else if (transaction.type === "expense") {
      addToCurrencyTotals(
        transaction.isFixedExpense ? fixedExpensesByCurrency : otherSpendingByCurrency,
        currency,
        transaction.amount
      );
    }
  });

  budgets.forEach((budget) => {
    addToCurrencyTotals(budgetByCurrency, "USD", budget.amount);
  });

  const totalOutgoingsByCurrency = mergeCurrencyTotals(
    fixedExpensesByCurrency,
    otherSpendingByCurrency,
    debtPaymentsByCurrency
  );
  const remainingByCurrency = subtractCurrencyTotals(incomeByCurrency, totalOutgoingsByCurrency);
  const displayCurrencies = [...new Set([
    ...Object.keys(incomeByCurrency),
    ...Object.keys(totalOutgoingsByCurrency)
  ])];

  if (!hasTotals(incomeByCurrency)) {
    elements.cycleBudget.innerHTML = `
      <div class="friendly-empty compact-empty">
        <a href="income.html">Add an income source</a>
        <span>to see your cycle budget.</span>
      </div>
    `;
    return;
  }

  elements.cycleBudget.innerHTML = `
    <div class="amount-left-hero${hasNegativeTotals(remainingByCurrency) ? " is-negative" : ""}">
      <span>Available after spending and debt</span>
      <strong>${formatTotals(remainingByCurrency)}</strong>
    </div>
    <div class="amount-left-breakdown">
      <span>Monthly income <strong>${formatBreakdownTotals(incomeByCurrency, displayCurrencies)}</strong></span>
      <span>Fixed expenses <strong>−${formatBreakdownTotals(fixedExpensesByCurrency, displayCurrencies)}</strong></span>
      <span>Other spending <strong>−${formatBreakdownTotals(otherSpendingByCurrency, displayCurrencies)}</strong></span>
      <span>Debt payments made <strong>−${formatBreakdownTotals(debtPaymentsByCurrency, displayCurrencies)}</strong></span>
    </div>
    ${hasTotals(budgetByCurrency) ? `<p class="cycle-budget-note">Budget targets: ${formatTotals(budgetByCurrency)}</p>` : ""}
  `;
}

function renderError(message) {
  elements.recentActivity.innerHTML = `<div class="friendly-empty compact-empty"><strong>${escapeHtml(message)}</strong></div>`;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "same-origin",
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function hasTotals(totals = {}) {
  return Object.values(totals).some((value) => value > 0);
}

function sumTotals(totals = {}) {
  return Object.values(totals).reduce((sum, value) => sum + Number(value || 0), 0);
}

function addToCurrencyTotals(totals, currency, amount) {
  totals[currency] = (totals[currency] || 0) + Number(amount || 0);
}

function subtractCurrencyTotals(incomeTotals = {}, expenseTotals = {}) {
  const currencies = new Set([...Object.keys(incomeTotals), ...Object.keys(expenseTotals)]);

  return [...currencies].reduce((totals, currency) => {
    totals[currency] = Number(incomeTotals[currency] || 0) - Number(expenseTotals[currency] || 0);
    return totals;
  }, {});
}

function mergeCurrencyTotals(...groups) {
  return groups.reduce((combined, totals) => {
    Object.entries(totals || {}).forEach(([currency, amount]) => {
      addToCurrencyTotals(combined, currency, amount);
    });
    return combined;
  }, {});
}

function hasNegativeTotals(totals = {}) {
  return Object.values(totals).some((amount) => Number(amount) < 0);
}

function formatBreakdownTotals(totals = {}, currencies = []) {
  const displayCurrencies = currencies.length ? currencies : ["USD"];
  return displayCurrencies
    .map((currency) => formatCurrency(Number(totals[currency] || 0), currency))
    .join(" / ");
}

function formatTotals(totals = {}) {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0);
  if (!entries.length) return formatCurrency(0, "USD");
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" / ");
}

function formatCurrency(amount, currency) {
  const meta = currencyMeta[currency] || currencyMeta.USD;
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.currency,
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(year, month - 1, day));
}

function toMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
