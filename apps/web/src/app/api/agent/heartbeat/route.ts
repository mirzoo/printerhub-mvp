import { heartbeatSchema } from "@printerhub/contracts";
import { NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { heartbeatDevice } from "@/lib/db";
import { safeJson } from "@/lib/request";

export async function POST(request: NextRequest) {
  const device = await authenticateAgent(request);
  if (!device) return Response.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = heartbeatSchema.safeParse(await safeJson(request));
  if (!parsed.success || parsed.data.deviceId !== device.id) return Response.json({ message: "Invalid heartbeat" }, { status: 400 });
  await heartbeatDevice({ ...device, printMode: parsed.data.printMode, printerState: parsed.data.printerState, printerStateReasons: parsed.data.printerStateReasons });
  return Response.json({ ok: true });
}
