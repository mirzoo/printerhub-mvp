import { NextRequest } from "next/server";
import { authenticateCopySession } from "@/lib/copy-auth";
import { getCopyPage } from "@/lib/copy-db";
import { readUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await context.params;
  if (!await authenticateCopySession(request, id)) return new Response("Not found", { status: 404 });
  const page = await getCopyPage(pageId);
  if (!page || page.sessionId !== id || page.status !== "ready" || !page.previewPathname) return new Response("Not found", { status: 404 });
  try { return new Response(Buffer.from(await readUpload(page.previewPathname)), { headers: { "content-type": "image/jpeg", "cache-control": "private, no-store", "content-disposition": "inline" } }); }
  catch { return new Response("Not found", { status: 404 }); }
}
