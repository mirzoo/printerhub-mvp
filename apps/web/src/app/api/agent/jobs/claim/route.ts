import { NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { claimJob, runExpiry } from "@/lib/db";
import { createDownloadUrl } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const device = await authenticateAgent(request);
  if (!device) return Response.json({ message: "Unauthorized" }, { status: 401 });
  await runExpiry();
  const job = await claimJob(device.id);
  if (!job?.blobPathname) return new Response(null, { status: 204 });
  return Response.json({ id: job.id, deviceId: job.deviceId, pageCount: job.pageCount, copies: job.copies, downloadUrl: await createDownloadUrl(job.blobPathname, request.nextUrl.origin) });
}
