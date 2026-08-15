import { NextRequest } from "next/server";
import { authenticateCopySession } from "@/lib/copy-auth";
import { cancelCopySession, expireCopySessions, listCopyPages } from "@/lib/copy-db";
import { deleteUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await expireCopySessions();
  const authenticated = await authenticateCopySession(request, id);
  if (!authenticated) return Response.json({ message: "Сессия копирования не найдена" }, { status: 404 });
  const pages = await listCopyPages(id);
  return Response.json({
    id, deviceId: authenticated.session.deviceId, status: authenticated.session.status, orderId: authenticated.session.orderId, expiresAt: authenticated.session.expiresAt,
    pages: pages.map((page) => ({ id: page.id, position: page.position, status: page.status, errorCode: page.errorCode, hasPreview: Boolean(page.previewPathname) })),
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authenticated = await authenticateCopySession(request, id);
  if (!authenticated) return Response.json({ message: "Сессия копирования не найдена" }, { status: 404 });
  if (!await cancelCopySession(id)) return Response.json({ message: "Копирование уже завершено" }, { status: 409 });
  for (const page of await listCopyPages(id, true)) {
    if (page.previewPathname) await deleteUpload(page.previewPathname).catch(() => undefined);
    if (page.pdfPathname) await deleteUpload(page.pdfPathname).catch(() => undefined);
  }
  return new Response(null, { status: 204 });
}
