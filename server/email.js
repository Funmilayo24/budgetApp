const { Resend } = require("resend");

function getAppBaseUrl() {
  return process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

async function sendInviteEmail({ to, inviteUrl, invitedBy }) {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, reason: "RESEND_API_KEY is not configured." };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.INVITE_FROM_EMAIL || process.env.EMAIL_FROM || "Budget App <onboarding@resend.dev>";
  const inviter = invitedBy?.name || invitedBy?.email || "Someone";

  await resend.emails.send({
    from,
    to,
    subject: "You are invited to Budget App",
    text: `${inviter} invited you to Budget App.\n\nAccept your invite: ${inviteUrl}\n\nThis link expires in 7 days.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #19212a; line-height: 1.5;">
        <h1 style="font-size: 22px;">You are invited to Budget App</h1>
        <p>${escapeHtml(inviter)} invited you to create your own private Budget App account.</p>
        <p>
          <a href="${inviteUrl}" style="display: inline-block; padding: 10px 14px; background: #16794f; color: #ffffff; text-decoration: none; border-radius: 8px;">
            Accept invite
          </a>
        </p>
        <p style="color: #68737f;">This link expires in 7 days.</p>
      </div>
    `
  });

  return { sent: true };
}

async function sendSalaryPlanningReminderEmail({ to, userName, incomeSourceName, salaryDate, leadDays = 3, appBaseUrl }) {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, reason: "RESEND_API_KEY is not configured." };
  }

  const baseUrl = String(appBaseUrl || getAppBaseUrl()).replace(/\/$/, "");
  const debtsUrl = `${baseUrl}/debts.html`;
  const dashboardUrl = `${baseUrl}/index.html`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.REMINDER_FROM_EMAIL || process.env.EMAIL_FROM || "Budget App <onboarding@resend.dev>";
  const greetingName = userName || "there";
  const sourceLabel = incomeSourceName || "your income";
  const salaryDateLabel = formatDisplayDate(salaryDate);

  await resend.emails.send({
    from,
    to,
    subject: `Plan ahead: ${sourceLabel} is due in ${leadDays} days`,
    text: [
      `Hi ${greetingName},`,
      "",
      `${sourceLabel} is expected on ${salaryDateLabel}.`,
      "Take a minute to update your debts and plan your expenses for this cycle.",
      "",
      `Update debts: ${debtsUrl}`,
      `Open dashboard: ${dashboardUrl}`
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #19212a; line-height: 1.5;">
        <h1 style="font-size: 22px;">Salary planning reminder</h1>
        <p>Hi ${escapeHtml(greetingName)},</p>
        <p><strong>${escapeHtml(sourceLabel)}</strong> is expected on <strong>${escapeHtml(salaryDateLabel)}</strong>.</p>
        <p>Take a minute to update your debts and plan your expenses for this cycle.</p>
        <p>
          <a href="${escapeHtml(debtsUrl)}" style="display: inline-block; padding: 10px 14px; background: #16794f; color: #ffffff; text-decoration: none; border-radius: 8px;">
            Update debts
          </a>
        </p>
        <p>
          <a href="${escapeHtml(dashboardUrl)}" style="color: #16794f;">Open dashboard</a>
        </p>
      </div>
    `
  });

  return { sent: true };
}

function formatDisplayDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

module.exports = {
  getAppBaseUrl,
  sendInviteEmail,
  sendSalaryPlanningReminderEmail
};
