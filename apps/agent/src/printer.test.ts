import { describe, expect, it, vi } from "vitest";
import { command } from "./command.js";
import { findOption, waitForPrint } from "./printer.js";

vi.mock("./command.js", () => ({ command: vi.fn() }));

describe("CUPS capability parsing", () => {
  it("uses an advertised A4 option", () => {
    expect(findOption("PageSize/Media Size: Letter *A4 A5", /(PageSize|media)/i, ["A4"])).toBe("PageSize=A4");
  });

  it("does not invent an unsupported option", () => {
    expect(findOption("PageSize/Media Size: *Letter A5", /(PageSize|media)/i, ["A4"])).toBeNull();
  });
});

describe("CUPS job tracking", () => {
  it("checks the printer queue and completes when the job is absent", async () => {
    vi.mocked(command).mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });

    await expect(waitForPrint("Brother_DCP_1600_series", "Brother_DCP_1600_series-1")).resolves.toBeUndefined();
    expect(command).toHaveBeenCalledWith("lpstat", ["-W", "not-completed", "-o", "Brother_DCP_1600_series"], 10_000);
  });
});
