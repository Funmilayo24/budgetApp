const currencyMeta = {
  USD: { locale: "en-US", currency: "USD" },
  NGN: { locale: "en-NG", currency: "NGN" },
  EUR: { locale: "de-DE", currency: "EUR" },
  GBP: { locale: "en-GB", currency: "GBP" }
};

const goalTypeLabels = {
  HOUSE: "House",
  CAR: "Car",
  VACATION: "Vacation",
  EDUCATION: "Education",
  WEDDING: "Wedding",
  BUSINESS: "Business",
  OTHER: "Other"
};

const fundingLabels = {
  FULL_COST: "Saving the full cost",
  DOWN_PAYMENT: "Saving for a down payment",
  CUSTOM_TARGET: "Saving a custom amount"
};

const state = { goals: [] };
const elements = {
  logoutButton: document.querySelector("#logoutButton"),
  openButton: document.querySelector("#openFutureGoalModalButton"),
  modal: document.querySelector("#futureGoalModal"),
  closeButton: document.querySelector("#closeFutureGoalModalButton"),
  cancelButton: document.querySelector("#cancelFutureGoalModalButton"),
  form: document.querySelector("#futureGoalForm"),
  idInput: document.querySelector("#futureGoalIdInput"),
  nameInput: document.querySelector("#futureGoalNameInput"),
  fundingInput: document.querySelector("#fundingStrategyInput"),
  totalCostInput: document.querySelector("#futureTotalCostInput"),
  targetInput: document.querySelector("#futureTargetAmountInput"),
  targetLabel: document.querySelector("#futureTargetAmountLabel"),
  modalTitle: document.querySelector("#futureGoalModalTitle"),
  message: document.querySelector("#futureGoalMessage"),
  pageMessage: document.querySelector("#futureGoalPageMessage"),
  list: document.querySelector("#futureGoalList"),
  emptyState: document.querySelector("#futureGoalEmptyState"),
  goalCount: document.querySelector("#futureGoalCount"),
  costTotal: document.querySelector("#futureCostTotal"),
  targetTotal: document.querySelector("#futureTargetTotal"),
  savedTotal: document.querySelector("#futureSavedTotal")
};

initialize();

async function initialize() {
  bindEvents();
  try {
    await requireSession();
    await loadGoals();
  } catch (error) {
    showMessage(elements.pageMessage, error.message || "Could not load future goals.");
  }
}

function bindEvents() {
  elements.logoutButton.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });
  elements.openButton.addEventListener("click", () => openModal());
  elements.closeButton.addEventListener("click", closeModal);
  elements.cancelButton.addEventListener("click", closeModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal();
  });
  elements.form.addEventListener("submit", saveGoal);
  elements.fundingInput.addEventListener("change", syncFundingFields);
  elements.totalCostInput.addEventListener("input", syncFullCostTarget);
  elements.list.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-future-goal-id]");
    if (editButton) openModal(editButton.dataset.editFutureGoalId);
  });
}

async function requireSession() {
  const { user } = await apiRequest("/api/me");
  if (!user) {
    window.location.href = "login.html";
    throw new Error("Redirecting to login.");
  }
}

async function loadGoals() {
  const month = toMonthValue(new Date());
  const data = await apiRequest(`/api/savings?month=${encodeURIComponent(month)}`);
  state.goals = data.goals || [];
  render();
}

async function saveGoal(event) {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const id = String(formData.get("id") || "");

  try {
    await apiRequest(id ? `/api/savings-goals/${encodeURIComponent(id)}` : "/api/savings-goals", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        goalType: formData.get("goalType"),
        fundingStrategy: formData.get("fundingStrategy"),
        totalCost: Number(formData.get("totalCost")),
        targetAmount: Number(formData.get("targetAmount")),
        currency: formData.get("currency"),
        deadline: formData.get("deadline"),
        notes: formData.get("notes")
      })
    });
    closeModal();
    showMessage(elements.pageMessage, id ? "Future goal updated." : "Future goal created.");
    await loadGoals();
  } catch (error) {
    showMessage(elements.message, error.message);
  }
}

function openModal(goalId = "") {
  const goal = state.goals.find((item) => item.id === goalId);
  elements.form.reset();
  elements.idInput.value = goal?.id || "";
  elements.modalTitle.textContent = goal ? "Edit Future Goal" : "New Future Goal";

  if (goal) {
    elements.form.elements.name.value = goal.name;
    elements.form.elements.goalType.value = goal.goalType || "OTHER";
    elements.form.elements.fundingStrategy.value = goal.fundingStrategy || "CUSTOM_TARGET";
    elements.form.elements.totalCost.value = goal.totalCost || goal.targetAmount;
    elements.form.elements.targetAmount.value = goal.targetAmount;
    elements.form.elements.currency.value = goal.currency;
    elements.form.elements.deadline.value = goal.deadline;
    elements.form.elements.notes.value = goal.notes || "";
  } else {
    elements.form.elements.goalType.value = "HOUSE";
    elements.form.elements.fundingStrategy.value = "DOWN_PAYMENT";
    elements.form.elements.currency.value = "USD";
  }

  syncFundingFields();
  clearMessage(elements.message);
  elements.modal.showModal();
  elements.nameInput.focus();
}

function closeModal() {
  if (elements.modal.open) elements.modal.close();
  elements.form.reset();
  clearMessage(elements.message);
}

function syncFundingFields() {
  const strategy = elements.fundingInput.value;
  const isFullCost = strategy === "FULL_COST";
  elements.targetInput.readOnly = isFullCost;
  elements.targetLabel.textContent = strategy === "DOWN_PAYMENT"
    ? "Down payment amount"
    : strategy === "FULL_COST" ? "Amount to save (full cost)" : "Amount to save";
  if (isFullCost) syncFullCostTarget();
}

function syncFullCostTarget() {
  if (elements.fundingInput.value === "FULL_COST") {
    elements.targetInput.value = elements.totalCostInput.value;
  }
}

function render() {
  renderSummary();
  elements.list.innerHTML = state.goals.map(renderGoalCard).join("");
  elements.emptyState.classList.toggle("visible", state.goals.length === 0);
}

function renderSummary() {
  elements.goalCount.textContent = String(state.goals.length);
  elements.costTotal.textContent = formatTotals(sumByCurrency(state.goals, (goal) => goal.totalCost || goal.targetAmount));
  elements.targetTotal.textContent = formatTotals(sumByCurrency(state.goals, (goal) => goal.targetAmount));
  elements.savedTotal.textContent = formatTotals(sumByCurrency(state.goals, (goal) => goal.savedAmount));
}

function renderGoalCard(goal) {
  const totalCost = goal.totalCost || goal.targetAmount;
  const targetPercentOfCost = totalCost > 0 ? Math.round((goal.targetAmount / totalCost) * 100) : 100;
  const monthsLeft = Math.max(1, Math.ceil(Math.max(0, goal.daysLeft) / 30));
  const monthlyNeeded = goal.remainingAmount / monthsLeft;

  return `
    <article class="future-goal-card">
      <div class="future-goal-card-head">
        <div>
          <span class="future-goal-type">${escapeHtml(goalTypeLabels[goal.goalType] || "Other")}</span>
          <h3>${escapeHtml(goal.name)}</h3>
          <p>${escapeHtml(fundingLabels[goal.fundingStrategy] || fundingLabels.CUSTOM_TARGET)}</p>
        </div>
        <button class="secondary-button" type="button" data-edit-future-goal-id="${escapeHtml(goal.id)}">Edit goal</button>
      </div>
      <div class="future-goal-numbers">
        <span>Total cost<strong>${formatCurrency(totalCost, goal.currency)}</strong></span>
        <span>Savings target<strong>${formatCurrency(goal.targetAmount, goal.currency)}</strong><small>${targetPercentOfCost}% of total cost</small></span>
        <span>Already saved<strong>${formatCurrency(goal.savedAmount, goal.currency)}</strong></span>
        <span>Still needed<strong>${formatCurrency(goal.remainingAmount, goal.currency)}</strong></span>
      </div>
      <div class="progress-track" aria-hidden="true"><span class="progress-bar${goal.isComplete ? "" : " warning"}" style="width:${goal.percentSaved}%"></span></div>
      <div class="future-goal-footer">
        <span><strong>${goal.percentSaved}%</strong> funded · ${escapeHtml(formatDate(goal.deadline))}</span>
        <span>About <strong>${formatCurrency(monthlyNeeded, goal.currency)}/month</strong> needed</span>
        <a class="primary-button profile-action-link" href="savings.html?goal=${encodeURIComponent(goal.id)}">Add savings</a>
      </div>
      ${goal.notes ? `<p class="page-note">${escapeHtml(goal.notes)}</p>` : ""}
    </article>`;
}

function sumByCurrency(goals, getAmount) {
  return goals.reduce((totals, goal) => {
    totals[goal.currency] = (totals[goal.currency] || 0) + Number(getAmount(goal) || 0);
    return totals;
  }, {});
}

function formatTotals(totals) {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0);
  return entries.length ? entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" / ") : formatCurrency(0, "USD");
}

function formatCurrency(amount, currency) {
  const meta = currencyMeta[currency] || currencyMeta.USD;
  return new Intl.NumberFormat(meta.locale, { style: "currency", currency: meta.currency }).format(amount || 0);
}

function formatDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function toMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, credentials: "same-origin", ...options });
  if (response.status === 401 && !url.endsWith("/api/me")) window.location.href = "login.html";
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function showMessage(element, message) {
  element.textContent = message;
  window.clearTimeout(element.timeoutId);
  element.timeoutId = window.setTimeout(() => clearMessage(element), 3500);
}

function clearMessage(element) {
  element.textContent = "";
  window.clearTimeout(element.timeoutId);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
