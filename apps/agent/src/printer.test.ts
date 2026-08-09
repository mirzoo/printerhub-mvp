import { describe, expect, it } from "vitest";
import { findOption } from "./printer.js";

describe("CUPS capability parsing", () => {
  it("uses an advertised A4 option", () => {
    expect(findOption("PageSize/Media Size: Letter *A4 A5", /(PageSize|media)/i, ["A4"])).toBe("PageSize=A4");
  });

  it("does not invent an unsupported option", () => {
    expect(findOption("PageSize/Media Size: *Letter A5", /(PageSize|media)/i, ["A4"])).toBeNull();
  });
});
