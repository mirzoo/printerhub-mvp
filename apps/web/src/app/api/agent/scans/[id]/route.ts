import { scanErrorSchema } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { completeCopyPage, failCopyPage, getCopyPage, getCopySession } from "@/lib/copy-db";
import { scanJpegToA4Pdf } from "@/lib/pdf";
import { safeJson } from "@/lib/request";
import { deleteUpload, readUpload, writeUpload } from "@/lib/storage";

const updateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready") }),
  z.object({ status: z.literal("failed"), errorCode: scanErrorSchema }),
]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const device = await authenticateAgent(request);
  if (!device) return Response.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const page = await getCopyPage(id);
  const session = page ? await getCopySession(page.sessionId) : null;
  if (!page || !session || session.deviceId !== device.id) return Response.json({ message: "Not found" }, { status: 404 });
  const parsed = updateSchema.safeParse(await safeJson(request));
  if (!parsed.success) return Response.json({ message: "Invalid update" }, { status: 400 });
  if (parsed.data.status === "failed") {
    const updated = await failCopyPage(id, parsed.data.errorCode);
    return updated ? Response.json({ ok: true, status: updated.status }) : Response.json({ message: "Invalid state transition" }, { status: 409 });
  }
  if (!page.previewPathname) return Response.json({ message: "Scan upload missing" }, { status: 409 });
  const pdfPathname = crypto.randomUUID();
  try {
    const jpeg = await readUpload(page.previewPathname);
    await writeUpload(pdfPathname, await scanJpegToA4Pdf(jpeg));
    const updated = await completeCopyPage(id, pdfPathname);
    if (!updated) { await deleteUpload(pdfPathname).catch(() => undefined); return Response.json({ message: "Invalid state transition" }, { status: 409 }); }
    return Response.json({ ok: true, status: updated.status });
  } catch {
    await deleteUpload(pdfPathname).catch(() => undefined);
    await deleteUpload(page.previewPathname).catch(() => undefined);
    await failCopyPage(id, "INVALID_SCAN");
    return Response.json({ message: "Invalid scan" }, { status: 400 });
  }
}
