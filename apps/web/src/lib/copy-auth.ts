import type { NextRequest } from "next/server";
import { getCopySession } from "./copy-db";
import { hashToken } from "./security";

export async function authenticateCopySession(request: NextRequest, id: string) {
  const session = await getCopySession(id);
  const token = request.headers.get("x-copy-token") ?? "";
  if (!session || !token || hashToken(token) !== session.statusTokenHash) return null;
  return { session, token };
}
