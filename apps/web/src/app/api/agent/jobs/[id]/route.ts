import { agentUpdateSchema } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { getJob, markCleaned, updateJob } from "@/lib/db";
import { safeJson } from "@/lib/request";
import { deleteUpload } from "@/lib/storage";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const device = await authenticateAgent(request);
  if (!device) return Response.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job || job.deviceId !== device.id) return Response.json({ message: "Not found" }, { status: 404 });
  const parsed = agentUpdateSchema.safeParse(await safeJson(request));
  if (!parsed.success) return Response.json({ message: "Invalid update" }, { status: 400 });
  const { status, cupsJobId, errorCode } = parsed.data;
  const expected = status === "printing" ? "claimed" : status === "completed" ? "printing" : job.status === "claimed" ? "claimed" : "printing";
  const updated = await updateJob(id, expected, status, { cupsJobId, errorCode, cleanupPending: status !== "printing" });
  if (!updated) return Response.json({ message: "Invalid state transition" }, { status: 409 });
  if (status !== "printing" && updated.blobPathname) {
    try { await deleteUpload(updated.blobPathname); await markCleaned(id); } catch { /* cleanup cron retries */ }
  }
  return Response.json({ ok: true, status });
}
