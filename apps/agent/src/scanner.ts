import { access } from "node:fs/promises";
import { command } from "./command.js";
import { config } from "./config.js";

export type ScannerStatus = { scannerState: "idle" | "busy" | "unavailable"; scannerStateReason: string | null };

export async function inspectScanner(): Promise<ScannerStatus> {
  try {
    await access(config.scannerHelperPath);
    const result = await command(config.scannerHelperPath, probeArgs(), 15_000);
    if (result.code === 0) return { scannerState: "idle", scannerStateReason: null };
    const code = parseCode(result.stdout) ?? "probe-failed";
    return { scannerState: code === "SCANNER_BUSY" ? "busy" : "unavailable", scannerStateReason: code.toLowerCase().replaceAll("_", "-") };
  } catch {
    return { scannerState: "unavailable", scannerStateReason: "helper-unavailable" };
  }
}

export async function scanToJpeg(outputPath: string): Promise<void> {
  const args = ["--output", outputPath];
  if (config.scannerName) args.push("--scanner", config.scannerName);
  try {
    const result = await command(config.scannerHelperPath, args, 2 * 60_000);
    if (result.code !== 0) throw new Error(normalizeCode(parseCode(result.stdout)));
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) throw new Error("SCAN_TIMEOUT");
    throw error;
  }
}

function probeArgs() {
  const args = ["--probe"];
  if (config.scannerName) args.push("--scanner", config.scannerName);
  return args;
}

function parseCode(output: string): string | null {
  try { return String((JSON.parse(output.trim()) as { code?: unknown }).code ?? "") || null; } catch { return null; }
}

function normalizeCode(code: string | null) {
  return new Set(["SCANNER_UNAVAILABLE", "SCANNER_BUSY", "SCAN_TIMEOUT", "SCAN_FAILED"]).has(code ?? "") ? code! : "SCAN_FAILED";
}
