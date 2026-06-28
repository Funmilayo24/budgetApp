const currencyMeta = {
  USD: { locale: "en-US", currency: "USD" },
  NGN: { locale: "en-NG", currency: "NGN" },
  EUR: { locale: "de-DE", currency: "EUR" },
  GBP: { locale: "en-GB", currency: "GBP" }
};

const state = {
  categories: [],
  fixedExpenses: [],
  occurrences: [],
  totals: {},
  activeCount: 0
};

const elements = {
  logoutButton: document.querySelector("#logoutButton"),
  monthPicker: document.querySelector("#monthPicker"),
  openFixedExpenseModalButton: document.querySelector("#openFixedExpenseModalButton"),
  closeFixedExpenseModalButton: document.querySelector("#closeFixedExpenseModalButton"),
  fixedExpenseModal: document.querySelector("#fixedExpenseModal"),
  fixedExpenseForm: document.querySelector("#fixedExpenseForm"),
  fixedExpenseIdInput: document.querySelector("#fixedExpenseIdInput"),
  fixedExpenseNameInput: document.querySelector("#fixedExpenseNameInput"),
  fixedExpenseStartMonthInput: document.querySelector("#fixedExpenseStartMonthInput"),
  fixedExpenseActiveInput: document.querySelector("#fixedExpenseActiveInput"),
  fixedExpenseCategoryInput: document.querySelector("#fixedExpenseCategoryInput"),
  fixedExpenseMessage: document.querySelector("#fixedExpenseMessage"),
  fixedExpensePageMessage: document.querySelector("#fixedExpensePageMessage"),
  monthlyTotal: document.querySelector("#monthlyTotal"),
  activeCount: document.querySelector("#activeCount"),
  includedCount: document.querySelector("#includedCount"),
  nextDue: document.querySelector("#nextDue"),
  fixedExpenseList: document.querySelector("#fixedExpenseList"),
  fixedExpenseEmptyState: document.querySelector("#fixedExpenseEmptyState"),
  fixedExpenseMonthTable: document.querySelector("#fixedExpenseMonthTable"),
  fixedExpenseMonthEmptyState: document.querySelector("#fixedExpenseMonthEmptyState")
};

let selectedMonth = toMonthValue(new Date());

initialize();

async function initialize() {
  elements.monthPicker.value = selectedMonth;
  elements.fixedExpenseStartMonthInput.value = selectedMonth;
  bindEvents();

  try {
    await requireSession();
    await loadFixedExpenses();
  } catch (error) {
    showMessage(elements.fixedExpensePageMessage, error.message || "Could not load fixed expenses.");
  }
}

function bindEvents() {
  elements.logoutButton?.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });

  elements.monthPicker.addEventListener("change", async () => {
    selectedMonth = elements.monthPicker.value || toMonthValue(new Date());
    await loadFixedExpenses();
  });

  elements.openFixedExpenseModalButton.addEventListener("click", () => {
    openFixedExpenseModal();
  });

  elements.closeFixedExpenseModalButton.addEventListener("click", () => {
    closeFixedExpenseModal();
  });

  elements.fixedExpenseModal.addEventListener("click", (event) => {
    if (event.target === elements.fixedExpenseModal) {
      closeFixedExpenseModal();
    }
  });

  elements.fixedExpenseModal.addEventListener("close", () => {
    clearMessage(elements.fixedExpenseMessage);
  });

  elements.fixedExpenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveFixedExpense(new FormData(elements.fixedExpenseForm));
  });

  elements.fixedExpenseList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-fixed-expense-id]");
    if (editButton) {
      openFixedExpenseModal(editButton.dataset.editFixedExpenseId);
    }
  });
}

async function requireSession() {
  const { user } = await apiRequest("/api/me");
  if (!user) {
    window.location.href = "login.html";
    throw new Error("Redirecting to login.");
  }
}

async function loadFixedExpenses() {
  const data = await apiRequest(`/api/fixed-expenses?month=${encodeURIComponent(selectedMonth)}`);
  state.categories = data.categories || [];
  state.fixedExpenses = data.fixedExpenses || [];
  state.occurrences = data.occurrences || [];
  state.totals = data.totals || {};
  state.activeCount = data.activeCount || 0;
  render();
}

async function saveFixedExpense(formData) {
  const id = String(formData.get("id") || "");
  const body = {
    name: formData.get("name"),
    amount: Number(formData.get("amount")),
    currency: formData.get("currency"),
    categoryId: formData.get("categoryId"),
    dueDay: Number(formData.get("dueDay")),
    startMonth: formData.get("startMonth"),
    active: elements.fixedExpenseActiveInput.checked,
    notes: formData.get("notes")
  };

  try {
    await apiRequest(id ? `/api/fixed-expenses/${encodeURIComponent(id)}` : "/api/fixed-expenses", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    closeFixedExpenseModal();
    showMessage(elements.fixedExpensePageMessage, id ? "Fixed expense updated." : "Fixed expense saved.");
    await loadFixedExpenses();
  } catch (error) {
    showMessage(elements.fixedExpenseMessage, error.message);
  }
}

function openFixedExpenseModal(fixedExpenseId = "") {
  const fixedExpense = state.fixedExpenses.find((item) => item.id === fixedExpenseId);
  elements.fixedExpenseForm.reset();
  elements.fixedExpenseIdInput.value = fixedExpense?.id || "";
  elements.fixedExpenseStartMonthInput.value = fixedExpense?.startMonth || selectedMonth;
  elements.fixedExpenseActiveInput.checked = fixedExpense ? fixedExpense.active : true;
  renderCategoryOptions(fixedExpense?.categoryId || "");

  if (fixedExpense) {
    elements.fixedExpenseForm.elements.name.value = fixedExpense.name;
    elements.fixedExpenseForm.elements.amount.value = fixedExpense.amount;
    elements.fixedExpenseForm.elements.currency.value = fixedExpense.currency;
    elements.fixedExpenseForm.elements.dueDay.value = fixedExpense.dueDay || "";
    elements.fixedExpenseForm.elements.notes.value = fixedExpense.notes || "";
  } else {
    elements.fixedExpenseForm.elements.currency.value = "USD";
    elements.fixedExpenseForm.elements.dueDay.value = "1";
  }

  document.querySelector("#fixedExpenseModalTitle").textContent = fixedExpense ? "Edit Fixed Expense" : "Add Fixed Expense";
  clearMessage(elements.fixedExpensePageMessage);
  clearMessage(elements.fixedExpenseMessage);
  elements.fixedExpenseModal.showModal();
  window.setTimeout(() => elements.fixedExpenseNameInput.focus(), 0);
}

function closeFixedExpenseModal() {
  if (elements.fixedExpenseModal.open) {
    elements.fixedExpenseModal.close();
  }
}

function render() {
  renderSummary();
  renderCategoryOptions(elements.fixedExpenseCategoryInput.value);
  renderFixedExpenses();
  renderOccurrences();
}

function renderSummary() {
  const nextOccurrence = state.occurrences.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
  elements.monthlyTotal.textContent = formatTotals(state.totals);
  elements.activeCount.textContent = String(state.activeCount);
  elements.includedCount.textContent = String(state.occurrences.length);
  elements.nextDue.textContent = nextOccurrence ? formatShortDate(nextOccurrence.date) : "-";
}

function renderCategoryOptions(selectedId = "") {
  elements.fixedExpenseCategoryInput.innerHTML = [
    `<option value="">No category</option>`,
    ...state.categories.map((category) => `
      <option value="${escapeHtml(category.id)}"${category.id === selectedId ? " selected" : ""}>${escapeHtml(category.name)}</option>
    `)
  ].join("");
}

function renderFixedExpenses() {
  elements.fixedExpenseList.innerHTML = state.fixedExpenses.map((fixedExpense) => `
    <article class="income-source-card fixed-expense-card">
      <div class="budget-row-top income-source-card-head">
        <span class="income-source-title">
          <span class="budget-name">${escapeHtml(fixedExpense.name)}</span>
          <small>${escapeHtml(fixedExpense.category?.name || "No category")} - due day ${escapeHtml(fixedExpense.dueDay || "-")}</small>
        </span>
        <div class="income-source-actions">
          <span class="budget-amount">${formatCurrency(fixedExpense.amount, fixedExpense.currency)}</span>
          <span class="type-pill ${fixedExpense.active ? "income" : "expense"}">${fixedExpense.active ? "active" : "paused"}</span>
          <button class="icon-button" type="button" data-edit-fixed-expense-id="${escapeHtml(fixedExpense.id)}" aria-label="Edit ${escapeHtml(fixedExpense.name)}">
            <svg class="icon" aria-hidden="true"><use href="#icon-dots"></use></svg>
          </button>
        </div>
      </div>
      ${fixedExpense.notes ? `<p class="page-note">${escapeHtml(fixedExpense.notes)}</p>` : ""}
    </article>
  `).join("");

  elements.fixedExpenseEmptyState.classList.toggle("visible", state.fixedExpenses.length === 0);
}

function renderOccurrences() {
  elements.fixedExpenseMonthTable.innerHTML = state.occurrences.map((occurrence) => `
    <tr>
      <td>${formatShortDate(occurrence.date)}</td>
      <td>${escapeHtml(occurrence.description)}</td>
      <td>${escapeHtml(occurrence.category?.name || "-")}</td>
      <td class="amount-cell expense">${formatCurrency(occurrence.amount, occurrence.currency)}</td>
    </tr>
  `).join("");

  elements.fixedExpenseMonthEmptyState.classList.toggle("visible", state.occurrences.length === 0);
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

function formatTotals(totals = {}) {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0);
  if (!entries.length) return formatCurrency(0, "USD");
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" / ");
}

function formatCurrency(amount, currency) {
  const meta = currencyMeta[currency] || currencyMeta.USD;
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.currency
  }).format(amount || 0);
}

function formatShortDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(year, month - 1, day));
}

function toMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function showMessage(element, message) {
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
