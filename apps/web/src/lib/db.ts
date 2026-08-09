import { neon } from "@neondatabase/serverless";
import type { JobStatus } from "@printerhub/contracts";
import { config } from "./config";
import type { DeviceRecord, JobRecord } from "./types";

type MemoryState = { devices: Map<string, DeviceRecord>; jobs: Map<string, JobRecord>; access: Array<{ requester: string; success: boolean; at: number }> };
const globalState = globalThis as typeof globalThis & { __printerhub?: MemoryState };

function memory(): MemoryState {
  if (!globalState.__printerhub) {
    globalState.__printerhub = { devices: new Map(), jobs: new Map(), access: [] };
    globalState.__printerhub.devices.set("printer-001", {
      id: "printer-001", tokenHash: "", cupsQueue: "Brother_DCP_1600_series", lastSeen: null,
      printMode: null, printerState: "unavailable", printerStateReasons: [],
    });
  }
  return globalState.__printerhub;
}

function sql() {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for production database");
  return neon(config.databaseUrl);
}

function mapDevice(row: Record<string, unknown>): DeviceRecord {
  return { id: String(row.id), tokenHash: String(row.token_hash), cupsQueue: String(row.cups_queue), lastSeen: row.last_seen ? new Date(String(row.last_seen)).toISOString() : null, printMode: row.print_mode as DeviceRecord["printMode"], printerState: row.printer_state as DeviceRecord["printerState"], printerStateReasons: (row.printer_state_reasons as string[]) ?? [] };
}

function mapJob(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id), deviceId: String(row.device_id), status: row.status as JobStatus,
    pageCount: Number(row.page_count), copies: Number(row.copies), blobPathname: row.blob_pathname ? String(row.blob_pathname) : null,
    statusTokenHash: String(row.status_token_hash), sessionHash: String(row.session_hash), cupsJobId: row.cups_job_id ? String(row.cups_job_id) : null,
    errorCode: row.error_code ? String(row.error_code) : null, leaseExpiresAt: row.lease_expires_at ? new Date(String(row.lease_expires_at)).toISOString() : null,
    cleanupPending: Boolean(row.cleanup_pending), createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(), expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

export async function recordAccessAttempt(requester: string, success: boolean) {
  if (!config.databaseUrl) { const state = memory(); state.access.push({ requester, success, at: Date.now() }); state.access = state.access.filter((item) => item.at > Date.now() - 86_400_000); return; }
  await sql()`INSERT INTO access_events (requester_hash, success) VALUES (${requester}, ${success})`;
}

export async function failedAccessCount(requester: string): Promise<number> {
  if (!config.databaseUrl) return memory().access.filter((item) => item.requester === requester && !item.success && item.at > Date.now() - 15 * 60_000).length;
  const rows = await sql()`SELECT count(*)::int AS count FROM access_events WHERE requester_hash = ${requester} AND success = false AND created_at > now() - interval '15 minutes'`;
  return Number(rows[0]?.count ?? 0);
}

export async function getDevice(id: string): Promise<DeviceRecord | null> {
  if (!config.databaseUrl) return memory().devices.get(id) ?? null;
  const rows = await sql()`SELECT * FROM devices WHERE id = ${id}`;
  return rows[0] ? mapDevice(rows[0]) : null;
}

export async function heartbeatDevice(device: DeviceRecord): Promise<void> {
  const now = new Date().toISOString();
  if (!config.databaseUrl) { memory().devices.set(device.id, { ...device, lastSeen: now }); return; }
  await sql()`UPDATE devices SET last_seen = now(), print_mode = ${device.printMode}, printer_state = ${device.printerState}, printer_state_reasons = ${device.printerStateReasons}, cups_queue = ${device.cupsQueue}, updated_at = now() WHERE id = ${device.id}`;
}

export async function countSessionJobs(sessionHash: string): Promise<{ recent: number; active: number }> {
  const cutoff = Date.now() - 10 * 60_000;
  if (!config.databaseUrl) {
    const jobs = [...memory().jobs.values()].filter((job) => job.sessionHash === sessionHash);
    return { recent: jobs.filter((job) => new Date(job.createdAt).getTime() > cutoff).length, active: jobs.filter((job) => ["queued", "claimed", "printing"].includes(job.status)).length };
  }
  const rows = await sql()`SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes')::int AS recent, count(*) FILTER (WHERE status IN ('queued','claimed','printing'))::int AS active FROM print_jobs WHERE session_hash = ${sessionHash}`;
  return { recent: Number(rows[0]?.recent ?? 0), active: Number(rows[0]?.active ?? 0) };
}

export async function countDeviceQueue(deviceId: string): Promise<number> {
  if (!config.databaseUrl) return [...memory().jobs.values()].filter((job) => job.deviceId === deviceId && ["queued", "claimed"].includes(job.status)).length;
  const rows = await sql()`SELECT count(*)::int AS count FROM print_jobs WHERE device_id = ${deviceId} AND status IN ('queued','claimed')`;
  return Number(rows[0]?.count ?? 0);
}

export async function createJob(job: JobRecord): Promise<void> {
  if (!config.databaseUrl) { memory().jobs.set(job.id, job); return; }
  await sql()`INSERT INTO print_jobs (id, device_id, status, page_count, copies, blob_pathname, status_token_hash, session_hash, expires_at) VALUES (${job.id}, ${job.deviceId}, ${job.status}, ${job.pageCount}, ${job.copies}, ${job.blobPathname}, ${job.statusTokenHash}, ${job.sessionHash}, ${job.expiresAt})`;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  if (!config.databaseUrl) return memory().jobs.get(id) ?? null;
  const rows = await sql()`SELECT * FROM print_jobs WHERE id = ${id}`;
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function claimJob(deviceId: string): Promise<JobRecord | null> {
  if (!config.databaseUrl) {
    const state = memory();
    for (const job of state.jobs.values()) if (job.status === "claimed" && job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) { job.status = "queued"; job.leaseExpiresAt = null; }
    const job = [...state.jobs.values()].filter((item) => item.deviceId === deviceId && item.status === "queued" && new Date(item.expiresAt).getTime() > Date.now()).sort((a,b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!job) return null;
    job.status = "claimed"; job.updatedAt = new Date().toISOString(); job.leaseExpiresAt = new Date(Date.now() + 60_000).toISOString(); return job;
  }
  await sql()`UPDATE print_jobs SET status = 'queued', lease_expires_at = null, updated_at = now() WHERE device_id = ${deviceId} AND status = 'claimed' AND lease_expires_at < now()`;
  const rows = await sql()`WITH next_job AS (SELECT id FROM print_jobs WHERE device_id = ${deviceId} AND status = 'queued' AND expires_at > now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE print_jobs j SET status = 'claimed', lease_expires_at = now() + interval '60 seconds', updated_at = now() FROM next_job WHERE j.id = next_job.id RETURNING j.*`;
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function updateJob(id: string, expected: JobStatus, status: JobStatus, values: { cupsJobId?: string; errorCode?: string; blobPathname?: null; cleanupPending?: boolean } = {}): Promise<JobRecord | null> {
  if (!config.databaseUrl) {
    const job = memory().jobs.get(id); if (!job || job.status !== expected) return null;
    job.status = status; job.updatedAt = new Date().toISOString(); job.leaseExpiresAt = null;
    if (values.cupsJobId) job.cupsJobId = values.cupsJobId; if (values.errorCode) job.errorCode = values.errorCode;
    if (values.blobPathname === null) job.blobPathname = null; if (values.cleanupPending !== undefined) job.cleanupPending = values.cleanupPending;
    return job;
  }
  const rows = await sql()`UPDATE print_jobs SET status = ${status}, cups_job_id = COALESCE(${values.cupsJobId ?? null}, cups_job_id), error_code = COALESCE(${values.errorCode ?? null}, error_code), blob_pathname = CASE WHEN ${values.blobPathname === null} THEN NULL ELSE blob_pathname END, cleanup_pending = COALESCE(${values.cleanupPending ?? null}, cleanup_pending), lease_expires_at = NULL, updated_at = now() WHERE id = ${id} AND status = ${expected} RETURNING *`;
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function listCleanupJobs(): Promise<JobRecord[]> {
  if (!config.databaseUrl) return [...memory().jobs.values()].filter((job) => job.cleanupPending && job.blobPathname);
  const rows = await sql()`SELECT * FROM print_jobs WHERE cleanup_pending = true AND blob_pathname IS NOT NULL LIMIT 100`;
  return rows.map(mapJob);
}

export async function markCleaned(id: string): Promise<void> {
  if (!config.databaseUrl) { const job = memory().jobs.get(id); if (job) { job.blobPathname = null; job.cleanupPending = false; } return; }
  await sql()`UPDATE print_jobs SET blob_pathname = NULL, cleanup_pending = false, updated_at = now() WHERE id = ${id}`;
}

export async function hasBlobReference(pathname: string): Promise<boolean> {
  if (!config.databaseUrl) return [...memory().jobs.values()].some((job) => job.blobPathname === pathname);
  const rows = await sql()`SELECT EXISTS (SELECT 1 FROM print_jobs WHERE blob_pathname = ${pathname}) AS exists`;
  return Boolean(rows[0]?.exists);
}

export async function runExpiry(): Promise<void> {
  if (!config.databaseUrl) {
    for (const job of memory().jobs.values()) if (["queued", "claimed"].includes(job.status) && new Date(job.expiresAt).getTime() < Date.now()) { job.status = "expired"; job.cleanupPending = true; }
    return;
  }
  await sql()`UPDATE print_jobs SET status = 'expired', error_code = 'PRINTER_UNAVAILABLE', cleanup_pending = true, updated_at = now() WHERE status IN ('queued','claimed') AND expires_at < now()`;
  await sql()`UPDATE print_jobs SET status = 'failed', error_code = 'PRINT_STATUS_UNKNOWN', cleanup_pending = true, updated_at = now() WHERE status = 'printing' AND updated_at < now() - interval '15 minutes'`;
  await sql()`DELETE FROM print_jobs WHERE created_at < now() - interval '7 days' AND blob_pathname IS NULL`;
  await sql()`DELETE FROM access_events WHERE created_at < now() - interval '1 day'`;
}
