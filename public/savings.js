const currencyMeta = {
  USD: { locale: "en-US", currency: "USD" },
  NGN: { locale: "en-NG", currency: "NGN" },
  EUR: { locale: "de-DE", currency: "EUR" },
  GBP: { locale: "en-GB", currency: "GBP" }
};

const state = { goals: [], activities: [], totals: {} };
const elements = {
  logoutButton: document.querySelector("#logoutButton"),
  monthPicker: document.querySelector("#monthPicker"),
  openDepositButton: document.querySelector("#openDepositModalButton"),
  openWithdrawalButton: document.querySelector("#openWithdrawalModalButton"),
  modal: document.querySelector("#savingsActivityModal"),
  form: document.querySelector("#savingsActivityForm"),
  closeButton: document.querySelector("#closeSavingsActivityModalButton"),
  cancelButton: document.querySelector("#cancelSavingsActivityModalButton"),
  idInput: document.querySelector("#savingsActivityIdInput"),
  typeInput: document.querySelector("#savingsActivityTypeInput"),
  goalInput: document.querySelector("#savingsActivityGoalInput"),
  amountInput: document.querySelector("#savingsActivityAmountInput"),
  dateInput: document.querySelector("#savingsActivityDateInput"),
  amountLabel: document.querySelector("#savingsActivityAmountLabel"),
  modalTitle: document.querySelector("#savingsActivityModalTitle"),
  modalEyebrow: document.querySelector("#savingsActivityEyebrow"),
  message: document.querySelector("#savingsActivityMessage"),
  pageMessage: document.querySelector("#savingsPageMessage"),
  savedTotal: document.querySelector("#savedTotal"),
  addedTotal: document.querySelector("#addedTotal"),
  withdrawnTotal: document.querySelector("#withdrawnTotal"),
  netChangeTotal: document.querySelector("#netChangeTotal"),
  balanceList: document.querySelector("#savingsBalanceList"),
  balanceEmptyState: document.querySelector("#savingsBalanceEmptyState"),
  activityTable: document.querySelector("#savingsActivityTable"),
  activityEmptyState: document.querySelector("#savingsActivityEmptyState")
};

let selectedMonth = toMonthValue(new Date());

initialize();

async function initialize() {
  elements.monthPicker.value = selectedMonth;
  bindEvents();
  try {
    await requireSession();
    await loadSavings();
  } catch (error) {
    showMessage(elements.pageMessage, error.message || "Could not load savings activity.");
  }
}

function bindEvents() {
  elements.logoutButton.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });
  elements.monthPicker.addEventListener("change", async () => {
    selectedMonth = elements.monthPicker.value || toMonthValue(new Date());
    await loadSavings();
  });
  elements.openDepositButton.addEventListener("click", () => openActivityModal("DEPOSIT"));
  elements.openWithdrawalButton.addEventListener("click", () => openActivityModal("WITHDRAWAL"));
  elements.closeButton.addEventListener("click", closeActivityModal);
  elements.cancelButton.addEventListener("click", closeActivityModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeActivityModal();
  });
  elements.form.addEventListener("submit", saveActivity);
  elements.activityTable.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-savings-activity-id]");
    if (editButton) {
      openActivityModal("DEPOSIT", editButton.dataset.editSavingsActivityId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-savings-activity-id]");
    if (deleteButton) await deleteActivity(deleteButton.dataset.deleteSavingsActivityId);
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
  state.activities = data.contributions || [];
  state.totals = data.totals || {};
  render();

  const requestedGoalId = new URLSearchParams(window.location.search).get("goal");
  if (requestedGoalId && state.goals.some((goal) => goal.id === requestedGoalId)) {
    window.history.replaceState({}, document.title, window.location.pathname);
    openActivityModal("DEPOSIT", "", requestedGoalId);
  }
}

async function saveActivity(event) {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const id = String(formData.get("id") || "");
  const goalId = String(formData.get("goalId") || "");

  if (!goalId) {
    showMessage(elements.message, "Create or choose a future goal first.");
    return;
  }

  try {
    await apiRequest(id ? `/api/savings-contributions/${encodeURIComponent(id)}` : `/api/savings-goals/${encodeURIComponent(goalId)}/contributions`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        goalId,
        type: formData.get("type"),
        amount: Number(formData.get("amount")),
        savedOn: formData.get("savedOn"),
        note: formData.get("note")
      })
    });
    const type = String(formData.get("type"));
    closeActivityModal();
    showMessage(elements.pageMessage, id ? "Savings activity updated." : type === "WITHDRAWAL" ? "Money used recorded." : "Savings added.");
    await loadSavings();
  } catch (error) {
    showMessage(elements.message, error.message);
  }
}

async function deleteActivity(id) {
  const activity = state.activities.find((item) => item.id === id);
  if (!activity || !window.confirm(`Delete this ${activity.type === "WITHDRAWAL" ? "money used" : "savings"} entry?`)) return;

  try {
    await apiRequest(`/api/savings-contributions/${encodeURIComponent(id)}`, { method: "DELETE" });
    showMessage(elements.pageMessage, "Savings activity deleted.");
    await loadSavings();
  } catch (error) {
    showMessage(elements.pageMessage, error.message);
  }
}

function openActivityModal(type, activityId = "", requestedGoalId = "") {
  if (!state.goals.length) {
    showMessage(elements.pageMessage, "Create a future goal before recording savings.");
    return;
  }

  const activity = state.activities.find((item) => item.id === activityId);
  const effectiveType = activity?.type || type;
  elements.form.reset();
  elements.goalInput.innerHTML = state.goals.map((goal) => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.name)} · ${formatCurrency(goal.savedAmount, goal.currency)} available</option>`).join("");
  elements.idInput.value = activity?.id || "";
  elements.typeInput.value = effectiveType;
  elements.goalInput.value = activity?.savingsGoalId || requestedGoalId || state.goals[0].id;
  elements.amountInput.value = activity?.amount || "";
  elements.dateInput.value = activity?.savedOn || toDateValue(new Date());
  elements.form.elements.note.value = activity?.note || "";

  const isWithdrawal = effectiveType === "WITHDRAWAL";
  elements.modalTitle.textContent = activity ? "Edit Savings Activity" : isWithdrawal ? "Record Money Used" : "Add Savings";
  elements.modalEyebrow.textContent = activity ? "Correct an entry" : isWithdrawal ? "Savings withdrawal" : "Savings deposit";
  elements.amountLabel.textContent = isWithdrawal ? "Amount used" : "Amount saved";
  clearMessage(elements.message);
  elements.modal.showModal();
  elements.amountInput.focus();
}

function closeActivityModal() {
  if (elements.modal.open) elements.modal.close();
  elements.form.reset();
  clearMessage(elements.message);
}

function render() {
  elements.savedTotal.textContent = formatTotals(state.totals.savedByCurrency);
  elements.addedTotal.textContent = formatTotals(state.totals.addedThisMonthByCurrency);
  elements.withdrawnTotal.textContent = formatTotals(state.totals.withdrawnThisMonthByCurrency);
  elements.netChangeTotal.textContent = formatSignedTotals(state.totals.savedThisMonthByCurrency);
  renderBalances();
  renderActivities();
}

function renderBalances() {
  elements.balanceList.innerHTML = state.goals.map((goal) => `
    <article class="savings-balance-row">
      <div><strong>${escapeHtml(goal.name)}</strong><small>${goal.percentSaved}% of ${formatCurrency(goal.targetAmount, goal.currency)} target</small></div>
      <span>${formatCurrency(goal.savedAmount, goal.currency)}</span>
    </article>`).join("");
  elements.balanceEmptyState.classList.toggle("visible", state.goals.length === 0);
}

function renderActivities() {
  elements.activityTable.innerHTML = state.activities.map((activity) => {
    const isWithdrawal = activity.type === "WITHDRAWAL";
    return `
      <tr>
        <td>${escapeHtml(formatDate(activity.savedOn))}</td>
        <td><span class="type-pill ${isWithdrawal ? "expense" : "income"}">${isWithdrawal ? "money used" : "saved"}</span></td>
        <td>${escapeHtml(activity.goalName)}</td>
        <td>${escapeHtml(activity.note || "")}</td>
        <td class="amount-cell ${isWithdrawal ? "expense" : "income"}">${isWithdrawal ? "−" : "+"}${formatCurrency(activity.amount, activity.currency)}</td>
        <td><div class="savings-activity-actions"><button class="icon-text-button" type="button" data-edit-savings-activity-id="${escapeHtml(activity.id)}">Edit</button><button class="delete-button" type="button" data-delete-savings-activity-id="${escapeHtml(activity.id)}" aria-label="Delete activity">×</button></div></td>
      </tr>`;
  }).join("");
  elements.activityEmptyState.classList.toggle("visible", state.activities.length === 0);
}

function formatTotals(totals = {}) {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0);
  return entries.length ? entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(" / ") : formatCurrency(0, "USD");
}

function formatSignedTotals(totals = {}) {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0);
  return entries.length ? entries.map(([currency, amount]) => `${amount > 0 ? "+" : "−"}${formatCurrency(Math.abs(amount), currency)}`).join(" / ") : formatCurrency(0, "USD");
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

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
