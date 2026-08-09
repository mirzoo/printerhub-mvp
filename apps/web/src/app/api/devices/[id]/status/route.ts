import { getDevice } from "@/lib/db";
import { deviceAvailable } from "@/lib/device";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const device = await getDevice(id);
  return Response.json({ deviceId: id, available: deviceAvailable(device), printMode: device?.printMode ?? null, lastSeen: device?.lastSeen ?? null });
}
