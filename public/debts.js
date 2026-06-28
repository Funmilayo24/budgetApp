const currencyMeta = {
  USD: { locale: "en-US", currency: "USD" },
  NGN: { locale: "en-NG", currency: "NGN" },
  EUR: { locale: "de-DE", currency: "EUR" },
  GBP: { locale: "en-GB", currency: "GBP" }
};

const categoryLabels = {
  CREDIT_CARD: "Credit Card",
  PERSONAL_LOAN: "Personal Loan",
  MORTGAGE: "Mortgage",
  STUDENT_LOAN: "Student Loan",
  FAMILY_LOAN: "Family Loan",
  CAR_FINANCE: "Car Finance",
  BUY_NOW_PAY_LATER: "Buy Now Pay Later",
  OTHER: "Other"
};

const elements = {
  logoutButton: document.querySelector("#logoutButton"),
  openDebtModalButton: document.querySelector("#openDebtModalButton"),
  closeDebtModalButton: document.querySelector("#closeDebtModalButton"),
  debtModal: document.querySelector("#debtModal"),
  debtNameInput: document.querySelector("#debtNameInput"),
  monthPicker: document.querySelector("#monthPicker"),
  debtForm: document.querySelector("#debtForm"),
  debtCategoryInput: document.querySelector("#debtCategoryInput"),
  debtMessage: document.querySelector("#debtMessage"),
  debtPageMessage: document.querySelector("#debtPageMessage"),
  plannedTotal: document.querySelector("#plannedTotal"),
  actualTotal: document.querySelector("#actualTotal"),
  remainingDebtTotal: document.querySelector("#remainingDebtTotal"),
  activeDebtCount: document.querySelector("#activeDebtCount"),
  debtList: document.querySelector("#debtList"),
  debtEmptyState: document.querySelector("#debtEmptyState"),
  historyPanel: document.querySelector("#historyPanel"),
  historyTitle: document.querySelector("#historyTitle"),
  historyList: document.querySelector("#historyList")
};

const state = {
  categories: [],
  debts: [],
  summary: {
    monthlyDebtPlannedByCurrency: {},
    debtActuallyPaidByCurrency: {},
    totalDebtRemainingByCurrency: {},
    activeDebtCount: 0
  }
};

let selectedMonth = toMonthValue(new Date());

initialize();

async function initialize() {
  elements.monthPicker.value = selectedMonth;
  bindEvents();

  try {
    await requireSession();
    await loadPlanning();
  } catch (error) {
    showMessage(error.message || "Could not load debts.");
  }
}

function bindEvents() {
  elements.logoutButton?.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });

  elements.openDebtModalButton.addEventListener("click", () => {
    openDebtModal();
  });

  elements.closeDebtModalButton.addEventListener("click", () => {
    closeDebtModal();
  });

  elements.debtModal.addEventListener("click", (event) => {
    if (event.target === elements.debtModal) {
      closeDebtModal();
    }
  });

  elements.debtModal.addEventListener("close", () => {
    clearMessage(elements.debtMessage);
  });

  elements.monthPicker.addEventListener("change", async () => {
    selectedMonth = elements.monthPicker.value || toMonthValue(new Date());
    await loadPlanning();
  });

  elements.debtForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createDebt(new FormData(elements.debtForm));
  });

  elements.debtList.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;

    if (form.classList.contains("plan-form")) {
      await savePlan(form);
    }

    if (form.classList.contains("payment-form")) {
      await recordPayment(form);
    }
  });

  elements.debtList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-id]");
    if (!button) return;
    await showHistory(button.dataset.historyId);
  });
}

async function requireSession() {
  const { user } = await apiRequest("/api/me");
  if (!user) {
    window.location.href = "login.html";
    throw new Error("Redirecting to login.");
  }
}

async function loadPlanning() {
  const data = await apiRequest(`/api/debt-planning?month=${encodeURIComponent(selectedMonth)}`);
  state.categories = data.categories || [];
  state.debts = data.debts || [];
  state.summary = data.summary || state.summary;
  render();
}

async function createDebt(formData) {
  const body = Object.fromEntries(formData.entries());
  const dueDate = parseDateInput(body.dueDate);

  if (dueDate) {
    body.dueDay = dueDate.getDate();
  }

  delete body.dueDate;

  try {
    await apiRequest("/api/debts", {
      method: "POST",
      body: JSON.stringify(body)
    });
    elements.debtForm.reset();
    closeDebtModal();
    showMessage("Debt created.", elements.debtPageMessage);
    await loadPlanning();
  } catch (error) {
    showMessage(error.message, elements.debtMessage);
  }
}

async function savePlan(form) {
  const formData = new FormData(form);

  try {
    await apiRequest("/api/debt-payment-plans", {
      method: "POST",
      body: JSON.stringify({
        debtId: form.dataset.debtId,
        month: selectedMonth,
        amount: Number(formData.get("amount")),
        note: formData.get("note")
      })
    });
    showMessage("Planned payment saved.", elements.debtPageMessage);
    await loadPlanning();
  } catch (error) {
    showMessage(error.message, elements.debtPageMessage);
  }
}

async function recordPayment(form) {
  const formData = new FormData(form);

  try {
    await apiRequest("/api/debt-payments", {
      method: "POST",
      body: JSON.stringify({
        debtId: form.dataset.debtId,
        month: selectedMonth,
        amount: Number(formData.get("amount")),
        paidOn: formData.get("paidOn") || toDateValue(new Date()),
        note: formData.get("note")
      })
    });
    form.reset();
    showMessage("Actual payment recorded.", elements.debtPageMessage);
    await loadPlanning();
  } catch (error) {
    showMessage(error.message, elements.debtPageMessage);
  }
}

async function showHistory(debtId) {
  try {
    const data = await apiRequest(`/api/debts/${encodeURIComponent(debtId)}/history`);
    elements.historyPanel.hidden = false;
    elements.historyTitle.textContent = `${data.debt.name} History`;
    elements.historyList.innerHTML = data.history.length
      ? data.history.map((row) => renderHistoryRow(row, data.debt)).join("")
      : '<p class="empty-state visible">No payment history yet.</p>';
    elements.historyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showMessage(error.message, elements.debtPageMessage);
  }
}

function openDebtModal() {
  clearMessage(elements.debtPageMessage);
  elements.debtModal.showModal();
  window.setTimeout(() => elements.debtNameInput.focus(), 0);
}

function closeDebtModal() {
  if (elements.debtModal.open) {
    elements.debtModal.close();
  }
}

function render() {
  renderCategoryOptions();
  renderSummary();
  renderDebts();
}

function renderCategoryOptions() {
  elements.debtCategoryInput.innerHTML = state.categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabels[category] || category)}</option>`)
    .join("");
}

function renderSummary() {
  elements.plannedTotal.textContent = formatTotals(state.summary.monthlyDebtPlannedByCurrency);
  elements.actualTotal.textContent = formatTotals(state.summary.debtActuallyPaidByCurrency);
  elements.remainingDebtTotal.textContent = formatTotals(state.summary.totalDebtRemainingByCurrency);
  elements.activeDebtCount.textContent = String(state.summary.activeDebtCount || 0);
}

function renderDebts() {
  elements.debtList.innerHTML = state.debts.map(renderDebtCard).join("");
  elements.debtEmptyState.classList.toggle("visible", state.debts.length === 0);
}

function renderDebtCard(debt) {
  const disabled = debt.status !== "ACTIVE" ? "disabled" : "";
  const planAmount = debt.plan ? debt.plan.amount : debt.minimumPayment || "";
  const paidLabel = `${debt.percentPaid}% Paid`;
  const remainingLabel = `${debt.percentRemaining}% Remaining`;

  return `
    <article class="debt-card">
      <div class="debt-card-head">
        <div>
          <p class="eyebrow">${escapeHtml(categoryLabels[debt.category] || debt.category)}</p>
          <h3>${escapeHtml(debt.name)}</h3>
        </div>
        <span class="type-pill ${debt.status === "PAID" ? "income" : "expense"}">${debt.status.toLowerCase()}</span>
      </div>

      <div class="debt-stats">
        <span>Original <strong>${formatCurrency(debt.originalAmount, debt.currency)}</strong></span>
        <span>Paid <strong>${formatCurrency(debt.amountPaid, debt.currency)}</strong></span>
        <span>Remaining <strong>${formatCurrency(debt.currentBalance, debt.currency)}</strong></span>
      </div>

      <div class="progress-track" aria-hidden="true">
        <div class="progress-bar" style="width: ${debt.percentPaid}%"></div>
      </div>
      <div class="budget-meta">
        <span>${paidLabel}</span>
        <span>${remainingLabel}</span>
      </div>

      <div class="debt-forms">
        <form class="plan-form compact-form" data-debt-id="${escapeHtml(debt.id)}">
          <label>
            <span>Planned This Month</span>
            <input name="amount" type="number" min="0" step="0.01" value="${escapeHtml(planAmount)}" ${disabled}>
          </label>
          <input name="note" type="text" maxlength="240" placeholder="Plan note" ${disabled}>
          <button class="secondary-button" type="submit" ${disabled}>Save Plan</button>
        </form>

        <form class="payment-form compact-form" data-debt-id="${escapeHtml(debt.id)}">
          <label>
            <span>Actual Payment</span>
            <input name="amount" type="number" min="0.01" step="0.01" ${disabled}>
          </label>
          <input name="paidOn" type="date" value="${toDateValue(new Date())}" ${disabled}>
          <button class="primary-button" type="submit" ${disabled}>Record Payment</button>
        </form>
      </div>

      <button class="icon-text-button history-button" type="button" data-history-id="${escapeHtml(debt.id)}">View History</button>
    </article>
  `;
}

function renderHistoryRow(row, debt) {
  return `
    <article class="history-row">
      <span>${escapeHtml(row.month)}</span>
      <span>Planned <strong>${formatCurrency(row.planned, debt.currency)}</strong></span>
      <span>Actual <strong>${formatCurrency(row.actual, debt.currency)}</strong></span>
      <span>Difference <strong>${formatCurrency(row.difference, debt.currency)}</strong></span>
    </article>
  `;
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

  if (response.status === 401 && !url.endsWith("/api/me")) {
    window.location.href = "login.html";
    throw new Error("Authentication required.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function formatCurrency(amount, currency) {
  const meta = currencyMeta[currency] || currencyMeta.USD;
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.currency,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatTotals(totals = {}) {
  const entries = Object.entries(totals).filter(([, amount]) => amount > 0);
  if (!entries.length) return formatCurrency(0, "USD");
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" / ");
}

function toMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateInput(value) {
  const date = new Date(`${value || ""}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function showMessage(message, element = elements.debtPageMessage) {
  element.textContent = message;
  window.clearTimeout(element.timeoutId);
  element.timeoutId = window.setTimeout(() => {
    clearMessage(element);
  }, 3000);
}

function clearMessage(element) {
  element.textContent = "";
  window.clearTimeout(element.timeoutId);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
