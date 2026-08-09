import { loadEnvFile } from "node:process";
import { printModeSchema } from "@printerhub/contracts";

try { loadEnvFile(".env.local"); } catch { /* env file is optional */ }

export const config = {
  apiBaseUrl: required("API_BASE_URL").replace(/\/$/, ""),
  deviceId: process.env.DEVICE_ID ?? "printer-001",
  deviceToken: required("DEVICE_TOKEN"),
  printerName: process.env.PRINTER_NAME ?? "Brother_DCP_1600_series",
  printMode: printModeSchema.parse(process.env.PRINT_MODE ?? "dry-run"),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 2_000),
  pdfinfoPath: process.env.PDFINFO_PATH ?? "pdfinfo",
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
