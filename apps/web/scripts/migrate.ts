import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = neon(databaseUrl);
const migration = await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8");
await sql.transaction(migration.split(/;\s*(?:\n|$)/).map((statement) => statement.trim()).filter(Boolean).map((statement) => sql.query(statement)));
console.log("Database migration completed");
