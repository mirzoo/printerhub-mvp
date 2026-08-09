import { describe, expect, it } from "vitest";
import { canTransition, jobCreateSchema } from "./index.js";

describe("job contracts", () => {
  it("allows only state-machine transitions", () => {
    expect(canTransition("queued", "claimed")).toBe(true);
    expect(canTransition("printing", "claimed")).toBe(false);
  });

  it("rejects arbitrary print settings", () => {
    expect(jobCreateSchema.safeParse({ deviceId: "printer-001", pathname: crypto.randomUUID(), copies: 11 }).success).toBe(false);
  });
});
