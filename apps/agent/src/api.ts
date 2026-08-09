import type { ClaimedJob } from "@printerhub/contracts";
import { config } from "./config.js";
import type { PrinterStatus } from "./printer.js";

const headers = { authorization: `Bearer ${config.deviceToken}`, "x-device-id": config.deviceId, "content-type": "application/json" };

export async function heartbeat(status: PrinterStatus): Promise<void> {
  await api("/api/agent/heartbeat", { method: "POST", body: JSON.stringify({ deviceId: config.deviceId, printMode: config.printMode, ...status }) });
}

export async function claim(): Promise<ClaimedJob | null> {
  const response = await fetch(`${config.apiBaseUrl}/api/agent/jobs/claim`, { method: "POST", headers, signal: AbortSignal.timeout(20_000) });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Claim failed: ${response.status}`);
  return response.json() as Promise<ClaimedJob>;
}

export async function updateJob(id: string, body: { status: "printing" | "completed" | "failed"; cupsJobId?: string; errorCode?: string }): Promise<void> {
  await api(`/api/agent/jobs/${id}`, { method: "POST", body: JSON.stringify(body) });
}

async function api(path: string, init: RequestInit) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response;
}
