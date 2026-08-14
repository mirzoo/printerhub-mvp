import { describe, expect, it } from "vitest";
import { calculateQuote } from "./pricing";

describe("calculateQuote", () => {
  it("calculates price on the server from selected pages and copies", () => {
    expect(calculateQuote(5, 2)).toEqual({ selectedPages: 5, copies: 2, totalSheets: 10, unitPriceMinor: 100, totalPriceMinor: 1000, currency: "TJS" });
  });
  it("rejects invalid inputs", () => {
    expect(() => calculateQuote(0, 1)).toThrow("INVALID_PAGE_COUNT");
    expect(() => calculateQuote(1, 11)).toThrow("INVALID_COPIES");
  });
});
