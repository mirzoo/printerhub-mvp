import { MAX_FILE_SIZE } from "@printerhub/contracts";
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
  if (request.headers.get("content-type") !== "application/pdf") return new Response("Invalid content type", { status: 415 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_FILE_SIZE) return new Response("Too large", { status: 413 });
  try { await writeLocalUpload(pathname, new Uint8Array(await request.arrayBuffer())); return new Response(null, { status: 201 }); }
  catch { return new Response("Upload failed", { status: 400 }); }
}

export async function GET(request: NextRequest, context: { params: Promise<{ pathname: string }> }) {
  const { pathname } = await context.params;
  if (!authorized(request, pathname)) return new Response("Unauthorized", { status: 401 });
  try { return new Response(Buffer.from(await localDownload(pathname)), { headers: { "content-type": "application/pdf", "cache-control": "no-store" } }); }
  catch { return new Response("Not found", { status: 404 }); }
}
