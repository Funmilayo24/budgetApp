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
1. Set the budget app service variables. `DATABASE_URL` must be set on the `budgetApp` app service, not only on the Postgres service:

   ```text
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
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

   If your Railway Postgres service has a different name, replace `Postgres` in `${{Postgres.DATABASE_URL}}` with the exact service name. Railway's variable editor has autocomplete for references to variables in other services.

The included `railway.json` tells Railway to:

- run Prisma migrations before deployment with `npm run prisma:deploy`
- start the app with `npm start`
- use `/api/health` as the health check

If Railway gives the budget app its own Postgres service, migrations only run on that budget app database.

If the build fails during `npm ci` at `prisma generate`, check that this repo includes the current `prisma.config.js`. It uses a harmless local fallback URL only so Prisma Client can be generated during build. The real Railway database is still controlled by the `DATABASE_URL` variable during pre-deploy migrations and app runtime.

## Android Mobile App

This repo includes a Capacitor Android project in `android/`. The first mobile version opens the live Railway app configured in `capacitor.config.json`:

```text
https://budgetapp-production-185c.up.railway.app
```

When `app.funmilayotobun.com` is fully working, update `server.url` in `capacitor.config.json` to that custom domain and run a sync.

Useful commands:

```bash
npm run mobile:sync
npm run mobile:open
```

If PowerShell blocks `npm`, use:

```bash
npm.cmd run mobile:sync
npm.cmd run mobile:open
```

Building Android locally requires Java/JDK. If Gradle says `JAVA_HOME is not set`, install Android Studio or JDK 21, then set `JAVA_HOME` to the JDK folder and open a new terminal.

To publish on Google Play:

1. Open the Android project with `npm.cmd run mobile:open`.
1. In Android Studio, create or choose a signing key.
1. Build a signed Android App Bundle (`.aab`).
1. Upload the `.aab` in Google Play Console.
1. Complete the store listing, screenshots, content rating, privacy policy, and Data safety form.

Before submission, confirm that `privacy@funmilayotobun.com` is an active,
monitored mailbox. The public Play Console URLs are:

```text
https://<your-production-domain>/privacy.html
https://<your-production-domain>/delete-account.html
```

Users can also delete their account directly from Profile. Account deletion
requires their current password and an explicit `DELETE` confirmation.

The Android app id is:

```text
com.funmilayotobun.budgetapp
```

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
