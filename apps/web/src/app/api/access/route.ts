import { NextRequest } from "next/server";
import { z } from "zod";
import { failedAccessCount, recordAccessAttempt } from "@/lib/db";
import { getRequesterHash, getSession, safeJson } from "@/lib/request";
import { createSession, SESSION_COOKIE, verifyPin } from "@/lib/security";
import { assertRuntimeConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  return getSession(request) ? Response.json({ authenticated: true }) : Response.json({ authenticated: false }, { status: 401 });
}

export async function POST(request: NextRequest) {
  assertRuntimeConfig();
  const requester = getRequesterHash(request);
  if (await failedAccessCount(requester) >= 5) return Response.json({ message: "Слишком много попыток. Повторите через 15 минут" }, { status: 429 });
  const parsed = z.object({ pin: z.string().min(6).max(32) }).safeParse(await safeJson(request));
  const valid = parsed.success && verifyPin(parsed.data.pin);
  await recordAccessAttempt(requester, valid);
  if (!valid) return Response.json({ message: "Неверный ПИН‑код" }, { status: 401 });
  const { value, session } = createSession();
  const response = Response.json({ authenticated: true });
  response.headers.append("set-cookie", `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((session.exp - Date.now()) / 1000)}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
