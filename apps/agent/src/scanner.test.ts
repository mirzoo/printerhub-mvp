import { access } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "./command.js";
import { inspectScanner, scanToJpeg } from "./scanner.js";

vi.mock("node:fs/promises", () => ({ access: vi.fn() }));
vi.mock("./command.js", () => ({ command: vi.fn() }));
vi.mock("./config.js", () => ({ config: { scannerHelperPath: "/opt/printerhub-scan", scannerName: "Brother" } }));

describe("scanner helper", () => {
  beforeEach(() => { vi.mocked(access).mockReset().mockResolvedValue(); vi.mocked(command).mockReset(); });

  it("reports an available configured scanner", async () => {
    vi.mocked(command).mockResolvedValue({ stdout: '{"ok":true,"code":"OK"}\n', stderr: "", code: 0 });
    await expect(inspectScanner()).resolves.toEqual({ scannerState: "idle", scannerStateReason: null });
    expect(command).toHaveBeenCalledWith("/opt/printerhub-scan", ["--probe", "--scanner", "Brother"], 15_000);
  });

  it("normalizes helper timeouts", async () => {
    vi.mocked(command).mockRejectedValue(new Error("scanner timed out"));
    await expect(scanToJpeg("/tmp/page.jpg")).rejects.toThrow("SCAN_TIMEOUT");
  });
});
