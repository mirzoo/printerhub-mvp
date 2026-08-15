import { config } from "@/lib/config";
import { hasBlobReference, listCleanupJobs, listOrderCleanupDocuments, markCleaned, markOrderDocumentCleaned, runExpiry } from "@/lib/db";
import { deleteUpload, listOldUploads } from "@/lib/storage";
import { copyHasBlobReference, expireCopySessions, listCopyAssetsForCleanup, markCopyAssetsCleaned } from "@/lib/copy-db";

export async function GET(request: Request) {
  if (!config.cronSecret || request.headers.get("authorization") !== `Bearer ${config.cronSecret}`) return Response.json({ message: "Unauthorized" }, { status: 401 });
  await runExpiry();
  await expireCopySessions();
  let cleaned = 0;
  for (const job of await listCleanupJobs()) {
    if (!job.blobPathname) continue;
    try { await deleteUpload(job.blobPathname); await markCleaned(job.id); cleaned += 1; } catch { /* retry next run */ }
  }
  for (const document of await listOrderCleanupDocuments()) {
    if (!document.blobPathname) continue;
    try { await deleteUpload(document.blobPathname); await markOrderDocumentCleaned(document.id); cleaned += 1; } catch { /* retry next run */ }
  }
  for (const asset of await listCopyAssetsForCleanup()) {
    let previewCleaned = !asset.previewPathname;
    let pdfCleaned = asset.keepPdf || !asset.pdfPathname;
    if (asset.previewPathname) try { await deleteUpload(asset.previewPathname); previewCleaned = true; cleaned += 1; } catch { /* retry next run */ }
    if (!asset.keepPdf && asset.pdfPathname) try { await deleteUpload(asset.pdfPathname); pdfCleaned = true; cleaned += 1; } catch { /* retry next run */ }
    if (previewCleaned && pdfCleaned) await markCopyAssetsCleaned(asset.pageId, !asset.keepPdf);
  }
  let orphans = 0;
  for (const pathname of await listOldUploads(new Date(Date.now() - 24 * 60 * 60_000))) {
    if (await hasBlobReference(pathname) || await copyHasBlobReference(pathname)) continue;
    try { await deleteUpload(pathname); orphans += 1; } catch { /* retry next run */ }
  }
  return Response.json({ ok: true, cleaned, orphans });
}
