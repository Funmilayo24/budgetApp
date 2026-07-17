const elements = {
  name: document.querySelector("#profileName"),
  email: document.querySelector("#profileEmail"),
  role: document.querySelector("#profileRole"),
  logoutButton: document.querySelector("#logoutButton"),
  message: document.querySelector("#profileMessage"),
  deleteDialog: document.querySelector("#deleteAccountDialog"),
  deleteForm: document.querySelector("#deleteAccountForm"),
  deleteMessage: document.querySelector("#deleteAccountMessage"),
  deletePassword: document.querySelector("#deleteAccountPassword"),
  deleteConfirmation: document.querySelector("#deleteAccountConfirmation"),
  confirmDeleteButton: document.querySelector("#confirmDeleteAccountButton"),
  openDeleteButton: document.querySelector("#openDeleteAccountButton"),
  closeDeleteButton: document.querySelector("#closeDeleteAccountButton"),
  cancelDeleteButton: document.querySelector("#cancelDeleteAccountButton")
};

initialize();

async function initialize() {
  bindEvents();

  try {
    const { user } = await apiRequest("/api/me");
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    elements.name.textContent = user.name || "Not set";
    elements.email.textContent = user.email;
    elements.role.textContent = user.role.toLowerCase();
  } catch (error) {
    elements.message.textContent = error.message;
  }
}

function bindEvents() {
  elements.logoutButton.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });

  elements.openDeleteButton.addEventListener("click", () => {
    elements.deleteMessage.textContent = "";
    elements.deleteForm.reset();
    elements.deleteDialog.showModal();
    elements.deletePassword.focus();
  });

  elements.closeDeleteButton.addEventListener("click", closeDeleteDialog);
  elements.cancelDeleteButton.addEventListener("click", closeDeleteDialog);
  elements.deleteDialog.addEventListener("click", (event) => {
    if (event.target === elements.deleteDialog) closeDeleteDialog();
  });
  elements.deleteForm.addEventListener("submit", deleteAccount);
}

function closeDeleteDialog() {
  elements.deleteDialog.close();
  elements.deleteForm.reset();
  elements.deleteMessage.textContent = "";
}

async function deleteAccount(event) {
  event.preventDefault();
  elements.deleteMessage.textContent = "";
  elements.confirmDeleteButton.disabled = true;
  elements.confirmDeleteButton.textContent = "Deleting...";

  try {
    await apiRequest("/api/account", {
      method: "DELETE",
      body: JSON.stringify({
        password: elements.deletePassword.value,
        confirmation: elements.deleteConfirmation.value
      })
    });
    window.location.replace("login.html?accountDeleted=1");
  } catch (error) {
    elements.deleteMessage.textContent = error.message;
    elements.confirmDeleteButton.disabled = false;
    elements.confirmDeleteButton.textContent = "Delete permanently";
  }
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
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
