import { z } from "zod";

export const DEFAULT_DEVICE_ID = "printer-001";
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_PAGES = 100;
export const MAX_COPIES = 10;

export const deviceIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

export const printModeSchema = z.enum(["dry-run", "real"]);
export type PrintMode = z.infer<typeof printModeSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "claimed",
  "printing",
  "completed",
  "failed",
  "expired",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const terminalStatuses: ReadonlySet<JobStatus> = new Set([
  "completed",
  "failed",
  "expired",
]);

export const jobCreateSchema = z.object({
  deviceId: deviceIdSchema,
  pathname: z.string().uuid(),
  copies: z.number().int().min(1).max(MAX_COPIES),
});

export const heartbeatSchema = z.object({
  deviceId: deviceIdSchema,
  printMode: printModeSchema,
  printerState: z.enum(["idle", "processing", "stopped", "unavailable"]),
  printerStateReasons: z.array(z.string().max(120)).max(20),
});

export const agentUpdateSchema = z.object({
  status: z.enum(["printing", "completed", "failed"]),
  cupsJobId: z.string().max(120).optional(),
  errorCode: z.enum([
    "DOWNLOAD_FAILED",
    "INVALID_PDF",
    "PAGE_COUNT_MISMATCH",
    "PRINTER_UNAVAILABLE",
    "PRINT_COMMAND_FAILED",
    "PRINT_TIMEOUT",
    "PRINT_STATUS_UNKNOWN",
    "INTERNAL_ERROR",
  ]).optional(),
});

export const allowedTransitions: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["claimed", "expired"],
  claimed: ["printing", "failed", "expired"],
  printing: ["completed", "failed"],
  completed: [],
  failed: [],
  expired: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export type PublicJob = {
  id: string;
  status: JobStatus;
  pageCount: number;
  copies: number;
  totalPages: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClaimedJob = {
  id: string;
  deviceId: string;
  pageCount: number;
  copies: number;
  downloadUrl: string;
};
