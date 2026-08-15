import { NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { claimCopyPage, expireCopySessions } from "@/lib/copy-db";
import { createScanUploadUrl } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const device = await authenticateAgent(request);
  if (!device) return Response.json({ message: "Unauthorized" }, { status: 401 });
  await expireCopySessions();
  const page = await claimCopyPage(device.id);
  if (!page?.previewPathname) return new Response(null, { status: 204 });
  return Response.json({ id: page.id, sessionId: page.sessionId, deviceId: device.id, uploadUrl: await createScanUploadUrl(page.previewPathname, request.nextUrl.origin) });
}
