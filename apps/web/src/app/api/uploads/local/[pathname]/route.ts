import { MAX_FILE_SIZE, MAX_SCAN_PAGE_SIZE } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { verifyUpload } from "@/lib/security";
import { localDownload, writeLocalUpload } from "@/lib/storage";

function authorized(request: NextRequest, pathname: string) {
  return config.storageDriver === "local" && verifyUpload(pathname, request.nextUrl.searchParams.get("token") ?? "");
}

export async function PUT(request: NextRequest, context: { params: Promise<{ pathname: string }> }) {
  const { pathname } = await context.params;
  if (!authorized(request, pathname)) return new Response("Unauthorized", { status: 401 });
  const scan = request.nextUrl.searchParams.get("kind") === "scan";
  if (request.headers.get("content-type") !== (scan ? "image/jpeg" : "application/pdf")) return new Response("Invalid content type", { status: 415 });
  const length = Number(request.headers.get("content-length") ?? 0);
  const limit = scan ? MAX_SCAN_PAGE_SIZE : MAX_FILE_SIZE;
  if (length > limit) return new Response("Too large", { status: 413 });
  try { await writeLocalUpload(pathname, new Uint8Array(await request.arrayBuffer()), limit, scan); return new Response(null, { status: 201 }); }
  catch { return new Response("Upload failed", { status: 400 }); }
}

export async function GET(request: NextRequest, context: { params: Promise<{ pathname: string }> }) {
  const { pathname } = await context.params;
  if (!authorized(request, pathname)) return new Response("Unauthorized", { status: 401 });
  const scan = request.nextUrl.searchParams.get("kind") === "scan";
  try { return new Response(Buffer.from(await localDownload(pathname)), { headers: { "content-type": scan ? "image/jpeg" : "application/pdf", "cache-control": "no-store" } }); }
  catch { return new Response("Not found", { status: 404 }); }
}
