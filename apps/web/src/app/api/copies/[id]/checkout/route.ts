import { copyCheckoutSchema } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { authenticateCopySession } from "@/lib/copy-auth";
import { listCopyPages, submitCopySession } from "@/lib/copy-db";
import { createOrder, countDeviceQueue } from "@/lib/db";
import { calculateQuote } from "@/lib/pricing";
import { safeJson } from "@/lib/request";
import { createOpaqueToken, hashToken, requesterHash } from "@/lib/security";
import type { OrderRecord } from "@/lib/types";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authenticated = await authenticateCopySession(request, id);
  if (!authenticated) return Response.json({ message: "Сессия копирования не найдена" }, { status: 404 });
  const parsed = copyCheckoutSchema.safeParse(await safeJson(request));
  if (!parsed.success) return Response.json({ message: "Выберите количество копий" }, { status: 400 });
  if (authenticated.session.status !== "collecting" || new Date(authenticated.session.expiresAt).getTime() <= Date.now()) return Response.json({ message: "Время копирования истекло" }, { status: 409 });
  if (await countDeviceQueue(authenticated.session.deviceId) >= 5) return Response.json({ message: "Очередь занята. Попробуйте позже" }, { status: 429 });
  const pages = await listCopyPages(id);
  if (!pages.length || pages.some((page) => page.status !== "ready" || !page.pdfPathname)) return Response.json({ message: "Дождитесь завершения всех сканов" }, { status: 409 });

  const quote = calculateQuote(pages.length, parsed.data.copies);
  const orderId = crypto.randomUUID();
  const orderToken = createOpaqueToken();
  const now = new Date().toISOString();
  const order: OrderRecord = {
    id: orderId, deviceId: authenticated.session.deviceId, sessionHash: requesterHash(authenticated.token), statusTokenHash: hashToken(orderToken), status: "awaiting_payment", paymentStatus: "pending",
    copies: parsed.data.copies, colorMode: "bw", duplex: false, paperSize: "A4", selectedPageCount: pages.length, totalPriceMinor: quote.totalPriceMinor, currency: "TJS", printJobId: null,
    documents: pages.map((page, position) => ({ id: crypto.randomUUID(), orderId, blobPathname: page.pdfPathname, pageCount: 1, selectedPages: [1], position })),
    createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  await createOrder(order);
  if (!await submitCopySession(id, orderId)) return Response.json({ message: "Заказ уже создан" }, { status: 409 });
  return Response.json({ id: orderId, statusToken: orderToken, quote, documentCount: pages.length }, { status: 201 });
}
