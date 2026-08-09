import { describe, expect, it, vi } from "vitest";
import { deviceAvailable } from "./device";
import type { DeviceRecord } from "./types";

const device: DeviceRecord = { id: "printer-001", tokenHash: "", cupsQueue: "queue", lastSeen: new Date().toISOString(), printMode: "dry-run", printerState: "idle", printerStateReasons: [] };

describe("device availability", () => {
  it("accepts a recent dry-run heartbeat", () => expect(deviceAvailable(device)).toBe(true));
  it("rejects a blocking real printer reason", () => expect(deviceAvailable({ ...device, printMode: "real", printerStateReasons: ["toner-empty"] })).toBe(false));
  it("rejects stale heartbeats", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    expect(deviceAvailable({ ...device, lastSeen: "2026-01-01T00:00:00Z" })).toBe(false);
    vi.useRealTimers();
  });
});
