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
  completedDebtsPanel: document.querySelector("#completedDebtsPanel"),
  completedDebtList: document.querySelector("#completedDebtList"),
  historyPanel: document.querySelector("#historyPanel"),
  historyTitle: document.querySelector("#historyTitle"),
  historyList: document.querySelector("#historyList"),
  planModal: document.querySelector("#planModal"),
  planForm: document.querySelector("#planForm"),
  planDebtId: document.querySelector("#planDebtId"),
  planAmountInput: document.querySelector("#planAmountInput"),
  planNoteInput: document.querySelector("#planNoteInput"),
  planModalTitle: document.querySelector("#planModalTitle"),
  planModalContext: document.querySelector("#planModalContext"),
  planMessage: document.querySelector("#planMessage"),
  closePlanModalButton: document.querySelector("#closePlanModalButton"),
  cancelPlanModalButton: document.querySelector("#cancelPlanModalButton"),
  paymentModal: document.querySelector("#paymentModal"),
  paymentForm: document.querySelector("#paymentForm"),
  paymentDebtId: document.querySelector("#paymentDebtId"),
  paymentAmountInput: document.querySelector("#paymentAmountInput"),
  paymentDateInput: document.querySelector("#paymentDateInput"),
  paymentModalTitle: document.querySelector("#paymentModalTitle"),
  paymentModalContext: document.querySelector("#paymentModalContext"),
  paymentMessage: document.querySelector("#paymentMessage"),
  closePaymentModalButton: document.querySelector("#closePaymentModalButton"),
  cancelPaymentModalButton: document.querySelector("#cancelPaymentModalButton")
};

const state = {
  categories: [],
  debts: [],
  completedDebts: [],
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

  elements.debtList.addEventListener("click", async (event) => {
    const historyButton = event.target.closest("[data-history-id]");
    if (historyButton) {
      await showHistory(historyButton.dataset.historyId);
      return;
    }

    const planButton = event.target.closest("[data-plan-id]");
    if (planButton) {
      openPlanModal(planButton.dataset.planId);
      return;
    }

    const paymentButton = event.target.closest("[data-payment-id]");
    if (paymentButton) openPaymentModal(paymentButton.dataset.paymentId);
  });

  elements.completedDebtList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-id]");
    if (button) await showHistory(button.dataset.historyId);
  });

  elements.planForm.addEventListener("submit", savePlan);
  elements.closePlanModalButton.addEventListener("click", closePlanModal);
  elements.cancelPlanModalButton.addEventListener("click", closePlanModal);
  elements.planModal.addEventListener("click", (event) => {
    if (event.target === elements.planModal) closePlanModal();
  });

  elements.paymentForm.addEventListener("submit", recordPayment);
  elements.closePaymentModalButton.addEventListener("click", closePaymentModal);
  elements.cancelPaymentModalButton.addEventListener("click", closePaymentModal);
  elements.paymentModal.addEventListener("click", (event) => {
    if (event.target === elements.paymentModal) closePaymentModal();
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
  state.completedDebts = data.completedDebts || [];
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

async function savePlan(event) {
  event.preventDefault();
  const formData = new FormData(elements.planForm);

  try {
    await apiRequest("/api/debt-payment-plans", {
      method: "POST",
      body: JSON.stringify({
        debtId: formData.get("debtId"),
        month: selectedMonth,
        amount: Number(formData.get("amount")),
        note: formData.get("note")
      })
    });
    closePlanModal();
    showMessage("Monthly plan updated.", elements.debtPageMessage);
    await loadPlanning();
  } catch (error) {
    showMessage(error.message, elements.planMessage);
  }
}

async function recordPayment(event) {
  event.preventDefault();
  const formData = new FormData(elements.paymentForm);

  try {
    await apiRequest("/api/debt-payments", {
      method: "POST",
      body: JSON.stringify({
        debtId: formData.get("debtId"),
        month: selectedMonth,
        amount: Number(formData.get("amount")),
        paidOn: formData.get("paidOn") || toDateValue(new Date()),
        note: formData.get("note")
      })
    });
    closePaymentModal();
    showMessage("Payment recorded.", elements.debtPageMessage);
    await loadPlanning();
  } catch (error) {
    showMessage(error.message, elements.paymentMessage);
  }
}

function openPlanModal(debtId) {
  const debt = state.debts.find((item) => item.id === debtId);
  if (!debt || !isSelectedMonthEditable()) return;

  elements.planForm.reset();
  clearMessage(elements.planMessage);
  elements.planDebtId.value = debt.id;
  elements.planAmountInput.value = debt.plan?.amount ?? debt.minimumPayment ?? 0;
  elements.planAmountInput.max = debt.currentBalance;
  elements.planNoteInput.value = debt.plan?.note || "";
  elements.planModalTitle.textContent = debt.plan ? "Edit Planned Payment" : "Create Payment Plan";
  elements.planModalContext.textContent = `${debt.name} · ${formatCurrency(debt.currentBalance, debt.currency)} remaining`;
  elements.planModal.showModal();
  elements.planAmountInput.focus();
  elements.planAmountInput.select();
}

function closePlanModal() {
  if (elements.planModal.open) elements.planModal.close();
  elements.planForm.reset();
  clearMessage(elements.planMessage);
}

function openPaymentModal(debtId) {
  const debt = state.debts.find((item) => item.id === debtId);
  if (!debt || !isSelectedMonthEditable()) return;

  const plannedRemaining = Math.max(0, Number(debt.plan?.amount || 0) - Number(debt.actualPaidThisMonth || 0));
  const suggestedAmount = Math.min(debt.currentBalance, plannedRemaining);

  elements.paymentForm.reset();
  clearMessage(elements.paymentMessage);
  elements.paymentDebtId.value = debt.id;
  elements.paymentAmountInput.value = suggestedAmount > 0 ? suggestedAmount : "";
  elements.paymentAmountInput.max = debt.currentBalance;
  elements.paymentDateInput.value = toDateValue(new Date());
  elements.paymentModalTitle.textContent = "Record Payment";
  elements.paymentModalContext.textContent = `${debt.name} · ${formatCurrency(debt.currentBalance, debt.currency)} remaining`;
  elements.paymentModal.showModal();
  elements.paymentAmountInput.focus();
  elements.paymentAmountInput.select();
}

function closePaymentModal() {
  if (elements.paymentModal.open) elements.paymentModal.close();
  elements.paymentForm.reset();
  clearMessage(elements.paymentMessage);
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
  elements.debtEmptyState.textContent = state.completedDebts.length
    ? "No active debts. Everything is paid off."
    : "No active debts yet.";
  elements.completedDebtsPanel.hidden = state.completedDebts.length === 0;
  elements.completedDebtList.innerHTML = state.completedDebts.map(renderCompletedDebtCard).join("");
}

function renderDebtCard(debt) {
  const editable = isSelectedMonthEditable();
  const disabled = editable ? "" : "disabled";
  const planAmount = debt.plan?.amount || 0;
  const paymentCount = debt.paymentsThisMonth?.length || 0;
  const paidLabel = `${debt.percentPaid}% Paid`;
  const remainingLabel = `${debt.percentRemaining}% Remaining`;

  return `
    <article class="debt-card">
      <div class="debt-card-head">
        <div>
          <p class="eyebrow">${escapeHtml(categoryLabels[debt.category] || debt.category)}</p>
          <h3>${escapeHtml(debt.name)}</h3>
        </div>
        <span class="type-pill expense">active</span>
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

      <div class="debt-payment-overview">
        <section class="debt-payment-summary debt-plan-summary">
          <div>
            <span class="debt-action-label">Monthly plan</span>
            <strong>${formatCurrency(planAmount, debt.currency)}</strong>
            <small>${debt.plan?.note ? escapeHtml(debt.plan.note) : debt.plan ? "Plan saved" : "No plan set"}</small>
          </div>
          <button class="secondary-button" type="button" data-plan-id="${escapeHtml(debt.id)}" ${disabled}>
            ${debt.plan ? "Edit plan" : "Create plan"}
          </button>
        </section>

        <section class="debt-payment-summary debt-actual-summary">
          <div>
            <span class="debt-action-label">Paid this month</span>
            <strong>${formatCurrency(debt.actualPaidThisMonth, debt.currency)}</strong>
            <small>${paymentCount} ${paymentCount === 1 ? "payment" : "payments"} recorded</small>
          </div>
          <button class="primary-button" type="button" data-payment-id="${escapeHtml(debt.id)}" ${disabled}>Record payment</button>
        </section>
      </div>

      <button class="icon-text-button history-button" type="button" data-history-id="${escapeHtml(debt.id)}">View History</button>
    </article>
  `;
}

function renderCompletedDebtCard(debt) {
  return `
    <article class="completed-debt-card">
      <div class="completed-debt-main">
        <span class="completed-check" aria-hidden="true">✓</span>
        <div>
          <p class="eyebrow">${escapeHtml(categoryLabels[debt.category] || debt.category)}</p>
          <h3>${escapeHtml(debt.name)}</h3>
          <small>Paid off${debt.paidAt ? ` · ${escapeHtml(formatDate(debt.paidAt))}` : ""}</small>
        </div>
      </div>
      <div class="completed-debt-total">
        <span>Total paid</span>
        <strong>${formatCurrency(debt.originalAmount, debt.currency)}</strong>
      </div>
      <button class="icon-text-button" type="button" data-history-id="${escapeHtml(debt.id)}">View History</button>
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatTotals(totals = {}) {
  const entries = Object.entries(totals).filter(([, amount]) => amount > 0);
  if (!entries.length) return formatCurrency(0, "USD");
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" / ");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function isSelectedMonthEditable() {
  return selectedMonth >= toMonthValue(new Date());
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
