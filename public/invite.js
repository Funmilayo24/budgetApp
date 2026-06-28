const form = document.querySelector("#inviteForm");
const message = document.querySelector("#inviteMessage");
const devLinkField = document.querySelector("#devLinkField");
const inviteLink = document.querySelector("#inviteLink");
const logoutButton = document.querySelector("#logoutButton");

devLinkField.hidden = true;

requireInviteAccess().catch(() => {
  window.location.href = "login.html";
});

logoutButton?.addEventListener("click", async () => {
  await apiRequest("/api/logout", { method: "POST" });
  window.location.href = "login.html";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  message.textContent = "";
  devLinkField.hidden = true;

  try {
    const data = await apiRequest("/api/invites", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email")
      })
    });

    message.textContent = data.message || "Invite sent.";
    form.reset();

    if (data.inviteUrl) {
      inviteLink.value = data.inviteUrl;
      devLinkField.hidden = false;
      inviteLink.select();
    }
  } catch (error) {
    message.textContent = error.message;
  }
});

async function requireInviteAccess() {
  const { user, canBootstrapInvite } = await apiRequest("/api/me");
  if (!user && !canBootstrapInvite) {
    window.location.href = "login.html";
    throw new Error("Redirecting to login.");
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
