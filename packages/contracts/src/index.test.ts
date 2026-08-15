import { describe, expect, it } from "vitest";
import { canTransition, copyCheckoutSchema, deviceIdSchema, jobCreateSchema, orderCreateSchema } from "./index.js";

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

  it("accepts multiple unique documents with selected pages", () => {
    expect(orderCreateSchema.safeParse({
      deviceId: "printer-001",
      documents: [
        { pathname: crypto.randomUUID(), selectedPages: [1, 3] },
        { pathname: crypto.randomUUID(), selectedPages: [1] },
      ],
      copies: 2,
      colorMode: "bw",
      duplex: false,
      paperSize: "A4",
    }).success).toBe(true);
  });

  it("limits copy checkout to supported copy counts", () => {
    expect(copyCheckoutSchema.safeParse({ copies: 10 }).success).toBe(true);
    expect(copyCheckoutSchema.safeParse({ copies: 11 }).success).toBe(false);
  });
});
