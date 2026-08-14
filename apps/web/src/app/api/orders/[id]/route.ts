import { NextRequest } from "next/server";
import { getOrder, runExpiry } from "@/lib/db";
import { hashToken } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await runExpiry();
  const order = await getOrder(id);
  if (!order || hashToken(request.headers.get("x-order-token") ?? "") !== order.statusTokenHash) return Response.json({ message: "Заказ не найден" }, { status: 404 });
  return Response.json({
    id: order.id, deviceId: order.deviceId, status: order.status, paymentStatus: order.paymentStatus, documentCount: order.documents.length,
    selectedPageCount: order.selectedPageCount, copies: order.copies, totalSheets: order.selectedPageCount * order.copies,
    totalPriceMinor: order.totalPriceMinor, currency: order.currency, colorMode: order.colorMode, duplex: order.duplex, paperSize: order.paperSize,
    printJobId: order.printJobId, expiresAt: order.expiresAt,
  });
}
