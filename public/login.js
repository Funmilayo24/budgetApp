const form = document.querySelector("#loginForm");
const message = document.querySelector("#loginMessage");

checkExistingSession();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  try {
    await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });
    window.location.href = "index.html";
  } catch (error) {
    message.textContent = error.message;
  }
});

async function checkExistingSession() {
  const data = await apiRequest("/api/me", { redirectOnError: false });
  if (data.user) {
    window.location.href = "index.html";
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

