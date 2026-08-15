import { NextRequest } from "next/server";
import { authenticateCopySession } from "@/lib/copy-auth";
import { deleteCopyPageRecord, getCopyPage, retryCopyPage } from "@/lib/copy-db";
import { deleteUpload } from "@/lib/storage";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await context.params;
  if (!await authenticateCopySession(request, id)) return Response.json({ message: "Сессия копирования не найдена" }, { status: 404 });
  const page = await getCopyPage(pageId);
  if (!page || page.sessionId !== id) return Response.json({ message: "Страница не найдена" }, { status: 404 });
  const deleted = await deleteCopyPageRecord(pageId);
  if (!deleted) return Response.json({ message: "Дождитесь завершения сканирования" }, { status: 409 });
  if (deleted.previewPathname) await deleteUpload(deleted.previewPathname).catch(() => undefined);
  if (deleted.pdfPathname) await deleteUpload(deleted.pdfPathname).catch(() => undefined);
  return new Response(null, { status: 204 });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await context.params;
  if (!await authenticateCopySession(request, id)) return Response.json({ message: "Сессия копирования не найдена" }, { status: 404 });
  const current = await getCopyPage(pageId);
  if (!current || current.sessionId !== id) return Response.json({ message: "Страница не найдена" }, { status: 404 });
  if (current.previewPathname) await deleteUpload(current.previewPathname).catch(() => undefined);
  if (current.pdfPathname) await deleteUpload(current.pdfPathname).catch(() => undefined);
  const page = await retryCopyPage(pageId, crypto.randomUUID());
  if (!page) return Response.json({ message: "Страницу нельзя пересканировать сейчас" }, { status: 409 });
  return Response.json({ id: page.id, position: page.position, status: page.status });
}
