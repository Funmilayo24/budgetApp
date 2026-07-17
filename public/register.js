const form = document.querySelector("#registerForm");
const message = document.querySelector("#registerMessage");
const registerButton = document.querySelector("#registerButton");

checkExistingSession();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  const formData = new FormData(form);
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    message.textContent = "Passwords do not match.";
    return;
  }

  registerButton.disabled = true;
  registerButton.textContent = "Creating account...";

  try {
    await apiRequest("/api/register", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        password,
        acceptedPrivacyPolicy: formData.get("acceptedPrivacyPolicy") === "on"
      })
    });
    window.location.replace("index.html");
  } catch (error) {
    message.textContent = error.message;
    registerButton.disabled = false;
    registerButton.textContent = "Create Account";
  }
});

async function checkExistingSession() {
  try {
    const { user } = await apiRequest("/api/me");
    if (user) window.location.replace("index.html");
  } catch (_error) {
    // The registration form remains available if session lookup fails.
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
