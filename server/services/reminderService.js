const prisma = require("../prisma");
const { getAppBaseUrl, sendSalaryPlanningReminderEmail } = require("../email");

const REMINDER_TYPE = "SALARY_PLANNING";
const DEFAULT_LEAD_DAYS = 3;
const DEFAULT_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 5000;
const REMINDER_FREQUENCIES = ["MONTHLY"];

let reminderTimer = null;

async function sendSalaryPlanningReminders({ now = new Date(), dryRun = false } = {}) {
  const leadDays = getPositiveInteger(process.env.SALARY_REMINDER_LEAD_DAYS, DEFAULT_LEAD_DAYS);
  const targetDate = addDays(startOfLocalDate(now), leadDays);
  const appBaseUrl = getAppBaseUrl();

  const sources = await prisma.incomeSource.findMany({
    where: {
      active: true,
      isFixed: true,
      paymentDay: {
        not: null
      },
      frequency: {
        in: REMINDER_FREQUENCIES
      }
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    },
    orderBy: [{ userId: "asc" }, { name: "asc" }]
  });

  const summary = {
    leadDays,
    targetDate: toDateValue(targetDate),
    checked: sources.length,
    due: 0,
    sent: 0,
    skipped: 0,
    dryRun,
    reminders: []
  };

  for (const source of sources) {
    const salaryDate = getMonthlySalaryDate(targetDate, source.paymentDay);
    if (!isSameLocalDate(salaryDate, targetDate)) {
      continue;
    }

    summary.due += 1;

    const reminderDetails = {
      userId: source.userId,
      incomeSourceId: source.id,
      incomeSourceName: source.name,
      salaryDate: toDateValue(salaryDate)
    };

    if (!source.user?.email) {
      summary.skipped += 1;
      summary.reminders.push({
        ...reminderDetails,
        status: "skipped",
        reason: "User has no email address."
      });
      continue;
    }

    const dueOn = toDatabaseDate(salaryDate);
    const existingReminder = await findReminder(source, dueOn);

    if (existingReminder?.emailSent) {
      summary.skipped += 1;
      summary.reminders.push({
        ...reminderDetails,
        status: "skipped",
        reason: "Reminder already sent."
      });
      continue;
    }

    if (dryRun) {
      summary.reminders.push({
        ...reminderDetails,
        status: "would_send"
      });
      continue;
    }

    const reminderRecord = existingReminder || await createReminderRecord(source, dueOn);
    if (!reminderRecord) {
      summary.skipped += 1;
      summary.reminders.push({
        ...reminderDetails,
        status: "skipped",
        reason: "Reminder already exists."
      });
      continue;
    }

    try {
      const emailResult = await sendSalaryPlanningReminderEmail({
        to: source.user.email,
        userName: source.user.name,
        incomeSourceName: source.name,
        salaryDate,
        leadDays,
        appBaseUrl
      });

      if (!emailResult.sent) {
        await markReminderSkipped(reminderRecord.id, emailResult.reason);
        summary.skipped += 1;
        summary.reminders.push({
          ...reminderDetails,
          status: "skipped",
          reason: emailResult.reason || "Email was not sent."
        });
        continue;
      }

      await prisma.reminderEmail.update({
        where: { id: reminderRecord.id },
        data: {
          emailSent: true,
          sentAt: new Date(),
          reason: null
        }
      });

      summary.sent += 1;
      summary.reminders.push({
        ...reminderDetails,
        status: "sent"
      });
    } catch (error) {
      const reason = error.message || "Reminder email failed.";
      await markReminderSkipped(reminderRecord.id, reason);
      summary.skipped += 1;
      summary.reminders.push({
        ...reminderDetails,
        status: "failed",
        reason
      });
    }
  }

  return summary;
}

function startReminderScheduler() {
  if (process.env.DISABLE_REMINDER_SCHEDULER === "true") {
    console.log("Salary reminder scheduler is disabled.");
    return null;
  }

  if (reminderTimer) {
    return reminderTimer;
  }

  const intervalMs = getPositiveInteger(process.env.REMINDER_SCHEDULER_INTERVAL_MS, DEFAULT_SCHEDULER_INTERVAL_MS);
  const initialDelayMs = getPositiveInteger(process.env.REMINDER_SCHEDULER_INITIAL_DELAY_MS, DEFAULT_INITIAL_DELAY_MS);
  const runOnStart = process.env.RUN_REMINDERS_ON_START !== "false";

  const run = async () => {
    try {
      const summary = await sendSalaryPlanningReminders();
      if (summary.due || summary.sent || summary.skipped) {
        console.log(`Salary reminders checked ${summary.checked} source(s), due ${summary.due}, sent ${summary.sent}, skipped ${summary.skipped}.`);
      }
    } catch (error) {
      console.error("Salary reminder check failed.", error);
    }
  };

  if (runOnStart) {
    const initialTimer = setTimeout(run, initialDelayMs);
    if (typeof initialTimer.unref === "function") {
      initialTimer.unref();
    }
  }

  reminderTimer = setInterval(run, intervalMs);
  if (typeof reminderTimer.unref === "function") {
    reminderTimer.unref();
  }

  return reminderTimer;
}

async function findReminder(source, dueOn) {
  return prisma.reminderEmail.findFirst({
    where: {
      userId: source.userId,
      incomeSourceId: source.id,
      type: REMINDER_TYPE,
      dueOn
    }
  });
}

async function createReminderRecord(source, dueOn) {
  try {
    return await prisma.reminderEmail.create({
      data: {
        userId: source.userId,
        incomeSourceId: source.id,
        type: REMINDER_TYPE,
        dueOn,
        emailSent: false,
        reason: "Queued."
      }
    });
  } catch (error) {
    if (error.code !== "P2002") {
      throw error;
    }

    const reminder = await findReminder(source, dueOn);
    return reminder?.emailSent ? null : reminder;
  }
}

async function markReminderSkipped(id, reason) {
  await prisma.reminderEmail.update({
    where: { id },
    data: {
      emailSent: false,
      reason: String(reason || "Email was not sent.").slice(0, 240)
    }
  });
}

function getMonthlySalaryDate(targetDate, paymentDay) {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(Number(paymentDay) || 1, 1), lastDay);
  return new Date(year, month, day);
}

function getPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function startOfLocalDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return startOfLocalDate(nextDate);
}

function isSameLocalDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function toDatabaseDate(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

module.exports = {
  sendSalaryPlanningReminders,
  startReminderScheduler
};
