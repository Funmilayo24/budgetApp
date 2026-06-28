const currencyMeta = {
  USD: { label: "Dollars", locale: "en-US", currency: "USD" },
  NGN: { label: "Naira", locale: "en-NG", currency: "NGN" },
  EUR: { label: "Euros", locale: "de-DE", currency: "EUR" },
  GBP: { label: "Pounds", locale: "en-GB", currency: "GBP" }
};

const incomeFrequencyLabels = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BI_WEEKLY: "Bi-weekly",
  SEMI_MONTHLY: "Twice a month",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Yearly"
};

const state = {
  entries: [],
  sources: [],
  totals: {}
};

const elements = {
  logoutButton: document.querySelector("#logoutButton"),
  openIncomeModalButton: document.querySelector("#openIncomeModalButton"),
  closeIncomeModalButton: document.querySelector("#closeIncomeModalButton"),
  incomeModal: document.querySelector("#incomeModal"),
  incomeSourceInput: document.querySelector("#incomeSourceInput"),
  versionModal: document.querySelector("#versionModal"),
  closeVersionModalButton: document.querySelector("#closeVersionModalButton"),
  versionSourceIdInput: document.querySelector("#versionSourceIdInput"),
  versionSourceContext: document.querySelector("#versionSourceContext"),
  versionAmountInput: document.querySelector("#versionAmountInput"),
  versionCurrencyInput: document.querySelector("#versionCurrencyInput"),
  versionPaymentDayInput: document.querySelector("#versionPaymentDayInput"),
  monthPicker: document.querySelector("#monthPicker"),
  incomeForm: document.querySelector("#incomeForm"),
  versionForm: document.querySelector("#versionForm"),
  incomeMessage: document.querySelector("#incomeMessage"),
  incomePageMessage: document.querySelector("#incomePageMessage"),
  versionMessage: document.querySelector("#versionMessage"),
  receivedOnInput: document.querySelector("#receivedOnInput"),
  paymentDayInput: document.querySelector("#paymentDayInput"),
  effectiveFromInput: document.querySelector("#effectiveFromInput"),
  incomeTotals: document.querySelector("#incomeTotals"),
  incomeSourceList: document.querySelector("#incomeSourceList"),
  sourceEmptyState: document.querySelector("#sourceEmptyState"),
  incomeTable: document.querySelector("#incomeTable"),
  incomeEmptyState: document.querySelector("#incomeEmptyState")
};

let selectedMonth = toMonthValue(new Date());

initialize();

async function initialize() {
  elements.monthPicker.value = selectedMonth;
  setIncomeDateDefaults();
  elements.effectiveFromInput.value = toDateValue(new Date());
  bindEvents();

  try {
    await requireSession();
    await loadIncome();
  } catch (error) {
    showMessage(elements.incomePageMessage, error.message || "Could not load income.");
  }
}

function bindEvents() {
  elements.logoutButton?.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });

  elements.openIncomeModalButton.addEventListener("click", () => {
    openIncomeModal();
  });

  elements.closeIncomeModalButton.addEventListener("click", () => {
    closeIncomeModal();
  });

  elements.incomeModal.addEventListener("click", (event) => {
    if (event.target === elements.incomeModal) {
      closeIncomeModal();
    }
  });

  elements.incomeModal.addEventListener("close", () => {
    clearMessage(elements.incomeMessage);
  });

  elements.closeVersionModalButton.addEventListener("click", () => {
    closeVersionModal();
  });

  elements.versionModal.addEventListener("click", (event) => {
    if (event.target === elements.versionModal) {
      closeVersionModal();
    }
  });

  elements.versionModal.addEventListener("close", () => {
    clearMessage(elements.versionMessage);
  });

  elements.monthPicker.addEventListener("change", async () => {
    selectedMonth = elements.monthPicker.value || toMonthValue(new Date());
    await loadIncome();
  });

  elements.receivedOnInput.addEventListener("change", () => {
    if (!elements.paymentDayInput.value) {
      elements.paymentDayInput.value = getDayFromDateValue(elements.receivedOnInput.value);
    }
  });

  elements.incomeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveIncomeEntry(new FormData(elements.incomeForm));
  });

  elements.versionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveFutureVersion(new FormData(elements.versionForm));
  });

  elements.incomeSourceList.addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-income-menu-id]");
    if (menuButton) {
      event.stopPropagation();
      toggleIncomeMenu(menuButton.dataset.incomeMenuId);
      return;
    }

    const updateButton = event.target.closest("[data-update-source-id]");
    if (updateButton) {
      event.stopPropagation();
      openVersionModal(updateButton.dataset.updateSourceId);
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".income-source-menu")) {
      closeIncomeMenus();
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

async function loadIncome() {
  const data = await apiRequest(`/api/income?month=${encodeURIComponent(selectedMonth)}`);
  state.entries = data.entries || [];
  state.sources = data.sources || [];
  state.totals = data.totals || {};
  render();
}

async function saveIncomeEntry(formData) {
  const body = {
    sourceName: formData.get("sourceName"),
    amount: Number(formData.get("amount")),
    currency: formData.get("currency"),
    frequency: formData.get("frequency"),
    paymentDay: formData.get("paymentDay"),
    receivedOn: formData.get("receivedOn"),
    note: formData.get("note")
  };

  try {
    await apiRequest("/api/income-entries", {
      method: "POST",
      body: JSON.stringify(body)
    });
    elements.incomeForm.reset();
    setIncomeDateDefaults();
    closeIncomeModal();
    showMessage(elements.incomePageMessage, "Income saved.");
    await loadIncome();
  } catch (error) {
    showMessage(elements.incomeMessage, error.message);
  }
}

function openIncomeModal() {
  clearMessage(elements.incomePageMessage);
  elements.incomeModal.showModal();
  window.setTimeout(() => elements.incomeSourceInput.focus(), 0);
}

function closeIncomeModal() {
  if (elements.incomeModal.open) {
    elements.incomeModal.close();
  }
}

function openVersionModal(sourceId) {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;

  const current = source.currentVersion;
  elements.versionForm.reset();
  elements.versionSourceIdInput.value = source.id;
  elements.versionSourceContext.textContent = `${source.name} - ${formatIncomeFrequency(source.frequency)}`;
  elements.versionAmountInput.value = current ? current.amount : "";
  elements.versionCurrencyInput.value = current ? current.currency : "USD";
  elements.versionPaymentDayInput.value = source.paymentDay || "";
  elements.effectiveFromInput.value = toDateValue(new Date());
  clearMessage(elements.incomePageMessage);
  clearMessage(elements.versionMessage);
  closeIncomeMenus();
  elements.versionModal.showModal();
  window.setTimeout(() => elements.versionAmountInput.focus(), 0);
}

function closeVersionModal() {
  if (elements.versionModal.open) {
    elements.versionModal.close();
  }
}

async function saveFutureVersion(formData) {
  const sourceId = String(formData.get("sourceId") || "");

  if (!sourceId) {
    showMessage(elements.versionMessage, "Add a recurring income source first.");
    return;
  }

  try {
    await apiRequest(`/api/income-sources/${encodeURIComponent(sourceId)}/versions`, {
      method: "POST",
      body: JSON.stringify({
        amount: Number(formData.get("amount")),
        currency: formData.get("currency"),
        effectiveFrom: formData.get("effectiveFrom"),
        paymentDay: formData.get("paymentDay")
      })
    });
    elements.versionForm.reset();
    elements.effectiveFromInput.value = toDateValue(new Date());
    closeVersionModal();
    showMessage(elements.incomePageMessage, "Future income change saved.");
    await loadIncome();
  } catch (error) {
    showMessage(elements.versionMessage, error.message);
  }
}

function render() {
  renderTotals();
  renderSources();
  renderEntries();
}

function renderTotals() {
  const rows = Object.entries(currencyMeta).map(([currency, meta]) => {
    const total = state.totals[currency] || 0;
    return `
      <article class="metric metric-income">
        <p>${escapeHtml(meta.label)}</p>
        <strong>${formatCurrency(total, currency)}</strong>
      </article>
    `;
  });

  elements.incomeTotals.innerHTML = rows.join("");
}

function renderSources() {
  const fixedSources = state.sources.filter((source) => source.isFixed);

  elements.incomeSourceList.innerHTML = fixedSources.map((source) => {
    const current = source.currentVersion;
    const versionRows = source.versions
      .slice()
      .reverse()
      .map((version) => `
        <div class="income-version-row">
          <span>${formatDate(version.effectiveFrom)}</span>
          <strong>${formatCurrency(version.amount, version.currency)}</strong>
        </div>
      `)
      .join("");

    return `
      <article class="income-source-card">
        <div class="budget-row-top income-source-card-head">
          <span class="income-source-title">
            <span class="budget-name">${escapeHtml(source.name)}</span>
            <small>${escapeHtml(formatIncomeFrequency(source.frequency))} - ${escapeHtml(formatPaymentDay(source.paymentDay))}</small>
          </span>
          <div class="income-source-actions">
            <span class="budget-amount">${current ? formatCurrency(current.amount, current.currency) : "No amount"}</span>
            <div class="income-source-menu">
              <button class="icon-button" type="button" data-income-menu-id="${escapeHtml(source.id)}" aria-label="Income options for ${escapeHtml(source.name)}" aria-expanded="false">
                <svg class="icon" aria-hidden="true"><use href="#icon-dots"></use></svg>
              </button>
              <div class="income-menu-panel" data-income-menu-panel="${escapeHtml(source.id)}" hidden>
                <button type="button" data-update-source-id="${escapeHtml(source.id)}">Update income</button>
              </div>
            </div>
          </div>
        </div>
        <div class="income-version-list">${versionRows}</div>
      </article>
    `;
  }).join("");

  elements.sourceEmptyState.classList.toggle("visible", fixedSources.length === 0);
}

function toggleIncomeMenu(sourceId) {
  const panel = [...elements.incomeSourceList.querySelectorAll("[data-income-menu-panel]")]
    .find((item) => item.dataset.incomeMenuPanel === sourceId);
  const button = [...elements.incomeSourceList.querySelectorAll("[data-income-menu-id]")]
    .find((item) => item.dataset.incomeMenuId === sourceId);
  const shouldOpen = panel?.hidden;

  closeIncomeMenus();

  if (panel && button && shouldOpen) {
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
  }
}

function closeIncomeMenus() {
  elements.incomeSourceList.querySelectorAll("[data-income-menu-panel]").forEach((panel) => {
    panel.hidden = true;
  });

  elements.incomeSourceList.querySelectorAll("[data-income-menu-id]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function renderEntries() {
  const entries = state.entries.slice().sort((a, b) => b.receivedOn.localeCompare(a.receivedOn));

  elements.incomeTable.innerHTML = entries.map((entry) => `
    <tr>
      <td>${formatDate(entry.receivedOn)}</td>
      <td>${escapeHtml(entry.sourceName)}</td>
      <td>${escapeHtml(formatIncomeFrequency(entry.frequency))}</td>
      <td>${escapeHtml(entry.note || "")}</td>
      <td class="amount-cell income">${formatCurrency(entry.amount, entry.currency)}</td>
    </tr>
  `).join("");

  elements.incomeEmptyState.classList.toggle("visible", entries.length === 0);
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
    currency: meta.currency
  }).format(amount);
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatIncomeFrequency(value) {
  return incomeFrequencyLabels[value] || incomeFrequencyLabels.ONE_TIME;
}

function formatPaymentDay(day) {
  return day ? `day ${day}` : "payment day not set";
}

function setIncomeDateDefaults() {
  const today = new Date();
  elements.receivedOnInput.value = toDateValue(today);
  elements.paymentDayInput.value = String(today.getDate());
}

function getDayFromDateValue(value) {
  const [, , day] = String(value || "").split("-").map(Number);
  return Number.isInteger(day) ? String(day) : "";
}

function toMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
