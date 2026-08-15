import type { PrintMode } from "@printerhub/contracts";
import { command } from "./command.js";

export type PrinterStatus = { printerState: "idle" | "processing" | "stopped" | "unavailable"; printerStateReasons: string[] };

export async function inspectPrinter(mode: PrintMode, queue: string): Promise<PrinterStatus> {
  if (mode === "dry-run") return { printerState: "idle", printerStateReasons: [] };
  try {
    const result = await command("lpstat", ["-l", "-p", queue], 10_000);
    if (result.code !== 0) return { printerState: "unavailable", printerStateReasons: ["not-connected"] };
    const output = `${result.stdout}\n${result.stderr}`;
    const reasons = output.split("\n").filter((line) => /(reason|причин|offline|paused|stopped|jam|toner|media-empty|cover-open)/i.test(line)).map((line) => line.trim().slice(0, 120)).slice(0, 20);
    const stopped = /(disabled|stopped|paused|остановлен|отключен)/i.test(output);
    const processing = /(processing|печатает|printing)/i.test(output);
    return { printerState: stopped ? "stopped" : processing ? "processing" : "idle", printerStateReasons: reasons };
  } catch {
    return { printerState: "unavailable", printerStateReasons: ["not-connected"] };
  }
}

export async function buildPrintArgs(queue: string, copies: number, filePath: string): Promise<string[]> {
  if (!Number.isInteger(copies) || copies < 1 || copies > 10) throw new Error("Invalid copies");
  if (!/^[A-Za-z0-9_.-]+$/.test(queue)) throw new Error("Invalid printer queue");
  const capabilities = await command("lpoptions", ["-p", queue, "-l"], 10_000);
  if (capabilities.code !== 0) throw new Error("Unable to read printer capabilities");
  const mediaOption = findOption(capabilities.stdout, /(PageSize|media)/i, ["A4"]);
  if (!mediaOption) throw new Error("Printer does not advertise A4 support");
  const args = ["-d", queue, "-n", String(copies), "-o", mediaOption];
  const duplexLine = capabilities.stdout.split("\n").find((line) => /duplex|sides/i.test(line));
  if (duplexLine) {
    const oneSided = findOption(duplexLine, /.+/, ["None", "Off", "one-sided"]);
    if (!oneSided) throw new Error("Unable to enforce one-sided printing");
    args.push("-o", oneSided);
  }
  args.push(filePath);
  return args;
}

export function findOption(capabilities: string, keyPattern: RegExp, values: string[]): string | null {
  for (const line of capabilities.split("\n")) {
    const key = line.match(/^([^/\s:]+)(?:\/[^:]+)?:/)?.[1];
    if (!key || !keyPattern.test(key)) continue;
    const tokens = line.slice(line.indexOf(":") + 1).trim().split(/\s+/).map((value) => value.replace(/^\*/, ""));
    const match = values.find((candidate) => tokens.some((value) => value.toLowerCase() === candidate.toLowerCase()));
    if (match) return `${key}=${tokens.find((value) => value.toLowerCase() === match.toLowerCase())}`;
  }
  return null;
}

export async function submitPrint(queue: string, copies: number, filePath: string): Promise<string> {
  const result = await command("lp", await buildPrintArgs(queue, copies, filePath), 30_000);
  if (result.code !== 0) throw new Error("lp failed");
  const jobId = result.stdout.match(/([A-Za-z0-9_.-]+-\d+)/)?.[1];
  if (!jobId) throw new Error("CUPS job id not found");
  return jobId;
}

export async function waitForPrint(queue: string, jobId: string, timeoutMs = 10 * 60_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pending = await command("lpstat", ["-W", "not-completed", "-o", queue], 10_000);
    if (pending.code === 0 && !pending.stdout.includes(jobId)) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("PRINT_TIMEOUT");
}
