import { describe, expect, it } from "vitest";
import { canTransition, deviceIdSchema, jobCreateSchema } from "./index.js";

describe("job contracts", () => {
  it("allows only state-machine transitions", () => {
    expect(canTransition("queued", "claimed")).toBe(true);
    expect(canTransition("printing", "claimed")).toBe(false);
  });

  it("rejects arbitrary print settings", () => {
    expect(jobCreateSchema.safeParse({ deviceId: "printer-001", pathname: crypto.randomUUID(), copies: 11 }).success).toBe(false);
  });

  it("accepts stable printer slugs and rejects unsafe identifiers", () => {
    expect(deviceIdSchema.safeParse("printer-001").success).toBe(true);
    expect(deviceIdSchema.safeParse("PRINTER-001").success).toBe(false);
    expect(deviceIdSchema.safeParse("../printer-001").success).toBe(false);
  });
});
