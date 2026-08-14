import { config } from "@/lib/config";
import { hasBlobReference, listCleanupJobs, listOrderCleanupDocuments, markCleaned, markOrderDocumentCleaned, runExpiry } from "@/lib/db";
import { deleteUpload, listOldUploads } from "@/lib/storage";

export async function GET(request: Request) {
  if (!config.cronSecret || request.headers.get("authorization") !== `Bearer ${config.cronSecret}`) return Response.json({ message: "Unauthorized" }, { status: 401 });
  await runExpiry();
  let cleaned = 0;
  for (const job of await listCleanupJobs()) {
    if (!job.blobPathname) continue;
    try { await deleteUpload(job.blobPathname); await markCleaned(job.id); cleaned += 1; } catch { /* retry next run */ }
  }
  for (const document of await listOrderCleanupDocuments()) {
    if (!document.blobPathname) continue;
    try { await deleteUpload(document.blobPathname); await markOrderDocumentCleaned(document.id); cleaned += 1; } catch { /* retry next run */ }
  }
  let orphans = 0;
  for (const pathname of await listOldUploads(new Date(Date.now() - 24 * 60 * 60_000))) {
    if (await hasBlobReference(pathname)) continue;
    try { await deleteUpload(pathname); orphans += 1; } catch { /* retry next run */ }
  }
  return Response.json({ ok: true, cleaned, orphans });
}
