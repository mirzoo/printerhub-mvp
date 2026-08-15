import { NextRequest } from "next/server";
import { authenticateCopySession } from "@/lib/copy-auth";
import { createCopyPage } from "@/lib/copy-db";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authenticated = await authenticateCopySession(request, id);
  if (!authenticated) return Response.json({ message: "Сессия копирования не найдена" }, { status: 404 });
  if (authenticated.session.status !== "collecting" || new Date(authenticated.session.expiresAt).getTime() <= Date.now()) return Response.json({ message: "Время копирования истекло" }, { status: 409 });
  const page = await createCopyPage(id);
  if (!page) return Response.json({ message: "Дождитесь текущего сканирования или удалите лишнюю страницу" }, { status: 409 });
  return Response.json({ id: page.id, position: page.position, status: page.status }, { status: 201 });
}
