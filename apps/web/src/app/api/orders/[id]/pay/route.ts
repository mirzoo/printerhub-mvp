import { MAX_FILE_SIZE, mockPaymentSchema } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { completeOrderPayment, countDeviceQueue, countSessionJobs, getDevice, getOrder, markOrderDocumentCleaned, markOrderPaymentFailed } from "@/lib/db";
import { deviceAvailable } from "@/lib/device";
import { mergePdfPages } from "@/lib/pdf";
import { getSession, safeJson, unauthorized } from "@/lib/request";
import { createOrderJobToken, hashToken, requesterHash } from "@/lib/security";
import { deleteUpload, readUpload, writeUpload } from "@/lib/storage";
import { clearCopyPdfReference, clearCopyPreviewReference, getCopySessionByOrder, listCopyPages } from "@/lib/copy-db";
import type { JobRecord } from "@/lib/types";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await getOrder(id);
  const session = getSession(request);
  const copySession = await getCopySessionByOrder(id);
  const copyToken = request.headers.get("x-copy-token") ?? "";
  const authorizedSessionHash = copySession && hashToken(copyToken) === copySession.statusTokenHash ? requesterHash(copyToken) : session ? requesterHash(session.id) : null;
  if (!authorizedSessionHash) return unauthorized();
  const orderToken = request.headers.get("x-order-token") ?? "";
  if (!order || hashToken(orderToken) !== order.statusTokenHash || authorizedSessionHash !== order.sessionHash) return Response.json({ message: "Заказ не найден" }, { status: 404 });
  const parsed = mockPaymentSchema.safeParse(await safeJson(request));
  if (!parsed.success) return Response.json({ message: "Не удалось проверить результат оплаты" }, { status: 400 });

  if (parsed.data.outcome === "failed") {
    await markOrderPaymentFailed(id);
    return Response.json({ message: "Оплата не прошла. Попробуйте снова" }, { status: 402 });
  }
  const jobToken = createOrderJobToken(order.id);
  if (order.printJobId) return Response.json({ jobId: order.printJobId, jobToken, status: order.status });
  if (order.status !== "awaiting_payment" || new Date(order.expiresAt).getTime() <= Date.now()) return Response.json({ message: "Время оформления заказа истекло" }, { status: 409 });
  if (!deviceAvailable(await getDevice(order.deviceId))) return Response.json({ message: "Аппарат временно недоступен. Оплата не выполнена" }, { status: 409 });
  const limits = await countSessionJobs(order.sessionHash);
  if (limits.active >= 1 || limits.recent >= 3 || await countDeviceQueue(order.deviceId) >= 5) return Response.json({ message: "Очередь занята. Оплата не выполнена" }, { status: 429 });

  let combinedPathname: string | null = null;
  try {
    const inputs = [];
    for (const document of order.documents) {
      if (!document.blobPathname) throw new Error("DOCUMENT_MISSING");
      inputs.push({ bytes: await readUpload(document.blobPathname), selectedPages: document.selectedPages });
    }
    if (copySession) {
      for (const page of await listCopyPages(copySession.id, true)) {
        if (!page.previewPathname) continue;
        try { await deleteUpload(page.previewPathname); await clearCopyPreviewReference(page.previewPathname); } catch { /* cron retries */ }
      }
    }
    const combined = await mergePdfPages(inputs);
    if (combined.length > MAX_FILE_SIZE) throw new Error("INVALID_SIZE");
    combinedPathname = crypto.randomUUID();
    await writeUpload(combinedPathname, combined);
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const job: JobRecord = {
      id: jobId, deviceId: order.deviceId, status: "queued", pageCount: order.selectedPageCount, copies: order.copies, blobPathname: combinedPathname,
      statusTokenHash: hashToken(jobToken), sessionHash: order.sessionHash, cupsJobId: null, errorCode: null, leaseExpiresAt: null, cleanupPending: false,
      createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), orderId: order.id,
    };
    const completed = await completeOrderPayment(order.id, job);
    if (!completed) throw new Error("PAYMENT_CONFLICT");
    for (const document of order.documents) {
      if (!document.blobPathname) continue;
      try { await deleteUpload(document.blobPathname); await markOrderDocumentCleaned(document.id); await clearCopyPdfReference(document.blobPathname); } catch { /* cron retries */ }
    }
    return Response.json({ jobId, jobToken, status: "queued" });
  } catch {
    if (combinedPathname) await deleteUpload(combinedPathname).catch(() => undefined);
    return Response.json({ message: "Не удалось подготовить документы. Оплата не выполнена" }, { status: 500 });
  }
}
