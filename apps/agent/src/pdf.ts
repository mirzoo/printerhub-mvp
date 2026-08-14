import { MAX_FILE_SIZE, MAX_PAGES } from "@printerhub/contracts";
import { readFile } from "node:fs/promises";
import { command } from "./command.js";

export async function validatePdfFile(filePath: string, pdfinfoPath: string): Promise<number> {
  const bytes = await readFile(filePath);
  if (bytes.length < 8 || bytes.length > MAX_FILE_SIZE || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("INVALID_PDF");
  let result;
  try {
    result = await command(pdfinfoPath, [filePath], 20_000);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("PDFINFO_UNAVAILABLE");
    throw error;
  }
  if (result.code !== 0) throw new Error("INVALID_PDF");
  const pages = Number(result.stdout.match(/^Pages:\s+(\d+)$/m)?.[1]);
  if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) throw new Error("INVALID_PDF");
  return pages;
}
