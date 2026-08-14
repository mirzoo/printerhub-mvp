import { NextRequest } from "next/server";
import { z } from "zod";
import { calculateQuote } from "@/lib/pricing";
import { getSession, safeJson, unauthorized } from "@/lib/request";

export async function POST(request: NextRequest) {
  if (!getSession(request)) return unauthorized();
  const parsed = z.object({ selectedPages: z.number().int().min(1).max(100), copies: z.number().int().min(1).max(10) }).safeParse(await safeJson(request));
  if (!parsed.success) return Response.json({ message: "Проверьте страницы и количество копий" }, { status: 400 });
  return Response.json(calculateQuote(parsed.data.selectedPages, parsed.data.copies));
}
