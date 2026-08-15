import { describe, expect, it } from "vitest";
import { claimCopyPage, completeCopyPage, createCopyPage, createCopySession, failCopyPage, getCopyPage, retryCopyPage } from "./copy-db";
import type { CopySessionRecord } from "./types";

describe("copy queue", () => {
  it("claims scan pages only for their device and preserves retry state", async () => {
    const now = new Date().toISOString();
    const session: CopySessionRecord = {
      id: crypto.randomUUID(), deviceId: "printer-001", status: "collecting", statusTokenHash: "hash", orderId: null,
      createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await createCopySession(session);
    const page = await createCopyPage(session.id);
    expect(page?.status).toBe("queued");
    await expect(createCopyPage(session.id)).resolves.toBeNull();
    await expect(claimCopyPage("printer-002")).resolves.toBeNull();
    const claimed = await claimCopyPage("printer-001");
    expect(claimed?.id).toBe(page?.id);
    await expect(failCopyPage(claimed!.id, "SCAN_FAILED")).resolves.toMatchObject({ status: "failed", errorCode: "SCAN_FAILED" });
    await expect(retryCopyPage(claimed!.id, crypto.randomUUID())).resolves.toMatchObject({ status: "queued", errorCode: null });
    await claimCopyPage("printer-001");
    await expect(completeCopyPage(claimed!.id, crypto.randomUUID())).resolves.toMatchObject({ status: "ready" });
    await expect(getCopyPage(claimed!.id)).resolves.toMatchObject({ status: "ready" });
  });
});
