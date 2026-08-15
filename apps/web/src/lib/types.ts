import type { CopyPageStatus, CopySessionStatus, JobStatus, OrderStatus, PaymentStatus, PrintMode, ScanError } from "@printerhub/contracts";

export type DeviceRecord = {
  id: string;
  tokenHash: string;
  cupsQueue: string;
  lastSeen: string | null;
  printMode: PrintMode | null;
  printerState: "idle" | "processing" | "stopped" | "unavailable";
  printerStateReasons: string[];
  scannerState: "idle" | "busy" | "unavailable";
  scannerStateReason: string | null;
};

export type CopySessionRecord = {
  id: string;
  deviceId: string;
  status: CopySessionStatus;
  statusTokenHash: string;
  orderId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type CopyPageRecord = {
  id: string;
  sessionId: string;
  position: number;
  status: CopyPageStatus;
  previewPathname: string | null;
  pdfPathname: string | null;
  errorCode: ScanError | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  orderId?: string | null;
};

export type OrderDocumentRecord = {
  id: string;
  orderId: string;
  blobPathname: string | null;
  pageCount: number;
  selectedPages: number[];
  position: number;
};

export type OrderRecord = {
  id: string;
  deviceId: string;
  sessionHash: string;
  statusTokenHash: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  copies: number;
  colorMode: "bw";
  duplex: false;
  paperSize: "A4";
  selectedPageCount: number;
  totalPriceMinor: number;
  currency: "TJS";
  printJobId: string | null;
  documents: OrderDocumentRecord[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
