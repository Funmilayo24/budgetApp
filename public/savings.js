const currencyMeta = {
  USD: { locale: "en-US", currency: "USD" },
  NGN: { locale: "en-NG", currency: "NGN" },
  EUR: { locale: "de-DE", currency: "EUR" },
  GBP: { locale: "en-GB", currency: "GBP" }
};

const state = {
  goals: [],
  contributions: [],
  totals: {}
};

const elements = {
  logoutButton: document.querySelector("#logoutButton"),
  monthPicker: document.querySelector("#monthPicker"),
  openGoalModalButton: document.querySelector("#openGoalModalButton"),
  closeGoalModalButton: document.querySelector("#closeGoalModalButton"),
  closeContributionModalButton: document.querySelector("#closeContributionModalButton"),
  goalModal: document.querySelector("#goalModal"),
  contributionModal: document.querySelector("#contributionModal"),
  goalForm: document.querySelector("#goalForm"),
  contributionForm: document.querySelector("#contributionForm"),
  goalIdInput: document.querySelector("#goalIdInput"),
  goalNameInput: document.querySelector("#goalNameInput"),
  contributionGoalIdInput: document.querySelector("#contributionGoalIdInput"),
  contributionGoalContext: document.querySelector("#contributionGoalContext"),
  contributionAmountInput: document.querySelector("#contributionAmountInput"),
  savedOnInput: document.querySelector("#savedOnInput"),
  savingsPageMessage: document.querySelector("#savingsPageMessage"),
  goalMessage: document.querySelector("#goalMessage"),
  contributionMessage: document.querySelector("#contributionMessage"),
  goalCount: document.querySelector("#goalCount"),
  savedTotal: document.querySelector("#savedTotal"),
  targetTotal: document.querySelector("#targetTotal"),
  monthlySavedTotal: document.querySelector("#monthlySavedTotal"),
  savingsGoalList: document.querySelector("#savingsGoalList"),
  savingsGoalEmptyState: document.querySelector("#savingsGoalEmptyState"),
  savingsContributionTable: document.querySelector("#savingsContributionTable"),
  savingsContributionEmptyState: document.querySelector("#savingsContributionEmptyState")
};

let selectedMonth = toMonthValue(new Date());

initialize();

async function initialize() {
  elements.monthPicker.value = selectedMonth;
  elements.savedOnInput.value = toDateValue(new Date());
  bindEvents();

  try {
    await requireSession();
    await loadSavings();
  } catch (error) {
    showMessage(elements.savingsPageMessage, error.message || "Could not load savings.");
  }
}

function bindEvents() {
  elements.logoutButton?.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });

  elements.monthPicker.addEventListener("change", async () => {
    selectedMonth = elements.monthPicker.value || toMonthValue(new Date());
    await loadSavings();
  });

  elements.openGoalModalButton.addEventListener("click", () => {
    openGoalModal();
  });

  elements.closeGoalModalButton.addEventListener("click", () => {
    closeGoalModal();
  });

  elements.closeContributionModalButton.addEventListener("click", () => {
    closeContributionModal();
  });

  elements.goalModal.addEventListener("click", (event) => {
    if (event.target === elements.goalModal) {
      closeGoalModal();
    }
  });

  elements.contributionModal.addEventListener("click", (event) => {
    if (event.target === elements.contributionModal) {
      closeContributionModal();
    }
  });

  elements.goalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveGoal(new FormData(elements.goalForm));
  });

  elements.contributionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveContribution(new FormData(elements.contributionForm));
  });

  elements.savingsGoalList.addEventListener("click", (event) => {
    const contributionButton = event.target.closest("[data-add-contribution-goal-id]");
    if (contributionButton) {
      openContributionModal(contributionButton.dataset.addContributionGoalId);
      return;
    }

    const editButton = event.target.closest("[data-edit-goal-id]");
    if (editButton) {
      openGoalModal(editButton.dataset.editGoalId);
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

async function loadSavings() {
  const data = await apiRequest(`/api/savings?month=${encodeURIComponent(selectedMonth)}`);
  state.goals = data.goals || [];
  state.contributions = data.contributions || [];
  state.totals = data.totals || {};
  render();

  const requestedGoalId = new URLSearchParams(window.location.search).get("goal");
  if (requestedGoalId && state.goals.some((goal) => goal.id === requestedGoalId)) {
    window.history.replaceState({}, document.title, window.location.pathname);
    openContributionModal(requestedGoalId);
  }
}

async function saveGoal(formData) {
  const id = String(formData.get("id") || "");
  const body = {
    name: formData.get("name"),
    targetAmount: Number(formData.get("targetAmount")),
    currency: formData.get("currency"),
    deadline: formData.get("deadline"),
    notes: formData.get("notes")
  };

  try {
    await apiRequest(id ? `/api/savings-goals/${encodeURIComponent(id)}` : "/api/savings-goals", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    closeGoalModal();
    showMessage(elements.savingsPageMessage, id ? "Savings goal updated." : "Savings goal created.");
    await loadSavings();
  } catch (error) {
    showMessage(elements.goalMessage, error.message);
  }
}

async function saveContribution(formData) {
  const goalId = String(formData.get("goalId") || "");

  if (!goalId) {
    showMessage(elements.contributionMessage, "Choose a savings goal first.");
    return;
  }

  try {
    await apiRequest(`/api/savings-goals/${encodeURIComponent(goalId)}/contributions`, {
      method: "POST",
      body: JSON.stringify({
        amount: Number(formData.get("amount")),
        savedOn: formData.get("savedOn"),
        note: formData.get("note")
      })
    });
    closeContributionModal();
    showMessage(elements.savingsPageMessage, "Savings recorded.");
    await loadSavings();
  } catch (error) {
    showMessage(elements.contributionMessage, error.message);
  }
}

function openGoalModal(goalId = "") {
  const goal = state.goals.find((item) => item.id === goalId);
  elements.goalForm.reset();
  elements.goalIdInput.value = goal?.id || "";

  if (goal) {
    elements.goalForm.elements.name.value = goal.name;
    elements.goalForm.elements.targetAmount.value = goal.targetAmount;
    elements.goalForm.elements.currency.value = goal.currency;
    elements.goalForm.elements.deadline.value = goal.deadline;
    elements.goalForm.elements.notes.value = goal.notes || "";
  } else {
    elements.goalForm.elements.currency.value = "USD";
  }

  document.querySelector("#goalModalTitle").textContent = goal ? "Edit Savings Goal" : "New Savings Goal";
  clearMessage(elements.savingsPageMessage);
  clearMessage(elements.goalMessage);
  elements.goalModal.showModal();
  window.setTimeout(() => elements.goalNameInput.focus(), 0);
}

function closeGoalModal() {
  if (elements.goalModal.open) {
    elements.goalModal.close();
  }
}

function openContributionModal(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) return;

  elements.contributionForm.reset();
  elements.contributionGoalIdInput.value = goal.id;
  elements.contributionGoalContext.textContent = `${goal.name} - ${formatCurrency(goal.savedAmount, goal.currency)} saved of ${formatCurrency(goal.targetAmount, goal.currency)}`;
  elements.savedOnInput.value = toDateValue(new Date());
  clearMessage(elements.savingsPageMessage);
  clearMessage(elements.contributionMessage);
  elements.contributionModal.showModal();
  window.setTimeout(() => elements.contributionAmountInput.focus(), 0);
}

function closeContributionModal() {
  if (elements.contributionModal.open) {
    elements.contributionModal.close();
  }
}

function render() {
  renderSummary();
  renderGoals();
  renderContributions();
}

function renderSummary() {
  elements.goalCount.textContent = String(state.goals.length);
  elements.savedTotal.textContent = formatTotals(state.totals.savedByCurrency);
  elements.targetTotal.textContent = formatTotals(state.totals.targetByCurrency);
  elements.monthlySavedTotal.textContent = formatTotals(state.totals.savedThisMonthByCurrency);
}

function renderGoals() {
  elements.savingsGoalList.innerHTML = state.goals.map((goal) => `
    <article class="income-source-card savings-goal-card">
      <div class="budget-row-top income-source-card-head">
        <span class="income-source-title">
          <span class="budget-name">${escapeHtml(goal.name)}</span>
          <small>${escapeHtml(formatDeadline(goal.deadline, goal.daysLeft))}</small>
        </span>
        <div class="income-source-actions">
          <span class="type-pill ${goal.isComplete ? "income" : "expense"}">${goal.isComplete ? "complete" : `${goal.percentSaved}%`}</span>
          <button class="secondary-button" type="button" data-add-contribution-goal-id="${escapeHtml(goal.id)}">Add Savings</button>
          <button class="icon-button" type="button" data-edit-goal-id="${escapeHtml(goal.id)}" aria-label="Edit ${escapeHtml(goal.name)}">
            <svg class="icon" aria-hidden="true"><use href="#icon-dots"></use></svg>
          </button>
        </div>
      </div>
      <div class="progress-track" aria-hidden="true">
        <span class="progress-bar${goal.isComplete ? "" : " warning"}" style="width: ${goal.percentSaved}%"></span>
      </div>
      <div class="budget-meta">
        <span>Saved ${formatCurrency(goal.savedAmount, goal.currency)}</span>
        <span>Target ${formatCurrency(goal.targetAmount, goal.currency)}</span>
        <span>Left ${formatCurrency(goal.remainingAmount, goal.currency)}</span>
      </div>
      ${goal.notes ? `<p class="page-note">${escapeHtml(goal.notes)}</p>` : ""}
    </article>
  `).join("");

  elements.savingsGoalEmptyState.classList.toggle("visible", state.goals.length === 0);
}

function renderContributions() {
  elements.savingsContributionTable.innerHTML = state.contributions.map((contribution) => `
    <tr>
      <td>${formatDate(contribution.savedOn)}</td>
      <td>${escapeHtml(contribution.goalName)}</td>
      <td>${escapeHtml(contribution.note || "")}</td>
      <td class="amount-cell income">${formatCurrency(contribution.amount, contribution.currency)}</td>
    </tr>
  `).join("");

  elements.savingsContributionEmptyState.classList.toggle("visible", state.contributions.length === 0);
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

function formatDeadline(value, daysLeft) {
  const dateLabel = formatDate(value);
  if (daysLeft < 0) return `${dateLabel} - ${Math.abs(daysLeft)} days overdue`;
  if (daysLeft === 0) return `${dateLabel} - due today`;
  return `${dateLabel} - ${daysLeft} days left`;
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
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
