import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type postgres from "postgres";
import { scrubForOps } from "../src/lib/redact";
import { assertSafeKey, type Bucket } from "../src/server/storage/types";

/**
 * نسخ ملفات التخزين إلى مجلد محلي واستعادتها. ما تتوقعه قاعدة البيانات هو المرجع، فالملف المفقود يُبلَّغ عنه باسم صفه.
 * لا يطبع رابطًا موقّعًا ولا مفتاحًا: النتائج أسماء ملفات وجداول فقط، ورسائل الأخطاء منقّاة.
 *
 * ما لا يغطيه: قاعدة البيانات نفسها (مسؤولية الاستضافة)، وفيديوهات Bunny، ولا يعمل وحده على جدول، والنسخة في مكان واحد ما لم تنقلها أنت.
 * التفاصيل في README.
 */

export const BUCKETS: Bucket[] = ["private", "public"];
export const MANIFEST_FILE = "manifest.json";

const HERE = dirname(fileURLToPath(import.meta.url));
/** جذر المستودع: النسخة تحوي ملفات الطلاب، فلا يصح أن تقع في مجلد قد يُرفع أو يُنشر */
export const REPOSITORY_ROOT = resolve(HERE, "../..");

const LIST_PAGE = 1000;
const SIGNED_URL_SECONDS = 3600;

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
};

export class BackupRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupRefusedError";
  }
}

export type StoredObject = { key: string; size: number | null; contentType: string | null };

/** ما يحتاجه النسخ والاستعادة من التخزين، لكل من المشغّلين */
export interface ObjectStore {
  readonly label: string;
  readonly remoteHost: string | null;
  list(bucket: Bucket): Promise<StoredObject[]>;
  open(bucket: Bucket, key: string): Promise<Readable>;
  /** يضيف ملفًا غير موجود، ويفشل إن وجد الملف: الاستعادة لا تكتب فوق شيء */
  addNew(bucket: Bucket, key: string, file: string, contentType: string): Promise<void>;
}

function describeFailure(err: unknown): string {
  return scrubForOps(err instanceof Error ? err.message : String(err), 200) || "unknown error";
}

function contentTypeOf(key: string, known: string | null): string {
  return known ?? CONTENT_TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function pathInside(root: string, bucket: Bucket, key: string): string {
  assertSafeKey(key);
  const base = resolve(root, bucket);
  const full = resolve(base, key);
  if (!full.startsWith(base + sep)) throw new Error("Invalid storage path");
  return full;
}

export function localStore(dir: string): ObjectStore {
  const root = resolve(dir);
  const walk = async (base: string, prefix: string): Promise<StoredObject[]> => {
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const out: StoredObject[] = [];
    for (const entry of entries) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) out.push(...(await walk(join(base, entry.name), key)));
      else if (entry.isFile()) out.push({ key, size: (await stat(join(base, entry.name))).size, contentType: null });
    }
    return out;
  };
  return {
    label: `local (${root})`,
    remoteHost: null,
    list: (bucket) => walk(join(root, bucket), ""),
    open: async (bucket, key) => createReadStream(pathInside(root, bucket, key)),
    async addNew(bucket, key, file) {
      const target = pathInside(root, bucket, key);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(file, target, constants.COPYFILE_EXCL);
    },
  };
}

export type SupabaseStoreConfig = { url: string; serviceRoleKey: string; privateBucket: string; publicBucket: string };

export function supabaseStore(cfg: SupabaseStoreConfig): ObjectStore {
  const client = createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const nameOf = (bucket: Bucket) => (bucket === "private" ? cfg.privateBucket : cfg.publicBucket);
  const walk = async (bucket: Bucket, prefix: string): Promise<StoredObject[]> => {
    const out: StoredObject[] = [];
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await client.storage.from(nameOf(bucket)).list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`could not list ${bucket}: ${error.message}`);
      for (const item of data ?? []) {
        const key = prefix ? `${prefix}/${item.name}` : item.name;
        // ما ليس له معرّف مجلد، حسب واجهة Storage
        if (item.id === null) out.push(...(await walk(bucket, key)));
        else out.push({ key, size: typeof item.metadata?.size === "number" ? item.metadata.size : null, contentType: typeof item.metadata?.mimetype === "string" ? item.metadata.mimetype : null });
      }
      if ((data?.length ?? 0) < LIST_PAGE) return out;
    }
  };
  return {
    label: `supabase (${new URL(cfg.url).host})`,
    remoteHost: new URL(cfg.url).host,
    list: (bucket) => walk(bucket, ""),
    async open(bucket, key) {
      assertSafeKey(key);
      const { data, error } = await client.storage.from(nameOf(bucket)).createSignedUrl(key, SIGNED_URL_SECONDS);
      if (error || !data) throw new Error(`could not sign the download: ${error?.message ?? "empty response"}`);
      const res = await fetch(data.signedUrl);
      if (!res.ok || !res.body) throw new Error(`download failed with status ${res.status}`);
      return Readable.fromWeb(res.body as never);
    },
    async addNew(bucket, key, file, contentType) {
      assertSafeKey(key);
      const { error } = await client.storage.from(nameOf(bucket)).upload(key, await readFile(file), { contentType, upsert: false });
      if (error) throw new Error(`upload failed: ${error.message}`);
    },
  };
}

/** المشغّل نفسه الذي يستخدمه التطبيق، من المتغيرات نفسها */
export function storeFromEnv(env: Record<string, string | undefined> = process.env): ObjectStore {
  if (env.STORAGE_DRIVER !== "supabase") return localStore(env.LOCAL_STORAGE_DIR || "./storage");
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new BackupRefusedError("STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return supabaseStore({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, privateBucket: env.SUPABASE_PRIVATE_BUCKET || "private-content", publicBucket: env.SUPABASE_PUBLIC_BUCKET || "public-media" });
}

export type ExpectedObject = { bucket: Bucket; key: string; table: string; column: string; rowId: string };

/** كل ملف تشير إليه قاعدة البيانات. للقراءة فقط */
export async function expectedObjects(db: postgres.Sql): Promise<ExpectedObject[]> {
  const rows = await db.begin("read only", (tx) => tx<{ bucket: Bucket; key: string; tbl: string; col: string; row_id: string }[]>`
    select 'private' as bucket, storage_key as key, 'product_files' as tbl, 'storage_key' as col, id::text as row_id from product_files
    union all select 'private', video_ref, 'lessons', 'video_ref', id::text from lessons where provider = 'file'
    union all select 'public', thumbnail_key, 'lessons', 'thumbnail_key', id::text from lessons where thumbnail_key is not null
    union all select 'public', cover_key, 'products', 'cover_key', id::text from products where cover_key is not null
    union all select 'public', photo_key, 'teachers', 'photo_key', id::text from teachers where photo_key is not null
    union all select 'public', photo_key, 'teacher_profile_changes', 'photo_key', id::text from teacher_profile_changes where photo_key is not null and status = 'pending'
    union all select 'public', value #>> '{}', 'settings', 'value', key from settings where key = 'logo_key' and coalesce(value #>> '{}', '') <> ''
  `);
  return [...(rows as unknown as { bucket: Bucket; key: string; tbl: string; col: string; row_id: string }[])].map((row) => ({ bucket: row.bucket, key: row.key, table: row.tbl, column: row.col, rowId: row.row_id }));
}

/**
 * inSource=false: نُسخ في جولة سابقة ولم يعد في التخزين. يبقى في النسخة وفي البيان حتى تعيده الاستعادة،
 * لأن فقدانه من التخزين هو بالضبط ما وُجدت النسخة من أجله. البيانات الأقدم بلا هذا الحقل تعني true.
 */
export type ManifestEntry = { bucket: Bucket; key: string; size: number; sha256: string; contentType: string; referenced: boolean; inSource?: boolean };
export type Manifest = { version: 1; createdAt: string; source: string; complete: boolean; objects: ManifestEntry[]; missing: ExpectedObject[] };

export type BackupReport = {
  applied: boolean;
  source: string;
  outDir: string | null;
  referenced: number;
  /** نُسخ في هذه الجولة (أو سيُنسخ في المعاينة) */
  copied: number;
  unchanged: number;
  bytesCopied: number;
  /** تشير إليه قاعدة البيانات وليس في التخزين */
  missing: ExpectedObject[];
  /** من المفقود في التخزين: ما تحفظه هذه النسخة من جولة سابقة، فتعيده الاستعادة */
  recoverable: number;
  /** نُسخ في جولة سابقة ولم يعد في التخزين، فبقي في النسخة كما هو */
  keptFromEarlier: { bucket: Bucket; key: string }[];
  /** كان في البيان السابق وملفه في مجلد النسخة غائب أو تغيّر، فلم يعد في البيان */
  droppedFromBackup: { bucket: Bucket; key: string }[];
  /** في التخزين ولا تشير إليه قاعدة البيانات: يُنسخ احتياطًا ويُبلَّغ عنه */
  orphans: { bucket: Bucket; key: string }[];
  invalidKeys: { bucket: Bucket; key: string; table: string | null; rowId: string | null }[];
  failed: { bucket: Bucket; key: string; reason: string }[];
  bunnyLessonsNotCovered: number;
  complete: boolean;
};

export function assertOutsideRepository(dir: string): string {
  const full = resolve(dir);
  const fromRoot = relative(REPOSITORY_ROOT, full);
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) {
    throw new BackupRefusedError("The backup folder must be outside the project, because it holds student-facing files. Nothing was written.");
  }
  return full;
}

async function readManifest(dir: string): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8")) as Manifest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function streamToFile(source: Readable, target: string): Promise<{ size: number; sha256: string }> {
  await mkdir(dirname(target), { recursive: true });
  const part = `${target}.${randomUUID()}.part`;
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(
      source,
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          hash.update(chunk);
          size += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(part, { flags: "wx" }),
    );
    await rename(part, target);
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  }
  return { size, sha256: hash.digest("hex") };
}

async function hashOf(source: Readable): Promise<{ size: number; sha256: string }> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of source as AsyncIterable<Buffer>) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, sha256: hash.digest("hex") };
}

/** المعاينة لا تكتب شيئًا ولا تنزّل ملفًا. التنفيذ يعيد كتابة manifest.json في النهاية حتى لو تعذر بعض الملفات */
export async function runBackup(db: postgres.Sql, store: ObjectStore, opts: { apply: boolean; outDir: string | null }): Promise<BackupReport> {
  if (opts.apply && !opts.outDir) throw new BackupRefusedError("--apply needs --out <folder outside the project>. Nothing was written.");
  const outDir = opts.outDir ? assertOutsideRepository(opts.outDir) : null;

  const expected = await expectedObjects(db);
  const [{ n: bunnyLessons }] = await db<{ n: number }[]>`select count(*)::int as n from lessons where provider = 'bunny'`;

  const listings = new Map<Bucket, Map<string, StoredObject>>();
  for (const bucket of BUCKETS) listings.set(bucket, new Map((await store.list(bucket)).filter((object) => !object.key.endsWith(".part")).map((object) => [object.key, object])));

  const report: BackupReport = {
    applied: opts.apply,
    source: store.label,
    outDir,
    referenced: 0,
    copied: 0,
    unchanged: 0,
    bytesCopied: 0,
    missing: [],
    recoverable: 0,
    keptFromEarlier: [],
    droppedFromBackup: [],
    orphans: [],
    invalidKeys: [],
    failed: [],
    bunnyLessonsNotCovered: bunnyLessons,
    complete: true,
  };

  const referenced = new Set<string>();
  for (const row of expected) {
    try {
      assertSafeKey(row.key);
    } catch {
      report.invalidKeys.push({ bucket: row.bucket, key: row.key, table: row.table, rowId: row.rowId });
      continue;
    }
    if (referenced.has(`${row.bucket}/${row.key}`)) continue;
    referenced.add(`${row.bucket}/${row.key}`);
    if (!listings.get(row.bucket)!.has(row.key)) report.missing.push(row);
  }
  report.referenced = referenced.size;

  const previous = outDir ? await readManifest(outDir) : null;
  const known = new Map(previous?.objects.map((entry) => [`${entry.bucket}/${entry.key}`, entry]));
  const objects: ManifestEntry[] = [];

  for (const bucket of BUCKETS) {
    for (const object of listings.get(bucket)!.values()) {
      const isReferenced = referenced.has(`${bucket}/${object.key}`);
      try {
        assertSafeKey(object.key);
      } catch {
        report.invalidKeys.push({ bucket, key: object.key, table: null, rowId: null });
        continue;
      }
      if (!isReferenced) report.orphans.push({ bucket, key: object.key });
      if (!opts.apply) {
        report.copied++;
        report.bytesCopied += object.size ?? 0;
        continue;
      }
      const target = pathInside(outDir!, bucket, object.key);
      const before = known.get(`${bucket}/${object.key}`);
      // المفاتيح لا يُكتب فوقها في التخزين، فنفس الحجم يعني نفس الملف
      const onDisk = before && object.size === before.size ? await stat(target).catch(() => null) : null;
      if (before && onDisk?.size === before.size) {
        objects.push({ ...before, referenced: isReferenced, inSource: true });
        report.unchanged++;
        continue;
      }
      try {
        const copied = await streamToFile(await store.open(bucket, object.key), target);
        if (object.size !== null && copied.size !== object.size) throw new Error(`size differs from the listing (${copied.size} and ${object.size})`);
        objects.push({ bucket, key: object.key, size: copied.size, sha256: copied.sha256, contentType: contentTypeOf(object.key, object.contentType), referenced: isReferenced, inSource: true });
        report.copied++;
        report.bytesCopied += copied.size;
      } catch (err) {
        report.failed.push({ bucket, key: object.key, reason: describeFailure(err) });
      }
    }
  }

  // ما نُسخ وتحقق سابقًا لا يسقط من البيان: لا لأنه اختفى من التخزين، ولا لأن تنزيله فشل هذه المرة.
  // يبقى ما دام ملفه في مجلد النسخة بالبصمة نفسها، فالاستعادة تعيده. التنزيل الفاشل لا يمس الملف القديم (يكتب في .part أولًا)
  if (opts.apply && previous) {
    const inManifest = new Set(objects.map((entry) => `${entry.bucket}/${entry.key}`));
    for (const before of previous.objects) {
      const id = `${before.bucket}/${before.key}`;
      if (inManifest.has(id) || !BUCKETS.includes(before.bucket)) continue;
      let onDisk: { size: number; sha256: string } | null = null;
      try {
        onDisk = await hashOf(createReadStream(pathInside(outDir!, before.bucket, before.key)));
      } catch {
        onDisk = null;
      }
      if (!onDisk || onDisk.size !== before.size || onDisk.sha256 !== before.sha256) {
        report.droppedFromBackup.push({ bucket: before.bucket, key: before.key });
        continue;
      }
      const stillListed = listings.get(before.bucket)!.has(before.key);
      objects.push({ ...before, referenced: referenced.has(id), inSource: stillListed });
      inManifest.add(id);
      if (!stillListed) report.keptFromEarlier.push({ bucket: before.bucket, key: before.key });
    }
    report.recoverable = report.missing.filter((row) => inManifest.has(`${row.bucket}/${row.key}`)).length;
  }

  report.complete = report.missing.length === 0 && report.failed.length === 0 && report.invalidKeys.length === 0;
  if (opts.apply) {
    const manifest: Manifest = { version: 1, createdAt: new Date().toISOString(), source: store.label, complete: report.complete, objects, missing: report.missing };
    await mkdir(outDir!, { recursive: true });
    const temp = join(outDir!, `${MANIFEST_FILE}.${randomUUID()}.part`);
    await writeFile(temp, JSON.stringify(manifest, null, 2));
    await rename(temp, join(outDir!, MANIFEST_FILE));
  }
  return report;
}

export type RestoreReport = {
  applied: boolean;
  target: string;
  inBackup: number;
  /** أُضيف إلى التخزين (أو سيضاف في المعاينة) */
  restored: number;
  alreadyThere: number;
  /** موجود بحجم مختلف: يُترك كما هو ويُبلَّغ عنه */
  conflicts: { bucket: Bucket; key: string }[];
  /** ملف النسخة لا يطابق بصمته: لا يُستعاد */
  corrupt: { bucket: Bucket; key: string }[];
  failed: { bucket: Bucket; key: string; reason: string }[];
  /** تشير إليه قاعدة البيانات، وكان مفقودًا من التخزين يوم النسخ، وليس في هذه النسخة: لا تستطيع الاستعادة إعادته */
  unrecoverable: { bucket: string; key: string; table: string; rowId: string }[];
  backupWasComplete: boolean;
  complete: boolean;
};

/** لا يكتب فوق شيء: يضيف الناقص فقط، بعد مطابقة بصمة الملف، ويقرأ ما كتبه ليتأكد منه */
export async function runRestore(store: ObjectStore, opts: { apply: boolean; fromDir: string; confirmTarget?: string | null }): Promise<RestoreReport> {
  const fromDir = resolve(opts.fromDir);
  const manifest = await readManifest(fromDir);
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.objects)) throw new BackupRefusedError(`No readable ${MANIFEST_FILE} in that folder. Nothing was changed.`);
  for (const entry of manifest.objects) {
    if (!BUCKETS.includes(entry.bucket)) throw new BackupRefusedError("The manifest names an unknown bucket. Nothing was changed.");
    try {
      assertSafeKey(entry.key);
    } catch {
      throw new BackupRefusedError("The manifest holds an unsafe file name. Nothing was changed.");
    }
  }
  if (opts.apply && store.remoteHost && opts.confirmTarget !== store.remoteHost) {
    throw new BackupRefusedError(`To restore into remote storage, add --confirm-target ${store.remoteHost}. Nothing was changed.`);
  }

  const present = new Map<Bucket, Map<string, StoredObject>>();
  for (const bucket of BUCKETS) present.set(bucket, new Map((await store.list(bucket)).map((object) => [object.key, object])));

  const backedUp = new Set(manifest.objects.map((entry) => `${entry.bucket}/${entry.key}`));
  const recordedMissing = Array.isArray(manifest.missing) ? manifest.missing : [];
  const unrecoverable = recordedMissing
    .filter((row) => row && typeof row.bucket === "string" && typeof row.key === "string" && !backedUp.has(`${row.bucket}/${row.key}`))
    // عاد إلى التخزين بطريق آخر بعد يوم النسخ
    .filter((row) => !present.get(row.bucket)?.has(row.key))
    .map((row) => ({ bucket: row.bucket, key: row.key, table: String(row.table ?? ""), rowId: String(row.rowId ?? "") }));

  const report: RestoreReport = {
    applied: opts.apply,
    target: store.label,
    inBackup: manifest.objects.length,
    restored: 0,
    alreadyThere: 0,
    conflicts: [],
    corrupt: [],
    failed: [],
    unrecoverable,
    backupWasComplete: manifest.complete,
    complete: true,
  };

  for (const entry of manifest.objects) {
    const existing = present.get(entry.bucket)!.get(entry.key);
    if (existing) {
      if (existing.size !== null && existing.size !== entry.size) report.conflicts.push({ bucket: entry.bucket, key: entry.key });
      else report.alreadyThere++;
      continue;
    }
    const file = pathInside(fromDir, entry.bucket, entry.key);
    try {
      const inBackup = await hashOf(createReadStream(file));
      if (inBackup.sha256 !== entry.sha256 || inBackup.size !== entry.size) {
        report.corrupt.push({ bucket: entry.bucket, key: entry.key });
        continue;
      }
      if (!opts.apply) {
        report.restored++;
        continue;
      }
      await store.addNew(entry.bucket, entry.key, file, entry.contentType);
      const written = await hashOf(await store.open(entry.bucket, entry.key));
      if (written.sha256 !== entry.sha256) throw new Error("read back does not match the backup");
      report.restored++;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT" && (err as NodeJS.ErrnoException).path === file) report.corrupt.push({ bucket: entry.bucket, key: entry.key });
      else report.failed.push({ bucket: entry.bucket, key: entry.key, reason: describeFailure(err) });
    }
  }
  // ما تحتاجه قاعدة البيانات ولا تحمله النسخة يبقى مفقودًا بعد الاستعادة، فلا تُقال «اكتملت»
  report.complete = report.conflicts.length === 0 && report.corrupt.length === 0 && report.failed.length === 0 && report.unrecoverable.length === 0;
  return report;
}

function list<T>(items: T[], show: (item: T) => string, limit = 25): string[] {
  const lines = items.slice(0, limit).map((item) => `  - ${show(item)}`);
  if (items.length > limit) lines.push(`  ... and ${items.length - limit} more`);
  return lines;
}

export function formatBackupReport(report: BackupReport): string {
  return [
    report.applied ? `Backup written to ${report.outDir}` : "Dry run, nothing was written. Add --apply --out <folder> to copy.",
    `Source: ${report.source}`,
    `Files the database refers to: ${report.referenced}`,
    `${report.applied ? "Copied" : "Would copy"}: ${report.copied} (${report.bytesCopied} bytes)`,
    report.applied ? `Unchanged since the last backup: ${report.unchanged}` : null,
    `Bunny videos not covered by this backup: ${report.bunnyLessonsNotCovered}`,
    `Missing from storage: ${report.missing.length}`,
    ...list(report.missing, (m) => `${m.bucket}/${m.key} (${m.table}.${m.column}, row ${m.rowId})`),
    report.applied && report.missing.length ? `Of those, held by this backup from an earlier run, so storage:restore puts them back: ${report.recoverable}` : null,
    report.keptFromEarlier.length ? `Kept from earlier runs although gone from storage: ${report.keptFromEarlier.length}` : null,
    ...list(report.keptFromEarlier, (k) => `${k.bucket}/${k.key}`),
    report.droppedFromBackup.length ? `Earlier copies no longer intact in the backup folder, removed from the manifest: ${report.droppedFromBackup.length}` : null,
    ...list(report.droppedFromBackup, (d) => `${d.bucket}/${d.key}`),
    `In storage but not in the database: ${report.orphans.length}`,
    ...list(report.orphans, (o) => `${o.bucket}/${o.key}`),
    report.invalidKeys.length ? `Unsafe file names, not copied: ${report.invalidKeys.length}` : null,
    report.failed.length ? `Failed: ${report.failed.length}` : null,
    ...list(report.failed, (f) => `${f.bucket}/${f.key}: ${f.reason}`),
    report.complete ? "Result: complete." : "Result: INCOMPLETE. See the lists above.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function formatRestoreReport(report: RestoreReport): string {
  return [
    report.applied ? "Restore finished." : "Dry run, nothing was changed. Add --apply to restore.",
    `Target: ${report.target}`,
    `Files in the backup: ${report.inBackup}`,
    `${report.applied ? "Restored" : "Would restore"}: ${report.restored}`,
    `Already there: ${report.alreadyThere}`,
    report.backupWasComplete ? null : "The backup itself was recorded as incomplete.",
    `Different size, left as they are: ${report.conflicts.length}`,
    ...list(report.conflicts, (c) => `${c.bucket}/${c.key}`),
    `Damaged or absent in the backup, not restored: ${report.corrupt.length}`,
    ...list(report.corrupt, (c) => `${c.bucket}/${c.key}`),
    report.failed.length ? `Failed: ${report.failed.length}` : null,
    ...list(report.failed, (f) => `${f.bucket}/${f.key}: ${f.reason}`),
    `Referenced by the database but held by no backup, cannot be restored: ${report.unrecoverable.length}`,
    ...list(report.unrecoverable, (u) => `${u.bucket}/${u.key} (${u.table}, row ${u.rowId})`),
    report.complete ? "Result: complete." : "Result: INCOMPLETE. See the lists above.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
