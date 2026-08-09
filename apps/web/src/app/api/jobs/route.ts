import { jobCreateSchema } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { countDeviceQueue, countSessionJobs, createJob, getDevice } from "@/lib/db";
import { deviceAvailable } from "@/lib/device";
import { validatePdf } from "@/lib/pdf";
import { getSession, safeJson, unauthorized } from "@/lib/request";
import { createOpaqueToken, hashToken, requesterHash } from "@/lib/security";
import { deleteUpload, readUpload } from "@/lib/storage";
import type { JobRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return unauthorized();
  const parsed = jobCreateSchema.safeParse(await safeJson(request));
  if (!parsed.success) return Response.json({ message: "Проверьте параметры печати" }, { status: 400 });
  const { deviceId, pathname, copies } = parsed.data;
  if (!deviceAvailable(await getDevice(deviceId))) { await deleteUpload(pathname).catch(() => undefined); return Response.json({ message: "Принтер временно недоступен" }, { status: 409 }); }
  const sessionHash = requesterHash(session.id);
  const limits = await countSessionJobs(sessionHash);
  if (limits.active >= 1 || limits.recent >= 3 || await countDeviceQueue(deviceId) >= 5) { await deleteUpload(pathname).catch(() => undefined); return Response.json({ message: "Очередь занята. Дождитесь завершения текущего задания" }, { status: 429 }); }
  let pageCount: number;
  try { pageCount = await validatePdf(await readUpload(pathname)); }
  catch { await deleteUpload(pathname).catch(() => undefined); return Response.json({ message: "PDF повреждён, защищён паролем или превышает лимиты" }, { status: 400 }); }
  const id = crypto.randomUUID();
  const statusToken = createOpaqueToken();
  const now = new Date().toISOString();
  const job: JobRecord = { id, deviceId, status: "queued", pageCount, copies, blobPathname: pathname, statusTokenHash: hashToken(statusToken), sessionHash, cupsJobId: null, errorCode: null, leaseExpiresAt: null, cleanupPending: false, createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  await createJob(job);
  return Response.json({ id, statusToken, status: job.status, pageCount, copies, totalPages: pageCount * copies }, { status: 201 });
}
