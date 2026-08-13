import { deviceIdSchema } from "@printerhub/contracts";
import { getDevice } from "@/lib/db";
import { deviceAvailable } from "@/lib/device";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = deviceIdSchema.safeParse(id.toLowerCase());
  if (!parsed.success) return Response.json({ message: "Некорректный номер аппарата" }, { status: 400 });
  const device = await getDevice(parsed.data);
  if (!device) return Response.json({ deviceId: parsed.data, message: "Аппарат не найден" }, { status: 404 });
  return Response.json({ deviceId: parsed.data, available: deviceAvailable(device), printMode: device.printMode, lastSeen: device.lastSeen });
}
