import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { mergePdfPages, validatePdf } from "./pdf";

describe("PDF validation", () => {
  it("counts pages from a valid PDF", async () => {
    const document = await PDFDocument.create(); document.addPage(); document.addPage();
    await expect(validatePdf(await document.save())).resolves.toBe(2);
  });
  it("rejects extension-only content", async () => await expect(validatePdf(Buffer.from("not a pdf"))).rejects.toThrow("INVALID_MAGIC"));
  it("rejects more than 100 pages", async () => {
    const document = await PDFDocument.create(); for (let index = 0; index < 101; index += 1) document.addPage();
    await expect(validatePdf(await document.save())).rejects.toThrow("INVALID_PAGE_COUNT");
  });
  it("merges selected pages from multiple documents in order", async () => {
    const first = await PDFDocument.create(); first.addPage(); first.addPage();
    const second = await PDFDocument.create(); second.addPage();
    const merged = await mergePdfPages([
      { bytes: await first.save(), selectedPages: [2] },
      { bytes: await second.save(), selectedPages: [1] },
    ]);
    await expect(validatePdf(merged)).resolves.toBe(2);
  });
});
