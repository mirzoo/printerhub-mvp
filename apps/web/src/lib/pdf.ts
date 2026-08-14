import { MAX_FILE_SIZE, MAX_PAGES } from "@printerhub/contracts";
import { PDFDocument } from "pdf-lib";

export async function validatePdf(bytes: Uint8Array): Promise<number> {
  if (bytes.length < 8 || bytes.length > MAX_FILE_SIZE) throw new Error("INVALID_SIZE");
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new Error("INVALID_MAGIC");
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  const pages = document.getPageCount();
  if (pages < 1 || pages > MAX_PAGES) throw new Error("INVALID_PAGE_COUNT");
  return pages;
}

export async function mergePdfPages(documents: Array<{ bytes: Uint8Array; selectedPages: number[] }>): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const input of documents) {
    const source = await PDFDocument.load(input.bytes, { ignoreEncryption: false, updateMetadata: false });
    const indexes = input.selectedPages.map((page) => page - 1);
    if (indexes.some((index) => index < 0 || index >= source.getPageCount())) throw new Error("INVALID_SELECTED_PAGE");
    const pages = await merged.copyPages(source, indexes);
    pages.forEach((page) => merged.addPage(page));
  }
  if (merged.getPageCount() < 1 || merged.getPageCount() > MAX_PAGES) throw new Error("INVALID_PAGE_COUNT");
  const bytes = await merged.save({ useObjectStreams: true });
  if (bytes.length > MAX_FILE_SIZE) throw new Error("INVALID_SIZE");
  return bytes;
}
