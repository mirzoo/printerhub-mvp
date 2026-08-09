import type { DeviceRecord } from "./types";

export function deviceAvailable(device: DeviceRecord | null): boolean {
  if (!device?.lastSeen || Date.now() - new Date(device.lastSeen).getTime() > 45_000) return false;
  if (device.printMode === "dry-run") return true;
  return device.printMode === "real" && ["idle", "processing"].includes(device.printerState) && !device.printerStateReasons.some(isBlockingReason);
}

function isBlockingReason(reason: string) {
  return /(offline|paused|stopped|jam|toner-empty|media-empty|cover-open|not-connected)/i.test(reason);
}
