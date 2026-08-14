import { CURRENCY, PRICE_PER_BW_PAGE_MINOR, type Quote } from "@printerhub/contracts";

export function calculateQuote(selectedPages: number, copies: number): Quote {
  if (!Number.isInteger(selectedPages) || selectedPages < 1 || selectedPages > 100) throw new Error("INVALID_PAGE_COUNT");
  if (!Number.isInteger(copies) || copies < 1 || copies > 10) throw new Error("INVALID_COPIES");
  const totalSheets = selectedPages * copies;
  return {
    selectedPages,
    copies,
    totalSheets,
    unitPriceMinor: PRICE_PER_BW_PAGE_MINOR,
    totalPriceMinor: totalSheets * PRICE_PER_BW_PAGE_MINOR,
    currency: CURRENCY,
  };
}
