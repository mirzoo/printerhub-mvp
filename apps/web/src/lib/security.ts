import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config";

export const SESSION_COOKIE = "printerhub_session";

export type Session = { id: string; exp: number };

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function requesterHash(value: string): string {
  return createHmac("sha256", config.requestHashSecret).update(value).digest("hex");
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createOrderJobToken(orderId: string): string {
  return createHmac("sha256", config.sessionSecret).update(`order-job:${orderId}`).digest("base64url");
}

export function createSession(): { value: string; session: Session } {
  const session = { id: createOpaqueToken(18), exp: Date.now() + 30 * 60_000 };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, session };
}

export function readSession(value: string | undefined): Session | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    return typeof session.id === "string" && session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function verifyPin(candidate: string): boolean {
  if (!config.kioskPin) return false;
  const salt = createHash("sha256").update(config.sessionSecret).digest().subarray(0, 16);
  const actual = scryptSync(candidate, salt, 32);
  const expected = scryptSync(config.kioskPin, salt, 32);
  return timingSafeEqual(actual, expected);
}

export function signUpload(pathname: string, expiresAt: number): string {
  const payload = `${pathname}.${expiresAt}`;
  return `${expiresAt}.${sign(payload)}`;
}

export function verifyUpload(pathname: string, token: string): boolean {
  const [expiresAtRaw, signature] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  return Number.isFinite(expiresAt) && expiresAt > Date.now() && safeEqual(signature ?? "", sign(`${pathname}.${expiresAt}`));
}

function sign(value: string): string {
  return createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
