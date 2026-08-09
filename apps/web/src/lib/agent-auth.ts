import type { NextRequest } from "next/server";
import { getDevice } from "./db";
import { hashToken } from "./security";

export async function authenticateAgent(request: NextRequest) {
  const deviceId = request.headers.get("x-device-id") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const device = await getDevice(deviceId);
  if (!device || !token) return null;
  if (!process.env.DATABASE_URL && token === (process.env.LOCAL_DEVICE_TOKEN ?? "dev-device-token")) return device;
  return hashToken(token) === device.tokenHash ? device : null;
}
