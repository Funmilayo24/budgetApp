# Budget App

A small full-stack budget tracker with Postgres, Prisma, invite-based signup, and session login.

## Features

- Invite people by email with Resend
- Accept invite links and create a password
- Log in with an HTTP-only session cookie
- Record income by source, amount, date, and currency
- Track fixed income sources and future salary changes without rewriting past income
- Create debts with balances, categories, minimum payments, due dates, and progress
- Plan monthly debt payments separately from actual payments
- Keep debt payment history by salary cycle
- Track fixed expenses like rent, electricity, and subscriptions
- Set savings goals with deadlines and record savings contributions
- Navigate with a main menu for Dashboard, Income, Fixed Expenses, Debts, Savings, and Profile
- Track income and expenses by month
- Set spending limits for budget categories
- Review monthly totals, remaining cash, and savings rate
- Filter, delete, and export transactions
- Store budget data in Postgres through Prisma

## Run

1. Install dependencies:

   ```bash
   npm install
   ```

1. Start Postgres:

   ```bash
   npm run db:up
   ```

1. Apply migrations:

   ```bash
   npm run prisma:migrate
   ```

1. Seed starter categories and budgets:

   ```bash
   npm run prisma:seed
   ```

1. Start the app:

   ```bash
   npm run dev
   ```

1. Open:

   ```text
   http://localhost:3000
   ```

Income page:

```text
http://localhost:3000/income.html
```

Debts page:

```text
http://localhost:3000/debts.html
```

Savings page:

```text
http://localhost:3000/savings.html
```

Profile page:

```text
http://localhost:3000/profile.html
```

If PowerShell blocks `npm`, use `npm.cmd` for the same commands, such as `npm.cmd run dev`.

## Invite Flow

Open `http://localhost:3000/invite.html`, enter an email address, and send an invite.

If `RESEND_API_KEY` is configured, the app sends the invite email through Resend. In local development, the API also returns the invite link so you can test without leaving the browser. The invited person clicks the link, creates a password, and is sent to the dashboard.

## Environment

The database connection is configured in `.env` and mirrored in `.env.example`.

```text
DATABASE_URL="postgresql://budgetapp:budgetapp_dev_password@localhost:5433/budgetapp?schema=public"
PORT=3000
APP_BASE_URL="http://localhost:3000"
RESEND_API_KEY=""
INVITE_FROM_EMAIL="Budget App <onboarding@resend.dev>"
```

The budget database maps to `localhost:5433` on your machine so it does not collide with another local Postgres project on the default `5432` port.

## Railway Deployment

To avoid affecting another Railway project, deploy this app as a separate Railway project with its own app service and its own Postgres database service. Do not attach this app to another project's existing service or database, and do not copy another project's `DATABASE_URL`.

Recommended Railway setup:

1. Create a new Railway project for the budget app.
1. Add a new Postgres service inside that same project.
1. Add this repository as a new app service.
1. Set the budget app service variables:

   ```text
   NODE_ENV=production
   DATABASE_URL=<the new budget app Postgres DATABASE_URL>
   APP_BASE_URL=<the public Railway URL or custom domain for this budget app>
   RESEND_API_KEY=<your Resend API key>
   EMAIL_FROM=<your verified sender>
   INVITE_FROM_EMAIL=<your invite sender>
   REMINDER_FROM_EMAIL=<your reminder sender>
   SALARY_REMINDER_LEAD_DAYS=3
   REMINDER_SCHEDULER_INTERVAL_MS=21600000
   RUN_REMINDERS_ON_START=true
   DISABLE_REMINDER_SCHEDULER=false
   ```

The included `railway.json` tells Railway to:

- run Prisma migrations before deployment with `npm run prisma:deploy`
- start the app with `npm start`
- use `/api/health` as the health check

If Railway gives the budget app its own Postgres service, migrations only run on that budget app database.

## Income

Use `income.html` to record income from sources like salary, freelance work, bonuses, or interest. Supported currencies are:

- Dollars: `USD`
- Naira: `NGN`
- Euros: `EUR`
- Pounds: `GBP`

When an income source is marked as fixed, the app stores its amount as a dated version. If someone gets a salary increase, add a future change with the new amount and effective date. Earlier income entries and previous months keep their original amounts.

## Debt Planning

Use `debts.html` to create debts and plan how much to pay during the selected salary cycle.

Each debt stores:

- Name
- Category
- Original amount
- Current balance
- Currency
- Interest rate
- Minimum payment
- Due day
- Notes

Planning and actual payments are separate. A planned payment records the user's intention for the month. An actual payment records what was really paid and reduces the debt balance. The app prevents payments above the remaining balance, keeps completed debts in history, and does not allow historical salary cycles to be edited.

## Prisma

Inspect the database:

```bash
npm run prisma:studio
```

Generate Prisma Client:

```bash
npm run prisma:generate
```
