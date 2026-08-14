import { del, get, issueSignedToken, list, presignUrl, put } from "@vercel/blob";
import { MAX_FILE_SIZE } from "@printerhub/contracts";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { signUpload } from "./security";

const localRoot = path.resolve(process.cwd(), "../../.data/uploads");

export async function createUploadUrl(pathname: string, origin: string): Promise<string> {
  const validUntil = Date.now() + 10 * 60_000;
  if (config.storageDriver === "local") {
    return `${origin}/api/uploads/local/${pathname}?token=${encodeURIComponent(signUpload(pathname, validUntil))}`;
  }
  const signedToken = await issueSignedToken({ pathname, operations: ["put"], validUntil, allowedContentTypes: ["application/pdf"], maximumSizeInBytes: MAX_FILE_SIZE });
  const { presignedUrl } = await presignUrl(signedToken, { operation: "put", pathname, access: "private", validUntil, allowedContentTypes: ["application/pdf"], maximumSizeInBytes: MAX_FILE_SIZE });
  return presignedUrl;
}

export async function createDownloadUrl(pathname: string, origin: string): Promise<string> {
  const validUntil = Date.now() + 5 * 60_000;
  if (config.storageDriver === "local") {
    return `${origin}/api/uploads/local/${pathname}?token=${encodeURIComponent(signUpload(pathname, validUntil))}`;
  }
  const signedToken = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(signedToken, { operation: "get", pathname, access: "private", validUntil, useCache: false });
  return presignedUrl;
}

export async function readUpload(pathname: string): Promise<Uint8Array> {
  if (config.storageDriver === "local") return readFile(localPath(pathname));
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result?.stream) throw new Error("Blob not found");
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  if (bytes.length > MAX_FILE_SIZE) throw new Error("Blob too large");
  return bytes;
}

export async function writeLocalUpload(pathname: string, bytes: Uint8Array) {
  if (bytes.length > MAX_FILE_SIZE) throw new Error("File too large");
  await mkdir(localRoot, { recursive: true });
  await writeFile(localPath(pathname), bytes, { flag: "wx", mode: 0o600 });
}

export async function writeUpload(pathname: string, bytes: Uint8Array) {
  if (bytes.length > MAX_FILE_SIZE) throw new Error("File too large");
  if (config.storageDriver === "local") return writeLocalUpload(pathname, bytes);
  await put(pathname, Buffer.from(bytes), { access: "private", contentType: "application/pdf", addRandomSuffix: false });
}

export async function deleteUpload(pathname: string): Promise<void> {
  if (config.storageDriver === "local") { await rm(localPath(pathname), { force: true }); return; }
  await del(pathname);
}

export async function localDownload(pathname: string): Promise<Uint8Array> {
  return readFile(localPath(pathname));
}

export async function listOldUploads(olderThan: Date): Promise<string[]> {
  if (config.storageDriver === "local") {
    try {
      const names = await readdir(localRoot);
      const old: string[] = [];
      for (const name of names) {
        if (!/^[0-9a-f-]{36}\.pdf$/.test(name)) continue;
        if ((await stat(path.join(localRoot, name))).mtime < olderThan) old.push(name.slice(0, -4));
      }
      return old;
    } catch { return []; }
  }
  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000 });
    old.push(...page.blobs.filter((blob) => blob.uploadedAt < olderThan && /^[0-9a-f-]{36}$/.test(blob.pathname)).map((blob) => blob.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return old;
}

function localPath(pathname: string) {
  if (!/^[0-9a-f-]{36}$/.test(pathname)) throw new Error("Invalid pathname");
  return path.join(localRoot, `${pathname}.pdf`);
}
