import { NextRequest } from "next/server";
import { getJob, runExpiry } from "@/lib/db";
import { hashToken } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await runExpiry();
  const job = await getJob(id);
  if (!job || hashToken(request.headers.get("x-job-token") ?? "") !== job.statusTokenHash) return Response.json({ message: "Задание не найдено" }, { status: 404 });
  return Response.json({ id: job.id, status: job.status, pageCount: job.pageCount, copies: job.copies, totalPages: job.pageCount * job.copies, errorCode: job.errorCode, createdAt: job.createdAt, updatedAt: job.updatedAt });
}
