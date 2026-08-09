import type { JobStatus, PrintMode } from "@printerhub/contracts";

export type DeviceRecord = {
  id: string;
  tokenHash: string;
  cupsQueue: string;
  lastSeen: string | null;
  printMode: PrintMode | null;
  printerState: "idle" | "processing" | "stopped" | "unavailable";
  printerStateReasons: string[];
};

export type JobRecord = {
  id: string;
  deviceId: string;
  status: JobStatus;
  pageCount: number;
  copies: number;
  blobPathname: string | null;
  statusTokenHash: string;
  sessionHash: string;
  cupsJobId: string | null;
  errorCode: string | null;
  leaseExpiresAt: string | null;
  cleanupPending: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
