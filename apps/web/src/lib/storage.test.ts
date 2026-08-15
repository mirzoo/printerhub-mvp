import { issueSignedToken, presignUrl } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUploadUrl } from "./storage";

vi.mock("@vercel/blob", () => ({
  del: vi.fn(),
  get: vi.fn(),
  issueSignedToken: vi.fn(),
  list: vi.fn(),
  presignUrl: vi.fn(),
  put: vi.fn(),
}));

vi.mock("./config", () => ({ config: { storageDriver: "blob" } }));
vi.mock("./security", () => ({ signUpload: vi.fn() }));

describe("Blob upload URLs", () => {
  beforeEach(() => {
    vi.mocked(issueSignedToken).mockReset().mockResolvedValue({ delegationToken: "delegation-token", clientSigningToken: "client-signing-token", validUntil: Date.now() + 60_000 });
    vi.mocked(presignUrl).mockReset().mockResolvedValue({ presignedUrl: "https://blob.example/upload" });
  });

  it("preserves the requested pathname", async () => {
    const pathname = "4d7f7276-0709-487a-bf13-8cf352b12ed1";

    await expect(createUploadUrl(pathname, "https://printerhub.example")).resolves.toBe("https://blob.example/upload");
    expect(issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({ pathname }));
    expect(presignUrl).toHaveBeenCalledWith(expect.objectContaining({ delegationToken: "delegation-token" }), expect.objectContaining({ pathname, addRandomSuffix: false }));
  });
});
