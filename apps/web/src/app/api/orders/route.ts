import { orderCreateSchema } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { countSessionOrders, createOrder, getDevice } from "@/lib/db";
import { deviceAvailable } from "@/lib/device";
import { validatePdf } from "@/lib/pdf";
import { calculateQuote } from "@/lib/pricing";
import { getSession, safeJson, unauthorized } from "@/lib/request";
import { createOpaqueToken, hashToken, requesterHash } from "@/lib/security";
import { readUpload } from "@/lib/storage";
import type { OrderRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return unauthorized();
  const parsed = orderCreateSchema.safeParse(await safeJson(request));
  if (!parsed.success) return Response.json({ message: "Проверьте документы и параметры печати" }, { status: 400 });
  if (!deviceAvailable(await getDevice(parsed.data.deviceId))) return Response.json({ message: "Аппарат временно недоступен" }, { status: 409 });
  const sessionHash = requesterHash(session.id);
  const limits = await countSessionOrders(sessionHash);
  if (limits.active >= 1 || limits.recent >= 3) return Response.json({ message: "У вас уже есть заказ на оплату" }, { status: 429 });

  const validated: Array<{ pathname: string; pageCount: number; selectedPages: number[] }> = [];
  try {
    for (const document of parsed.data.documents) {
      const pageCount = await validatePdf(await readUpload(document.pathname));
      if (document.selectedPages.some((page) => page > pageCount)) throw new Error("INVALID_SELECTED_PAGE");
      validated.push({ pathname: document.pathname, pageCount, selectedPages: [...document.selectedPages].sort((a, b) => a - b) });
    }
  } catch {
    return Response.json({ message: "Один из PDF повреждён, защищён паролем или изменился после загрузки" }, { status: 400 });
  }

  const selectedPageCount = validated.reduce((total, document) => total + document.selectedPages.length, 0);
  if (selectedPageCount > 100) return Response.json({ message: "Для одного заказа можно выбрать не более 100 страниц" }, { status: 400 });
  const quote = calculateQuote(selectedPageCount, parsed.data.copies);
  const id = crypto.randomUUID();
  const statusToken = createOpaqueToken();
  const now = new Date().toISOString();
  const order: OrderRecord = {
    id, deviceId: parsed.data.deviceId, sessionHash, statusTokenHash: hashToken(statusToken), status: "awaiting_payment", paymentStatus: "pending",
    copies: parsed.data.copies, colorMode: "bw", duplex: false, paperSize: "A4", selectedPageCount, totalPriceMinor: quote.totalPriceMinor, currency: "TJS", printJobId: null,
    documents: validated.map((document, position) => ({ id: crypto.randomUUID(), orderId: id, blobPathname: document.pathname, pageCount: document.pageCount, selectedPages: document.selectedPages, position })),
    createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  await createOrder(order);
  return Response.json({ id, statusToken, quote, documentCount: order.documents.length }, { status: 201 });
}
