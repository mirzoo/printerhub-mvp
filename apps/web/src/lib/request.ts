import type { NextRequest } from "next/server";
import { readSession, requesterHash, SESSION_COOKIE } from "./security";

export function getSession(request: NextRequest) {
  return readSession(request.cookies.get(SESSION_COOKIE)?.value);
}

export function getRequesterHash(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return requesterHash(forwarded || request.headers.get("x-real-ip") || "unknown");
}

export function unauthorized() {
  return Response.json({ message: "Требуется PIN точки печати" }, { status: 401 });
}

export async function safeJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}
