import { NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { createCopySession } from "@/lib/copy-db";
import { createOpaqueToken, hashToken } from "@/lib/security";
import type { CopySessionRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  const device = await authenticateAgent(request);
  if (!device) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (device.scannerState === "unavailable") return Response.json({ message: "Scanner unavailable" }, { status: 409 });
  const token = createOpaqueToken();
  const now = new Date().toISOString();
  const session: CopySessionRecord = {
    id: crypto.randomUUID(), deviceId: device.id, status: "collecting", statusTokenHash: hashToken(token), orderId: null,
    createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
  await createCopySession(session);
  return Response.json({ id: session.id, token, expiresAt: session.expiresAt }, { status: 201 });
}
