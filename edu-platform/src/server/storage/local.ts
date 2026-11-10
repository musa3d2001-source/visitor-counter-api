import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile, open } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { env } from "../env";
import { assertSafeKey, StorageNotFoundError, type Bucket, type StorageDriver, type UploadTarget } from "./types";

/**
 * تخزين محلي على القرص — للتطوير والاختبار أو الاستضافة على خادم خاص.
 * المجلد خارج public/ ولا يُخدم مباشرة؛ كل وصول يمر عبر مسارات API تتحقق من الصلاحية.
 */
function root() {
  return resolve(env().LOCAL_STORAGE_DIR);
}

function pathFor(bucket: Bucket, key: string) {
  assertSafeKey(key);
  const base = join(root(), bucket);
  const full = resolve(base, key);
  if (!full.startsWith(base + sep)) throw new Error("Invalid storage path");
  return full;
}

export type LocalUploadClaims = { b: Bucket; k: string; t: string; m: number; u: string; e: number };

function sign(payload: string) {
  return createHmac("sha256", env().APP_SECRET).update(`local-upload:${payload}`).digest("base64url");
}

export function createLocalUploadToken(claims: LocalUploadClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyLocalUploadToken(token: string): LocalUploadClaims | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as LocalUploadClaims;
    if (claims.e < Date.now()) return null;
    assertSafeKey(claims.k);
    return claims;
  } catch {
    return null;
  }
}

export const localDriver: StorageDriver = {
  name: "local",
  async put(bucket, key, data) {
    const p = pathFor(bucket, key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data, { flag: "wx" });
  },
  async read(bucket, key) {
    return new Uint8Array(await readFile(pathFor(bucket, key)));
  },
  async readHead(bucket, key, bytes) {
    const fh = await open(pathFor(bucket, key), "r");
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return new Uint8Array(buf.subarray(0, bytesRead));
    } finally {
      await fh.close();
    }
  },
  async stat(bucket, key) {
    try {
      const s = await stat(pathFor(bucket, key));
      return { size: s.size };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      throw err;
    }
  },
  async remove(bucket, key) {
    await rm(pathFor(bucket, key), { force: true });
  },
  async removeMany(bucket, keys) {
    for (const key of keys) await rm(pathFor(bucket, key), { force: true });
  },
  async readStream(bucket, key) {
    const p = pathFor(bucket, key);
    let size: number;
    try {
      size = (await stat(p)).size;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") throw new StorageNotFoundError();
      throw err;
    }
    return { stream: Readable.toWeb(createReadStream(p)) as unknown as ReadableStream<Uint8Array>, size };
  },
  async createUploadTarget(bucket, key, contentType, maxBytes, userId): Promise<UploadTarget> {
    const token = createLocalUploadToken({ b: bucket, k: key, t: contentType, m: maxBytes, u: userId, e: Date.now() + 30 * 60_000 });
    return {
      method: "PUT",
      url: `/api/uploads/local?token=${encodeURIComponent(token)}`,
      headers: { "content-type": contentType },
    };
  },
  publicUrl(key) {
    return `/media/${key}`;
  },
  async signedUrl() {
    return null;
  },
  async readRange(bucket, key, start, end) {
    const stream = createReadStream(pathFor(bucket, key), { start, end });
    return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
  },
};
