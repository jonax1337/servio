// Blob storage — Node runtime only (node:fs / node:crypto). Never import from a
// client component. The filesystem driver stores blobs OUTSIDE ./public so they
// can never be served statically; every read goes through the authorized route.
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, access, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";

export interface PutResult { key: string; size: number; checksum: string }
export interface StorageObject { body: Readable; size: number }

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<PutResult>;
  get(key: string): Promise<StorageObject>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class NotFoundError extends Error {}
export class InvalidKeyError extends Error {}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Server-generated key: YYYY/MM/<uuid>-<safeName>. The uuid makes it unguessable. */
export function buildStorageKey(safeName: string, now: Date = new Date()): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${randomUUID()}-${safeName}`;
}

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Reject anything that could escape the storage root or break the filesystem. */
export function assertValidKey(key: string): void {
  if (!key || key.length > 512) throw new InvalidKeyError("empty or over-long key");
  if (key.startsWith("/") || key.includes("\\") || key.includes("\0")) throw new InvalidKeyError("illegal characters");
  const segs = key.split("/");
  for (const s of segs) {
    if (s === "" || s === "." || s === ".." || !SEGMENT.test(s)) throw new InvalidKeyError(`illegal segment: ${s}`);
  }
}

class FilesystemAdapter implements StorageAdapter {
  private root: string;
  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }
  private resolve(key: string): string {
    assertValidKey(key);
    const abs = path.resolve(this.root, key);
    const rel = path.relative(this.root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new InvalidKeyError("path escapes storage root");
    return abs;
  }
  async put(key: string, data: Buffer): Promise<PutResult> {
    const abs = this.resolve(key);
    await mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${randomUUID()}.tmp`;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(tmp, data, { flag: "wx" });
    await rename(tmp, abs); // atomic — no partial blobs are ever visible
    return { key, size: data.length, checksum: sha256(data) };
  }
  async get(key: string): Promise<StorageObject> {
    const abs = this.resolve(key);
    let size: number;
    try {
      size = (await stat(abs)).size;
    } catch {
      throw new NotFoundError(key);
    }
    return { body: createReadStream(abs), size };
  }
  async delete(key: string): Promise<void> {
    const abs = this.resolve(key);
    await rm(abs, { force: true }); // idempotent
  }
  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

function createAdapter(): StorageAdapter {
  const driver = process.env.STORAGE_DRIVER ?? "fs";
  switch (driver) {
    case "fs":
      return new FilesystemAdapter(process.env.UPLOAD_DIR ?? "./.uploads");
    // Seams for production drivers — implement and return here:
    // case "s3": return new S3Adapter(...);
    // case "vercel-blob": return new VercelBlobAdapter(...);
    default:
      throw new Error(`Unsupported STORAGE_DRIVER: ${driver}`);
  }
}

// HMR-safe singleton (same pattern as lib/db.ts).
const globalForStorage = globalThis as unknown as { __servioStorage?: StorageAdapter };
export const storage: StorageAdapter = globalForStorage.__servioStorage ?? createAdapter();
if (process.env.NODE_ENV !== "production") globalForStorage.__servioStorage = storage;
