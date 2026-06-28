const logoutButton = document.querySelector("#logoutButton");

requireSession();

logoutButton?.addEventListener("click", async () => {
  await fetch("/api/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin"
  });
  window.location.href = "login.html";
});

async function requireSession() {
  const response = await fetch("/api/me", { credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.user) {
    window.location.href = "login.html";
  }
}
