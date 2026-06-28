const params = new URLSearchParams(window.location.search);
const token = params.get("token");
const form = document.querySelector("#acceptInviteForm");
const message = document.querySelector("#acceptInviteMessage");
const context = document.querySelector("#inviteContext");

initialize();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  try {
    await apiRequest(`/api/invites/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        password: formData.get("password")
      })
    });

    const { user } = await apiRequest("/api/me");
    if (!user) {
      message.textContent = "Your account was created, but the browser did not keep the login session. Open this app on the same HTTPS URL as the invite link, then log in with your email and password.";
      return;
    }

    window.location.href = "index.html";
  } catch (error) {
    message.textContent = error.message;
  }
});

async function initialize() {
  if (!token) {
    context.textContent = "This invite link is missing a token.";
    form.hidden = true;
    return;
  }

  try {
    const data = await apiRequest(`/api/invites/${encodeURIComponent(token)}`);
    context.textContent = `Invite for ${data.invitation.email}`;
  } catch (error) {
    context.textContent = error.message;
    form.hidden = true;
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
