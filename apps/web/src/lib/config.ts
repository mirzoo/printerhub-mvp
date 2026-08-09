export const config = {
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET ?? "local-session-secret-change-me",
  requestHashSecret: process.env.REQUEST_HASH_SECRET ?? "local-request-hash-secret-change-me",
  kioskPin: process.env.KIOSK_PIN ?? (process.env.NODE_ENV === "production" ? "" : "123456"),
  cronSecret: process.env.CRON_SECRET ?? "",
  storageDriver: process.env.STORAGE_DRIVER ?? (process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local"),
};

export function assertRuntimeConfig() {
  if (process.env.NODE_ENV !== "production") return;
  for (const name of ["SESSION_SECRET", "REQUEST_HASH_SECRET", "KIOSK_PIN", "DATABASE_URL"]) {
    if (!process.env[name]) throw new Error(`${name} is required`);
  }
}
