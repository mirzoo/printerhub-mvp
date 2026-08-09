import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const deviceId = process.env.DEVICE_ID ?? "printer-001";
const cupsQueue = process.env.PRINTER_NAME ?? "Brother_DCP_1600_series";
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
const sql = neon(databaseUrl);
await sql`INSERT INTO devices (id, token_hash, cups_queue) VALUES (${deviceId}, ${tokenHash}, ${cupsQueue}) ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, cups_queue = EXCLUDED.cups_queue, updated_at = now()`;
console.log(JSON.stringify({ deviceId, deviceToken: token, cupsQueue }));
