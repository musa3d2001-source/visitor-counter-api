import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { BackupRefusedError, expectedObjects, formatBackupReport, formatRestoreReport, localStore, MANIFEST_FILE, REPOSITORY_ROOT, runBackup, runRestore, supabaseStore, type Manifest, type ObjectStore } from "../../scripts/_storage-backup";
import { parseBackupArgs } from "../../scripts/storage-backup";
import { parseRestoreArgs } from "../../scripts/storage-restore";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createProduct, createTeacher } from "../helpers/factories";

let work: string;
let source: string;
let out: string;
let target: string;

const write = (root: string, bucket: string, key: string, data: string) => {
  const full = join(root, bucket, key);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
};

const sha = (data: string) => createHash("sha256").update(data).digest("hex");
const manifestOf = (dir: string) => JSON.parse(readFileSync(join(dir, MANIFEST_FILE), "utf8")) as Manifest;
const backup = (apply = true) => runBackup(getDb(), localStore(source), { apply, outDir: apply ? out : null });

async function productWithFile(data = "pdf-bytes") {
  const product = await createProduct({ priceFils: 1000 });
  const key = `products/${randomUUID()}.pdf`;
  await sql`delete from product_files where product_id = ${product.id}`;
  await sql`insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes) values (${product.id}, 'main', 'ملف', ${key}, 'note.pdf', 'application/pdf', ${data.length})`;
  write(source, "private", key, data);
  return { product, key };
}

beforeAll(resetDb);
afterAll(closeDb);

beforeEach(async () => {
  await sql`truncate product_files, lessons restart identity cascade`;
  await sql`update products set cover_key = null`;
  await sql`update teachers set photo_key = null`;
  work = mkdtempSync(join(tmpdir(), "darb-backup-test-"));
  source = join(work, "source");
  out = join(work, "backup");
  target = join(work, "target");
  mkdirSync(source);
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("what the database expects", () => {
  it("covers private files, file videos, thumbnails, covers, teacher photos, pending photo changes and the logo", async () => {
    const { product, key } = await productWithFile();
    await sql`update products set cover_key = 'covers/a.png' where id = ${product.id}`;
    await sql`insert into lessons (product_id, unit_title, title, provider, video_ref, thumbnail_key, sort_order) values (${product.id}, 'و', 'درس', 'file', 'lessons/v.mp4', 'thumbs/t.png', 0), (${product.id}, 'و', 'د٢', 'bunny', 'bunny-guid', null, 1)`;
    const teacher = await createTeacher({});
    await sql`update teachers set photo_key = 'teachers/p.png' where id = ${teacher.id}`;
    await sql`insert into teacher_profile_changes (teacher_id, bio, photo_action, photo_key, status) values (${teacher.id}, 'نبذة', 'replace', 'teachers/pending.png', 'pending')`;
    await sql`insert into settings (key, value) values ('logo_key', ${sql.json("branding/logo.png")}) on conflict (key) do update set value = excluded.value`;
    const seen = await expectedObjects(getDb());
    const pairs = seen.map((row) => `${row.bucket}:${row.key}:${row.table}.${row.column}`);
    expect(pairs).toEqual(
      expect.arrayContaining([
        `private:${key}:product_files.storage_key`,
        "private:lessons/v.mp4:lessons.video_ref",
        "public:thumbs/t.png:lessons.thumbnail_key",
        "public:covers/a.png:products.cover_key",
        "public:teachers/p.png:teachers.photo_key",
        "public:teachers/pending.png:teacher_profile_changes.photo_key",
        "public:branding/logo.png:settings.value",
      ]),
    );
    expect(pairs.join(" ")).not.toContain("bunny-guid");
    await sql`delete from settings where key = 'logo_key'`;
    await sql`delete from teacher_profile_changes`;
  });
});

describe("the dry run", () => {
  it("writes nothing and still reports what is missing, by table and row", async () => {
    const { key } = await productWithFile();
    const [row] = await sql<{ id: string }[]>`select id from product_files where storage_key = ${key}`;
    rmSync(join(source, "private", key));
    const report = await backup(false);
    expect(report.applied).toBe(false);
    expect(report.complete).toBe(false);
    expect(report.missing).toEqual([{ bucket: "private", key, table: "product_files", column: "storage_key", rowId: row.id }]);
    expect(existsSync(out)).toBe(false);
  });

  it("is what you get with no flags", () => {
    expect(parseBackupArgs([])).toEqual({ apply: false, outDir: null });
    expect(parseRestoreArgs(["--from", "x"])).toEqual({ apply: false, fromDir: "x", confirmTarget: null });
  });

  it("does not change the database", async () => {
    await productWithFile();
    const before = await sql`select * from product_files order by id`;
    await backup(false);
    expect(await sql`select * from product_files order by id`).toEqual(before);
  });
});

describe("the backup", () => {
  it("copies private and public files and records their fingerprints", async () => {
    const { product, key } = await productWithFile("main-pdf");
    await sql`update products set cover_key = 'covers/c.png' where id = ${product.id}`;
    write(source, "public", "covers/c.png", "cover-image");
    const report = await backup();
    expect(report).toMatchObject({ applied: true, complete: true, referenced: 2, copied: 2, missing: [], orphans: [] });
    expect(readFileSync(join(out, "private", key), "utf8")).toBe("main-pdf");
    expect(readFileSync(join(out, "public", "covers/c.png"), "utf8")).toBe("cover-image");
    const manifest = manifestOf(out);
    expect(manifest.complete).toBe(true);
    expect(manifest.objects.find((o) => o.key === key)).toMatchObject({ bucket: "private", size: 8, sha256: sha("main-pdf"), contentType: "application/pdf", referenced: true });
  });

  it("copies files nobody refers to as well, and reports them", async () => {
    write(source, "private", "orphans/lost.pdf", "orphan");
    const report = await backup();
    expect(report.orphans).toEqual([{ bucket: "private", key: "orphans/lost.pdf" }]);
    expect(report.complete).toBe(true);
    expect(manifestOf(out).objects[0]).toMatchObject({ key: "orphans/lost.pdf", referenced: false });
    expect(existsSync(join(out, "private/orphans/lost.pdf"))).toBe(true);
  });

  it("is marked incomplete when a file the database needs is missing", async () => {
    const { key } = await productWithFile();
    await productWithFile();
    rmSync(join(source, "private", key));
    const report = await backup();
    expect(report.complete).toBe(false);
    expect(report.missing).toHaveLength(1);
    expect(manifestOf(out)).toMatchObject({ complete: false });
    expect(manifestOf(out).missing).toHaveLength(1);
  });

  it("reports the videos on Bunny as not covered", async () => {
    const { product } = await productWithFile();
    await sql`insert into lessons (product_id, unit_title, title, provider, video_ref, sort_order) values (${product.id}, 'و', 'درس', 'bunny', 'guid-1', 0)`;
    const report = await backup(false);
    expect(report.bunnyLessonsNotCovered).toBe(1);
    expect(formatBackupReport(report)).toContain("Bunny videos not covered by this backup: 1");
  });

  it("a second run does not download what has not changed", async () => {
    await productWithFile();
    await backup();
    const opened: string[] = [];
    const counting = localStore(source);
    const original = counting.open;
    counting.open = (bucket, key) => {
      opened.push(key);
      return original(bucket, key);
    };
    const report = await runBackup(getDb(), counting, { apply: true, outDir: out });
    expect(report).toMatchObject({ copied: 0, unchanged: 1, complete: true });
    expect(opened).toEqual([]);
    expect(manifestOf(out).objects).toHaveLength(1);
  });

  it("a file deleted from the backup folder is fetched again", async () => {
    const { key } = await productWithFile("again");
    await backup();
    rmSync(join(out, "private", key));
    expect(await backup()).toMatchObject({ copied: 1, unchanged: 0 });
    expect(readFileSync(join(out, "private", key), "utf8")).toBe("again");
  });

  it("records a failed download and carries on", async () => {
    await productWithFile("first");
    await productWithFile("second");
    const flaky = localStore(source);
    const original = flaky.open;
    let calls = 0;
    flaky.open = (bucket, key) => (++calls === 1 ? Promise.reject(new Error("timeout at https://x.test/sign?token=SECRETVALUE")) : original(bucket, key));
    const report = await runBackup(getDb(), flaky, { apply: true, outDir: out });
    expect(report).toMatchObject({ copied: 1, complete: false });
    expect(report.failed).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain("SECRETVALUE");
    expect(readdirSync(join(out, "private"), { recursive: true }).join(" ")).not.toContain(".part");
  });

  it("keeps a file it copied earlier after it vanishes from storage, and the restore brings it back", async () => {
    const { key } = await productWithFile("precious");
    await backup();
    rmSync(join(source, "private", key));
    const report = await backup();
    expect(report).toMatchObject({ complete: false, recoverable: 1, keptFromEarlier: [{ bucket: "private", key }] });
    expect(report.missing).toHaveLength(1);
    expect(manifestOf(out).objects.find((o) => o.key === key)).toMatchObject({ sha256: sha("precious"), inSource: false, referenced: true });
    expect(formatBackupReport(report)).toContain("storage:restore puts them back: 1");
    const restored = await runRestore(localStore(target), { apply: true, fromDir: out });
    expect(restored).toMatchObject({ restored: 1, unrecoverable: [], complete: true });
    expect(readFileSync(join(target, "private", key), "utf8")).toBe("precious");
  });

  it("an emptied bucket does not empty the backup", async () => {
    await productWithFile("one");
    await productWithFile("two");
    write(source, "public", "covers/x.png", "cover");
    await backup();
    rmSync(join(source, "private"), { recursive: true, force: true });
    mkdirSync(join(source, "private"));
    const report = await backup();
    expect(report.keptFromEarlier).toHaveLength(2);
    expect(report.recoverable).toBe(2);
    expect(manifestOf(out).objects).toHaveLength(3);
  });

  it("a failed download on a later run keeps the copy made earlier", async () => {
    const { key } = await productWithFile("v1");
    await backup();
    write(source, "private", key, "version-two");
    const flaky = localStore(source);
    flaky.open = () => Promise.reject(new Error("timeout"));
    const report = await runBackup(getDb(), flaky, { apply: true, outDir: out });
    expect(report).toMatchObject({ copied: 0, complete: false });
    expect(report.failed).toHaveLength(1);
    expect(manifestOf(out).objects.find((o) => o.key === key)).toMatchObject({ sha256: sha("v1"), inSource: true });
    expect(readFileSync(join(out, "private", key), "utf8")).toBe("v1");
  });

  it("drops an earlier copy that no longer matches its fingerprint, and says so", async () => {
    const { key } = await productWithFile("original");
    await backup();
    rmSync(join(source, "private", key));
    writeFileSync(join(out, "private", key), "tampered");
    const report = await backup();
    expect(report.droppedFromBackup).toEqual([{ bucket: "private", key }]);
    expect(report.recoverable).toBe(0);
    expect(manifestOf(out).objects).toHaveLength(0);
  });

  it("does not copy a file with an unsafe name", async () => {
    write(source, "private", "fine/ok.pdf", "ok");
    write(source, "private", "fine/bad name.pdf", "bad");
    const report = await backup();
    expect(report.invalidKeys).toEqual([{ bucket: "private", key: "fine/bad name.pdf", table: null, rowId: null }]);
    expect(report.complete).toBe(false);
    expect(existsSync(join(out, "private/fine/bad name.pdf"))).toBe(false);
  });

  it("refuses to run without a folder, or with one inside the project", async () => {
    await expect(runBackup(getDb(), localStore(source), { apply: true, outDir: null })).rejects.toBeInstanceOf(BackupRefusedError);
    for (const inside of [REPOSITORY_ROOT, join(REPOSITORY_ROOT, "edu-platform/backups"), resolve(__dirname, "backups")]) {
      await expect(runBackup(getDb(), localStore(source), { apply: true, outDir: inside })).rejects.toBeInstanceOf(BackupRefusedError);
    }
  });

  it("refuses arguments it does not understand", () => {
    expect(() => parseBackupArgs(["--aply"])).toThrow(BackupRefusedError);
    expect(() => parseBackupArgs(["--out"])).toThrow(BackupRefusedError);
    expect(() => parseRestoreArgs(["--force"])).toThrow(BackupRefusedError);
  });
});

describe("the restore", () => {
  beforeEach(async () => {
    const { product, key } = await productWithFile("restored-pdf");
    await sql`update products set cover_key = 'covers/r.png' where id = ${product.id}`;
    write(source, "public", "covers/r.png", "restored-cover");
    await backup();
    keyOfPdf = key;
  });
  let keyOfPdf: string;

  it("the dry run checks everything and writes nothing", async () => {
    const report = await runRestore(localStore(target), { apply: false, fromDir: out });
    expect(report).toMatchObject({ applied: false, inBackup: 2, restored: 2, complete: true });
    expect(existsSync(target)).toBe(false);
  });

  it("puts every file back with the same content", async () => {
    const report = await runRestore(localStore(target), { apply: true, fromDir: out });
    expect(report).toMatchObject({ applied: true, restored: 2, alreadyThere: 0, complete: true });
    expect(readFileSync(join(target, "private", keyOfPdf), "utf8")).toBe("restored-pdf");
    expect(readFileSync(join(target, "public/covers/r.png"), "utf8")).toBe("restored-cover");
  });

  it("repeating it changes nothing", async () => {
    await runRestore(localStore(target), { apply: true, fromDir: out });
    expect(await runRestore(localStore(target), { apply: true, fromDir: out })).toMatchObject({ restored: 0, alreadyThere: 2, complete: true });
  });

  it("adds only what is missing and never overwrites", async () => {
    write(target, "public", "covers/r.png", "a different file that is longer");
    const report = await runRestore(localStore(target), { apply: true, fromDir: out });
    expect(report).toMatchObject({ restored: 1, complete: false });
    expect(report.conflicts).toEqual([{ bucket: "public", key: "covers/r.png" }]);
    expect(readFileSync(join(target, "public/covers/r.png"), "utf8")).toBe("a different file that is longer");
  });

  it("refuses a damaged file and reports it", async () => {
    writeFileSync(join(out, "private", keyOfPdf), "tampered-pdf");
    const report = await runRestore(localStore(target), { apply: true, fromDir: out });
    expect(report.corrupt).toEqual([{ bucket: "private", key: keyOfPdf }]);
    expect(report.complete).toBe(false);
    expect(existsSync(join(target, "private", keyOfPdf))).toBe(false);
  });

  it("reports a file gone from the backup", async () => {
    rmSync(join(out, "private", keyOfPdf));
    expect((await runRestore(localStore(target), { apply: true, fromDir: out })).corrupt).toHaveLength(1);
  });

  it("reports a write that does not read back the same", async () => {
    const garbling: ObjectStore = { ...localStore(target), addNew: async (bucket, key) => write(target, bucket, key, "garbled on the way") };
    const report = await runRestore(garbling, { apply: true, fromDir: out });
    expect(report.restored).toBe(0);
    expect(report.failed).toHaveLength(2);
    expect(report.complete).toBe(false);
  });

  it.each(["../escape.pdf", "a/../../escape.pdf", "/etc/passwd", "bad name.pdf"])("refuses a manifest holding the name %s", async (bad) => {
    const manifest = manifestOf(out);
    manifest.objects[0].key = bad;
    writeFileSync(join(out, MANIFEST_FILE), JSON.stringify(manifest));
    await expect(runRestore(localStore(target), { apply: true, fromDir: out })).rejects.toBeInstanceOf(BackupRefusedError);
    expect(existsSync(target)).toBe(false);
  });

  it("refuses a manifest naming an unknown bucket", async () => {
    const manifest = manifestOf(out);
    (manifest.objects[0] as { bucket: string }).bucket = "secrets";
    writeFileSync(join(out, MANIFEST_FILE), JSON.stringify(manifest));
    await expect(runRestore(localStore(target), { apply: true, fromDir: out })).rejects.toBeInstanceOf(BackupRefusedError);
  });

  it("refuses a folder with no manifest", async () => {
    await expect(runRestore(localStore(target), { apply: true, fromDir: source })).rejects.toBeInstanceOf(BackupRefusedError);
  });
});

describe("a restore when a needed file was never backed up", () => {
  it("names it and does not call the restore complete", async () => {
    const { key } = await productWithFile("never-copied");
    rmSync(join(source, "private", key));
    await backup();
    const report = await runRestore(localStore(target), { apply: true, fromDir: out });
    expect(report.unrecoverable).toEqual([expect.objectContaining({ bucket: "private", key, table: "product_files" })]);
    expect(report.complete).toBe(false);
    expect(formatRestoreReport(report)).toContain("held by no backup, cannot be restored: 1");
  });
});

/** محاكاة لواجهة Supabase Storage كما يستدعيها العميل الرسمي: قائمة، رابط موقّع، تنزيل، ورفع */
function fakeStorage(serviceKey: string) {
  const buckets: Record<string, Map<string, Buffer>> = { "private-content": new Map(), "public-media": new Map() };
  const listings: string[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url!, "http://local");
      const body = Buffer.concat(chunks);
      const send = (status: number, value: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      const signed = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
      if (signed && req.method === "GET") {
        const data = buckets[signed[1]].get(decodeURIComponent(signed[2]));
        if (!data || url.searchParams.get("token") !== "signed") return send(404, { message: "not found" });
        res.writeHead(200, { "content-type": "application/octet-stream" });
        return res.end(data);
      }
      if (req.headers.authorization !== `Bearer ${serviceKey}`) return send(401, { message: "unauthorized" });
      const list = url.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
      if (list && req.method === "POST") {
        const { prefix = "", limit, offset } = JSON.parse(body.toString()) as { prefix?: string; limit: number; offset: number };
        listings.push(`${list[1]}:${prefix}:${offset}`);
        const here = prefix ? `${prefix}/` : "";
        const names = new Map<string, { name: string; id: string | null; metadata: unknown }>();
        for (const [key, value] of buckets[list[1]]) {
          if (!key.startsWith(here)) continue;
          const rest = key.slice(here.length);
          const slash = rest.indexOf("/");
          if (slash >= 0) names.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null, metadata: null });
          else names.set(rest, { name: rest, id: randomUUID(), metadata: { size: value.length, mimetype: rest.endsWith(".pdf") ? "application/pdf" : "image/png" } });
        }
        return send(200, [...names.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit));
      }
      const sign = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
      if (sign && req.method === "POST") return send(200, { signedURL: `/object/sign/${sign[1]}/${sign[2]}?token=signed` });
      const object = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
      if (object && req.method === "POST") {
        const key = decodeURIComponent(object[2]);
        if (buckets[object[1]].has(key)) return send(409, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        const boundary = req.headers["content-type"]?.match(/boundary=(.+)$/)?.[1];
        let stored = body;
        if (boundary) {
          const text = body.toString("latin1");
          const start = text.indexOf("\r\n\r\n", text.indexOf('name=""') >= 0 ? text.indexOf('name=""') : 0) + 4;
          stored = Buffer.from(text.slice(start, text.lastIndexOf(`\r\n--${boundary}`)), "latin1");
        }
        buckets[object[1]].set(key, stored);
        return send(200, { Key: `${object[1]}/${key}`, Id: randomUUID() });
      }
      send(404, { message: "not found" });
    });
  });
  return new Promise<{ url: string; buckets: typeof buckets; listings: string[]; close: () => Promise<void> }>((done) =>
    server.listen(0, "127.0.0.1", () =>
      done({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        buckets,
        listings,
        close: () => new Promise((closed) => server.close(() => closed())),
      }),
    ),
  );
}

describe("against the Supabase storage interface (a local mock, never a real project)", () => {
  const KEY = "service-role-test-key";
  let fake: Awaited<ReturnType<typeof fakeStorage>>;
  const store = () => supabaseStore({ url: fake.url, serviceRoleKey: KEY, privateBucket: "private-content", publicBucket: "public-media" });

  beforeEach(async () => {
    fake = await fakeStorage(KEY);
  });
  afterEach(() => fake.close());

  it("walks folders and pages, downloads through signed links, and matches rows", async () => {
    const { key } = await productWithFile("from-supabase");
    fake.buckets["private-content"].set(key, Buffer.from("from-supabase"));
    fake.buckets["public-media"].set("covers/deep/er/c.png", Buffer.from("cover"));
    const report = await runBackup(getDb(), store(), { apply: true, outDir: out });
    expect(report).toMatchObject({ copied: 2, complete: true });
    expect(readFileSync(join(out, "private", key), "utf8")).toBe("from-supabase");
    expect(readFileSync(join(out, "public/covers/deep/er/c.png"), "utf8")).toBe("cover");
    expect(manifestOf(out).objects.find((o) => o.key === key)).toMatchObject({ contentType: "application/pdf", sha256: sha("from-supabase") });
    expect(JSON.stringify(report)).not.toContain(KEY);
    expect(JSON.stringify(manifestOf(out))).not.toMatch(new RegExp(`${KEY}|token=`));
  });

  it("reads past the first page of a large folder", async () => {
    for (let i = 0; i < 1005; i++) fake.buckets["public-media"].set(`many/f${String(i).padStart(4, "0")}.png`, Buffer.from("x"));
    const objects = await store().list("public");
    expect(objects).toHaveLength(1005);
    expect(fake.listings).toContain("public-media:many:1000");
  });

  it("reports what the database needs and the bucket lacks", async () => {
    const { key } = await productWithFile();
    const report = await runBackup(getDb(), store(), { apply: false, outDir: null });
    expect(report.missing.map((m) => m.key)).toEqual([key]);
  });

  it("a restore into remote storage needs the host typed out", async () => {
    write(source, "public", "covers/x.png", "image");
    await backup();
    await expect(runRestore(store(), { apply: true, fromDir: out })).rejects.toThrow(/--confirm-target/);
    await expect(runRestore(store(), { apply: true, fromDir: out, confirmTarget: "wrong.example.com" })).rejects.toBeInstanceOf(BackupRefusedError);
    expect(fake.buckets["public-media"].size).toBe(0);
  });

  it("restores through the upload call and reads the result back", async () => {
    write(source, "public", "covers/x.png", "image-bytes");
    await backup();
    const report = await runRestore(store(), { apply: true, fromDir: out, confirmTarget: new URL(fake.url).host });
    expect(report).toMatchObject({ restored: 1, complete: true });
    expect(fake.buckets["public-media"].get("covers/x.png")?.toString()).toBe("image-bytes");
  });
});
