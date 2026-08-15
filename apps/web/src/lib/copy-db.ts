import { neon } from "@neondatabase/serverless";
import { MAX_COPY_PAGES, type ScanError } from "@printerhub/contracts";
import { config } from "./config";
import type { CopyPageRecord, CopySessionRecord } from "./types";

type CopyMemory = { sessions: Map<string, CopySessionRecord>; pages: Map<string, CopyPageRecord> };
const globalState = globalThis as typeof globalThis & { __printerhubCopy?: CopyMemory };

function memory(): CopyMemory {
  globalState.__printerhubCopy ??= { sessions: new Map(), pages: new Map() };
  return globalState.__printerhubCopy;
}

function sql() {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for production database");
  return neon(config.databaseUrl);
}

function mapSession(row: Record<string, unknown>): CopySessionRecord {
  return {
    id: String(row.id), deviceId: String(row.device_id), status: row.status as CopySessionRecord["status"],
    statusTokenHash: String(row.status_token_hash), orderId: row.order_id ? String(row.order_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(), expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

function mapPage(row: Record<string, unknown>): CopyPageRecord {
  return {
    id: String(row.id), sessionId: String(row.session_id), position: Number(row.position), status: row.status as CopyPageRecord["status"],
    previewPathname: row.preview_pathname ? String(row.preview_pathname) : null, pdfPathname: row.pdf_pathname ? String(row.pdf_pathname) : null,
    errorCode: row.error_code ? row.error_code as ScanError : null, leaseExpiresAt: row.lease_expires_at ? new Date(String(row.lease_expires_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function createCopySession(session: CopySessionRecord): Promise<void> {
  if (!config.databaseUrl) { memory().sessions.set(session.id, structuredClone(session)); return; }
  await sql()`INSERT INTO copy_sessions (id, device_id, status_token_hash, status, expires_at) VALUES (${session.id}, ${session.deviceId}, ${session.statusTokenHash}, ${session.status}, ${session.expiresAt})`;
}

export async function getCopySession(id: string): Promise<CopySessionRecord | null> {
  if (!config.databaseUrl) return memory().sessions.get(id) ?? null;
  const rows = await sql()`SELECT * FROM copy_sessions WHERE id = ${id}`;
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function getCopySessionByOrder(orderId: string): Promise<CopySessionRecord | null> {
  if (!config.databaseUrl) return [...memory().sessions.values()].find((item) => item.orderId === orderId) ?? null;
  const rows = await sql()`SELECT * FROM copy_sessions WHERE order_id = ${orderId}`;
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function listCopyPages(sessionId: string, includeDeleted = false): Promise<CopyPageRecord[]> {
  if (!config.databaseUrl) return [...memory().pages.values()].filter((page) => page.sessionId === sessionId && (includeDeleted || page.status !== "deleted")).sort((a, b) => a.position - b.position);
  const rows = includeDeleted
    ? await sql()`SELECT * FROM copy_pages WHERE session_id = ${sessionId} ORDER BY position`
    : await sql()`SELECT * FROM copy_pages WHERE session_id = ${sessionId} AND status <> 'deleted' ORDER BY position`;
  return rows.map(mapPage);
}

export async function getCopyPage(id: string): Promise<CopyPageRecord | null> {
  if (!config.databaseUrl) return memory().pages.get(id) ?? null;
  const rows = await sql()`SELECT * FROM copy_pages WHERE id = ${id}`;
  return rows[0] ? mapPage(rows[0]) : null;
}

export async function createCopyPage(sessionId: string): Promise<CopyPageRecord | null> {
  const pages = await listCopyPages(sessionId);
  if (pages.length >= MAX_COPY_PAGES || pages.some((page) => page.status === "queued" || page.status === "scanning")) return null;
  const used = new Set(pages.map((page) => page.position));
  const position = Array.from({ length: MAX_COPY_PAGES }, (_, index) => index).find((index) => !used.has(index));
  if (position === undefined) return null;
  const now = new Date().toISOString();
  const page: CopyPageRecord = { id: crypto.randomUUID(), sessionId, position, status: "queued", previewPathname: crypto.randomUUID(), pdfPathname: null, errorCode: null, leaseExpiresAt: null, createdAt: now, updatedAt: now };
  if (!config.databaseUrl) { memory().pages.set(page.id, page); return structuredClone(page); }
  const rows = await sql()`INSERT INTO copy_pages (id, session_id, position, status, preview_pathname) VALUES (${page.id}, ${sessionId}, ${position}, 'queued', ${page.previewPathname}) RETURNING *`;
  return rows[0] ? mapPage(rows[0]) : null;
}

export async function claimCopyPage(deviceId: string): Promise<CopyPageRecord | null> {
  if (!config.databaseUrl) {
    const state = memory();
    for (const page of state.pages.values()) if (page.status === "scanning" && page.leaseExpiresAt && new Date(page.leaseExpiresAt).getTime() < Date.now()) { page.status = "queued"; page.leaseExpiresAt = null; }
    const page = [...state.pages.values()].filter((item) => item.status === "queued" && state.sessions.get(item.sessionId)?.deviceId === deviceId && state.sessions.get(item.sessionId)?.status === "collecting").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!page) return null;
    page.status = "scanning"; page.updatedAt = new Date().toISOString(); page.leaseExpiresAt = new Date(Date.now() + 3 * 60_000).toISOString(); return structuredClone(page);
  }
  await sql()`UPDATE copy_pages SET status = 'queued', lease_expires_at = NULL, updated_at = now() WHERE status = 'scanning' AND lease_expires_at < now()`;
  const rows = await sql()`WITH next_page AS (SELECT p.id FROM copy_pages p JOIN copy_sessions s ON s.id = p.session_id WHERE s.device_id = ${deviceId} AND s.status = 'collecting' AND s.expires_at > now() AND p.status = 'queued' ORDER BY p.created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE copy_pages p SET status = 'scanning', lease_expires_at = now() + interval '3 minutes', updated_at = now() FROM next_page WHERE p.id = next_page.id RETURNING p.*`;
  return rows[0] ? mapPage(rows[0]) : null;
}

export async function completeCopyPage(id: string, pdfPathname: string): Promise<CopyPageRecord | null> {
  if (!config.databaseUrl) {
    const page = memory().pages.get(id); if (!page || page.status !== "scanning") return null;
    page.status = "ready"; page.pdfPathname = pdfPathname; page.errorCode = null; page.leaseExpiresAt = null; page.updatedAt = new Date().toISOString(); return structuredClone(page);
  }
  const rows = await sql()`UPDATE copy_pages SET status = 'ready', pdf_pathname = ${pdfPathname}, error_code = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = ${id} AND status = 'scanning' RETURNING *`;
  return rows[0] ? mapPage(rows[0]) : null;
}

export async function failCopyPage(id: string, errorCode: ScanError): Promise<CopyPageRecord | null> {
  if (!config.databaseUrl) {
    const page = memory().pages.get(id); if (!page || page.status !== "scanning") return null;
    page.status = "failed"; page.errorCode = errorCode; page.leaseExpiresAt = null; page.updatedAt = new Date().toISOString(); return structuredClone(page);
  }
  const rows = await sql()`UPDATE copy_pages SET status = 'failed', error_code = ${errorCode}, lease_expires_at = NULL, updated_at = now() WHERE id = ${id} AND status = 'scanning' RETURNING *`;
  return rows[0] ? mapPage(rows[0]) : null;
}

export async function retryCopyPage(id: string, previewPathname: string): Promise<CopyPageRecord | null> {
  if (!config.databaseUrl) {
    const page = memory().pages.get(id); if (!page || !["ready", "failed"].includes(page.status)) return null;
    page.status = "queued"; page.previewPathname = previewPathname; page.pdfPathname = null; page.errorCode = null; page.updatedAt = new Date().toISOString(); return structuredClone(page);
  }
  const rows = await sql()`UPDATE copy_pages SET status = 'queued', preview_pathname = ${previewPathname}, pdf_pathname = NULL, error_code = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = ${id} AND status IN ('ready','failed') RETURNING *`;
  return rows[0] ? mapPage(rows[0]) : null;
}

export async function deleteCopyPageRecord(id: string): Promise<CopyPageRecord | null> {
  const page = await getCopyPage(id);
  if (!page || page.status === "scanning") return null;
  if (!config.databaseUrl) { memory().pages.delete(id); return page; }
  const rows = await sql()`DELETE FROM copy_pages WHERE id = ${id} AND status <> 'scanning' RETURNING *`;
  return rows[0] ? mapPage(rows[0]) : null;
}

export async function submitCopySession(id: string, orderId: string): Promise<boolean> {
  if (!config.databaseUrl) {
    const session = memory().sessions.get(id); if (!session || session.status !== "collecting") return false;
    session.status = "submitted"; session.orderId = orderId; session.updatedAt = new Date().toISOString(); return true;
  }
  const rows = await sql()`UPDATE copy_sessions SET status = 'submitted', order_id = ${orderId}, updated_at = now() WHERE id = ${id} AND status = 'collecting' RETURNING id`;
  return Boolean(rows[0]);
}

export async function cancelCopySession(id: string): Promise<boolean> {
  if (!config.databaseUrl) {
    const session = memory().sessions.get(id); if (!session || session.status !== "collecting") return false;
    session.status = "cancelled"; session.updatedAt = new Date().toISOString(); return true;
  }
  const rows = await sql()`UPDATE copy_sessions SET status = 'cancelled', updated_at = now() WHERE id = ${id} AND status = 'collecting' RETURNING id`;
  return Boolean(rows[0]);
}

export async function expireCopySessions(): Promise<void> {
  if (!config.databaseUrl) {
    for (const session of memory().sessions.values()) if (session.status === "collecting" && new Date(session.expiresAt).getTime() < Date.now()) session.status = "expired";
    return;
  }
  await sql()`UPDATE copy_sessions SET status = 'expired', updated_at = now() WHERE status = 'collecting' AND expires_at < now()`;
}

export async function listCopyAssetsForCleanup(): Promise<Array<{ pageId: string; previewPathname: string | null; pdfPathname: string | null; keepPdf: boolean }>> {
  if (!config.databaseUrl) {
    const state = memory();
    return [...state.pages.values()].flatMap((page) => {
      const status = state.sessions.get(page.sessionId)?.status;
      return status && ["submitted", "cancelled", "expired"].includes(status) && (page.previewPathname || page.pdfPathname) ? [{ pageId: page.id, previewPathname: page.previewPathname, pdfPathname: page.pdfPathname, keepPdf: status === "submitted" }] : [];
    });
  }
  const rows = await sql()`SELECT p.id, p.preview_pathname, p.pdf_pathname, s.status FROM copy_pages p JOIN copy_sessions s ON s.id = p.session_id WHERE s.status IN ('submitted','cancelled','expired') AND (p.preview_pathname IS NOT NULL OR p.pdf_pathname IS NOT NULL) LIMIT 100`;
  return rows.map((row) => ({ pageId: String(row.id), previewPathname: row.preview_pathname ? String(row.preview_pathname) : null, pdfPathname: row.pdf_pathname ? String(row.pdf_pathname) : null, keepPdf: row.status === "submitted" }));
}

export async function markCopyAssetsCleaned(pageId: string, clearPdf: boolean): Promise<void> {
  if (!config.databaseUrl) {
    const page = memory().pages.get(pageId); if (page) { page.previewPathname = null; if (clearPdf) page.pdfPathname = null; } return;
  }
  await sql()`UPDATE copy_pages SET preview_pathname = NULL, pdf_pathname = CASE WHEN ${clearPdf} THEN NULL ELSE pdf_pathname END, updated_at = now() WHERE id = ${pageId}`;
}

export async function copyHasBlobReference(pathname: string): Promise<boolean> {
  if (!config.databaseUrl) return [...memory().pages.values()].some((page) => page.previewPathname === pathname || page.pdfPathname === pathname);
  const rows = await sql()`SELECT EXISTS (SELECT 1 FROM copy_pages WHERE preview_pathname = ${pathname} OR pdf_pathname = ${pathname}) AS exists`;
  return Boolean(rows[0]?.exists);
}

export async function clearCopyPdfReference(pathname: string): Promise<void> {
  if (!config.databaseUrl) {
    for (const page of memory().pages.values()) if (page.pdfPathname === pathname) page.pdfPathname = null;
    return;
  }
  await sql()`UPDATE copy_pages SET pdf_pathname = NULL, updated_at = now() WHERE pdf_pathname = ${pathname}`;
}

export async function clearCopyPreviewReference(pathname: string): Promise<void> {
  if (!config.databaseUrl) {
    for (const page of memory().pages.values()) if (page.previewPathname === pathname) page.previewPathname = null;
    return;
  }
  await sql()`UPDATE copy_pages SET preview_pathname = NULL, updated_at = now() WHERE preview_pathname = ${pathname}`;
}
