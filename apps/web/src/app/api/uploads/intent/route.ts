import { DEVICE_ID, MAX_FILE_SIZE } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getDevice } from "@/lib/db";
import { deviceAvailable } from "@/lib/device";
import { getSession, safeJson, unauthorized } from "@/lib/request";
import { createUploadUrl } from "@/lib/storage";

export async function POST(request: NextRequest) {
  if (!getSession(request)) return unauthorized();
  const parsed = z.object({ deviceId: z.literal(DEVICE_ID), size: z.number().int().positive().max(MAX_FILE_SIZE) }).safeParse(await safeJson(request));
  if (!parsed.success) return Response.json({ message: "PDF не соответствует ограничениям" }, { status: 400 });
  if (!deviceAvailable(await getDevice(parsed.data.deviceId))) return Response.json({ message: "Принтер временно недоступен" }, { status: 409 });
  const pathname = crypto.randomUUID();
  return Response.json({ pathname, uploadUrl: await createUploadUrl(pathname, request.nextUrl.origin) });
}
