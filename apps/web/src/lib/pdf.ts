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
