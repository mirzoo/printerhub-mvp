import { NextRequest } from "next/server";
import { hasBlobReference } from "@/lib/db";
import { getSession, unauthorized } from "@/lib/request";
import { deleteUpload } from "@/lib/storage";
import { copyHasBlobReference } from "@/lib/copy-db";

export async function DELETE(request: NextRequest, context: { params: Promise<{ pathname: string }> }) {
  if (!getSession(request)) return unauthorized();
  const { pathname } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(pathname)) return Response.json({ message: "Файл не найден" }, { status: 404 });
  if (await hasBlobReference(pathname) || await copyHasBlobReference(pathname)) return Response.json({ message: "Документ уже используется в заказе" }, { status: 409 });
  await deleteUpload(pathname).catch(() => undefined);
  return new Response(null, { status: 204 });
}
