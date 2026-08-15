import { MAX_FILE_SIZE, MAX_PAGES, MAX_SCAN_PAGE_SIZE } from "@printerhub/contracts";
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

export async function scanJpegToA4Pdf(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 4 || bytes.length > MAX_SCAN_PAGE_SIZE || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("INVALID_SCAN");
  const document = await PDFDocument.create();
  let image;
  try { image = await document.embedJpg(bytes); } catch { throw new Error("INVALID_SCAN"); }
  if (image.width < 300 || image.height < 300 || image.width > 12_000 || image.height > 12_000) throw new Error("INVALID_SCAN");
  const page = document.addPage([595.28, 841.89]);
  const scale = Math.min(page.getWidth() / image.width, page.getHeight() / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  const pdf = await document.save({ useObjectStreams: true });
  if (pdf.length > MAX_FILE_SIZE) throw new Error("INVALID_SCAN");
  return pdf;
}
