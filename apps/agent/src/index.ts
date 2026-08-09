import type { ClaimedJob } from "@printerhub/contracts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { claim, heartbeat, updateJob } from "./api.js";
import { config } from "./config.js";
import { validatePdfFile } from "./pdf.js";
import { inspectPrinter, submitPrint, waitForPrint } from "./printer.js";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

console.log(`PrinterHub Agent: ${config.deviceId}, mode=${config.printMode}`);
if (config.printMode === "real") {
  const status = await inspectPrinter(config.printMode, config.printerName);
  if (status.printerState === "unavailable") throw new Error(`Printer ${config.printerName} is unavailable`);
}

let lastHeartbeat = 0;
while (!stopping) {
  try {
    if (Date.now() - lastHeartbeat >= 15_000) {
      await heartbeat(await inspectPrinter(config.printMode, config.printerName));
      lastHeartbeat = Date.now();
    }
    const job = await claim();
    if (job) await processJob(job);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Agent loop failed");
  }
  await sleep(config.pollIntervalMs);
}

async function processJob(job: ClaimedJob) {
  const directory = await mkdtemp(path.join(tmpdir(), "printerhub-"));
  const filePath = path.join(directory, `${crypto.randomUUID()}.pdf`);
  let printingStarted = false;
  try {
    const response = await fetch(job.downloadUrl, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error("DOWNLOAD_FAILED");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 20 * 1024 * 1024) throw new Error("INVALID_PDF");
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
    const actualPages = await validatePdfFile(filePath, config.pdfinfoPath);
    if (actualPages !== job.pageCount) throw new Error("PAGE_COUNT_MISMATCH");

    await updateJob(job.id, { status: "printing" });
    printingStarted = true;
    if (config.printMode === "dry-run") {
      await sleep(700);
      await updateJob(job.id, { status: "completed", cupsJobId: `dry-run-${crypto.randomUUID()}` });
      return;
    }
    const cupsJobId = await submitPrint(config.printerName, job.copies, filePath);
    await waitForPrint(cupsJobId);
    await updateJob(job.id, { status: "completed", cupsJobId });
  } catch (error) {
    const code = normalizeError(error);
    try { await updateJob(job.id, { status: "failed", errorCode: code }); } catch {
      if (printingStarted) console.error(`Job ${job.id}: status unknown after printing started`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function normalizeError(error: unknown) {
  const known = new Set(["DOWNLOAD_FAILED", "INVALID_PDF", "PAGE_COUNT_MISMATCH", "PRINT_TIMEOUT"]);
  const message = error instanceof Error ? error.message : "";
  return known.has(message) ? message : message === "lp failed" ? "PRINT_COMMAND_FAILED" : "INTERNAL_ERROR";
}

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
