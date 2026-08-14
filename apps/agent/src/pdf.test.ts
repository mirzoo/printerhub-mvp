import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validatePdfFile } from "./pdf.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("PDF validation", () => {
  it("reports when pdfinfo is unavailable", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "printerhub-pdf-test-"));
    directories.push(directory);
    const filePath = path.join(directory, "document.pdf");
    await writeFile(filePath, "%PDF-1.4\n%%EOF\n");

    await expect(validatePdfFile(filePath, path.join(directory, "missing-pdfinfo"))).rejects.toThrow("PDFINFO_UNAVAILABLE");
  });
});
