import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (process.argv.includes("--optional")) {
      console.log("Skipping database migration: DATABASE_URL is not configured");
      return;
    }
    throw new Error("DATABASE_URL is required");
  }

  const sql = neon(databaseUrl);
  for (const name of ["001_initial.sql", "002_orders.sql", "003_copying.sql"]) {
    const migration = await readFile(new URL(`../db/${name}`, import.meta.url), "utf8");
    const statements = migration
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => sql.query(statement));
    await sql.transaction(statements);
  }

  console.log("Database migration completed");
}

void main();
