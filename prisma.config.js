require("dotenv/config");

const { defineConfig } = require("prisma/config");

const databaseUrl = process.env.DATABASE_URL
  || "postgresql://budgetapp:budgetapp_dev_password@localhost:5433/budgetapp?schema=public";

module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js"
  },
  datasource: {
    url: databaseUrl
  }
});
