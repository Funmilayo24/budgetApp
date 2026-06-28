const elements = {
  name: document.querySelector("#profileName"),
  email: document.querySelector("#profileEmail"),
  role: document.querySelector("#profileRole"),
  logoutButton: document.querySelector("#logoutButton"),
  message: document.querySelector("#profileMessage")
};

initialize();

async function initialize() {
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

  elements.logoutButton.addEventListener("click", async () => {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.href = "login.html";
  });
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
