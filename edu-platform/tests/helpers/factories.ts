import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { sql } from "@/server/db";
import { hashPassword } from "@/server/auth/password-core";
import type { SessionUser } from "@/server/auth/session";
import { TEST_STORAGE_DIR } from "../test-env";

export const TEST_PASSWORD = "Passw0rd-Test!";
let cachedHash: string | null = null;
async function passwordHash() {
  if (!cachedHash) cachedHash = await hashPassword(TEST_PASSWORD);
  return cachedHash;
}

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createUser(opts: { role?: "student" | "admin" | "teacher"; email?: string; fullName?: string; isActive?: boolean; phone?: string | null } = {}): Promise<SessionUser> {
  const email = opts.email ?? `user-${uniq()}@example.com`;
  const [u] = await sql<{ id: string; email: string; full_name: string; phone: string | null; role: "student" | "admin" | "teacher"; grade_id: string | null; is_active: boolean }[]>`
    insert into users (email, password_hash, full_name, role, is_active, phone)
    values (${email}, ${await passwordHash()}, ${opts.fullName ?? "طالب تجريبي"}, ${opts.role ?? "student"}, ${opts.isActive ?? true}, ${opts.phone ?? null})
    returning id, email, full_name, phone, role, grade_id, is_active
  `;
  return { id: u.id, email: u.email, fullName: u.full_name, phone: u.phone, role: u.role, gradeId: u.grade_id, isActive: u.is_active };
}

export async function makePdf(pages = 3, label = "Test PDF"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${label} - page ${i}`, { x: 50, y: 780, size: 18, font });
  }
  return doc.save();
}

function writePrivate(key: string, data: Uint8Array) {
  const full = resolve(TEST_STORAGE_DIR, "private", key);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
}

export async function gradeAndSubject(level = 6, subjectSlug = "math") {
  const [row] = await sql<{ grade_id: string; subject_id: string }[]>`
    select g.id as grade_id, s.id as subject_id
    from grades g join subjects s on s.grade_id = g.id
    where g.level = ${level} and s.slug = ${subjectSlug}
  `;
  if (!row) throw new Error(`grade ${level} / subject ${subjectSlug} not seeded`);
  return { gradeId: row.grade_id, subjectId: row.subject_id };
}

export type TestProduct = { id: string; slug: string; priceFils: number; mainFileId: string | null; previewFileId: string | null };

export async function createProduct(opts: {
  level?: number;
  subjectSlug?: string;
  type?: "final_notes" | "exam_night" | "exam_model" | "answer_key" | "review_notes" | "video_course";
  priceFils?: number;
  status?: "draft" | "published" | "hidden" | "archived";
  withFile?: boolean;
  withPreview?: boolean;
  title?: string;
} = {}): Promise<TestProduct> {
  const { gradeId, subjectId } = await gradeAndSubject(opts.level ?? 6, opts.subjectSlug ?? "math");
  const slug = `p-${uniq()}`;
  const status = opts.status ?? "published";
  const [p] = await sql<{ id: string; price_fils: number }[]>`
    insert into products (slug, type, title, grade_id, subject_id, academic_year, term, price_fils, status, published_at)
    values (${slug}, ${opts.type ?? "final_notes"}, ${opts.title ?? `منتج اختبار ${slug}`}, ${gradeId}, ${subjectId}, '2026-2027', 1,
            ${opts.priceFils ?? 3000}, ${status}, ${status === "published" ? new Date() : null})
    returning id, price_fils
  `;
  let mainFileId: string | null = null;
  let previewFileId: string | null = null;
  if (opts.withFile ?? true) {
    const pdf = await makePdf(3, `Main ${slug}`);
    const key = `products/${p.id}/${randomUUID()}.pdf`;
    writePrivate(key, pdf);
    const [f] = await sql<{ id: string }[]>`
      insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count)
      values (${p.id}, 'main', 'الملف الرئيسي', ${key}, 'main.pdf', 'application/pdf', ${pdf.length}, 3)
      returning id
    `;
    mainFileId = f.id;
  }
  if (opts.withPreview ?? true) {
    const pdf = await makePdf(1, `Preview ${slug}`);
    const key = `previews/${p.id}/${randomUUID()}.pdf`;
    writePrivate(key, pdf);
    const [f] = await sql<{ id: string }[]>`
      insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, is_auto_preview)
      values (${p.id}, 'preview', 'معاينة', ${key}, 'preview.pdf', 'application/pdf', ${pdf.length}, 1, true)
      returning id
    `;
    previewFileId = f.id;
  }
  return { id: p.id, slug, priceFils: p.price_fils, mainFileId, previewFileId };
}

export async function createBundle(opts: { items: string[]; priceFils?: number; level?: number; status?: "draft" | "published" }): Promise<TestProduct> {
  const { gradeId } = await gradeAndSubject(opts.level ?? 6, "math");
  const slug = `b-${uniq()}`;
  const status = opts.status ?? "published";
  const [b] = await sql<{ id: string; price_fils: number }[]>`
    insert into products (slug, type, title, grade_id, academic_year, term, price_fils, status, published_at)
    values (${slug}, 'bundle', ${`باقة ${slug}`}, ${gradeId}, '2026-2027', 1, ${opts.priceFils ?? 5000}, ${status}, ${status === "published" ? new Date() : null})
    returning id, price_fils
  `;
  let i = 0;
  for (const item of opts.items) {
    await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${b.id}, ${item}, ${i++})`;
  }
  return { id: b.id, slug, priceFils: b.price_fils, mainFileId: null, previewFileId: null };
}

export async function createCoupon(opts: {
  code?: string;
  kind?: "percent" | "fixed";
  value?: number;
  minOrderFils?: number;
  maxRedemptions?: number | null;
  maxPerUser?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
} = {}) {
  const code = opts.code ?? `CODE${uniq().toUpperCase()}`.slice(0, 20);
  const [c] = await sql<{ id: string; code: string }[]>`
    insert into coupons (code, kind, value, min_order_fils, max_redemptions, max_per_user, starts_at, ends_at, is_active)
    values (${code}, ${opts.kind ?? "percent"}, ${opts.value ?? 10}, ${opts.minOrderFils ?? 0}, ${opts.maxRedemptions ?? null},
            ${opts.maxPerUser ?? 1}, ${opts.startsAt ?? null}, ${opts.endsAt ?? null}, ${opts.isActive ?? true})
    returning id, code
  `;
  return c;
}

export async function activeEntitlements(userId: string): Promise<string[]> {
  const rows = await sql<{ product_id: string }[]>`
    select product_id from entitlements where user_id = ${userId} and revoked_at is null order by product_id
  `;
  return rows.map((r) => r.product_id);
}

// ---------------------------------------------------------------------------
// المعلمون ومنتجات الفيديو والحاويات
// ---------------------------------------------------------------------------

export type TestTeacher = { id: string; slug: string; displayName: string; user: SessionUser | null };

export async function createTeacher(opts: {
  mode?: "managed" | "self_managed";
  /** ينشئ حساب دخول بدور teacher ويربطه (يُفرض مع self_managed) */
  withUser?: boolean;
  shareBps?: number | null;
  published?: boolean;
  canUpload?: boolean;
  displayName?: string;
} = {}): Promise<TestTeacher> {
  const mode = opts.mode ?? "managed";
  const user = mode === "self_managed" || opts.withUser ? await createUser({ role: "teacher", fullName: opts.displayName ?? "معلم الاختبار" }) : null;
  const slug = `t-${uniq()}`;
  const displayName = opts.displayName ?? `أ. معلم ${slug}`;
  const [t] = await sql<{ id: string }[]>`
    insert into teachers (slug, display_name, headline, bio, mode, user_id, can_upload, is_published, revenue_share_bps)
    values (${slug}, ${displayName}, 'معلم اختبار', 'نبذة', ${mode}, ${user?.id ?? null}, ${opts.canUpload ?? true},
            ${opts.published ?? true}, ${opts.shareBps === undefined ? null : opts.shareBps})
    returning id
  `;
  return { id: t.id, slug, displayName, user };
}

export type TestVideoProduct = TestProduct & { lessonIds: string[] };

/** يكتب مقطع فيديو (حقيقي إن توفر ffmpeg، وإلا بايتات MP4 شكلية) في التخزين الخاص */
export function writePrivateVideo(key: string, bytes?: Uint8Array) {
  const data =
    bytes ??
    new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32]);
  writePrivate(key, data);
  return data.length;
}

export async function createVideoProduct(opts: {
  type?: "video_lesson" | "unit" | "quiz_review" | "exam_review" | "video_course";
  teacherId?: string | null;
  lessons?: number;
  ready?: boolean;
  freePreviewIndex?: number | null;
  status?: "draft" | "in_review" | "published" | "hidden" | "archived";
  priceFils?: number;
  accessMode?: "unlimited" | "until_date" | "days";
  accessUntil?: Date | null;
  accessDays?: number | null;
  level?: number;
  subjectSlug?: string;
  provider?: "file" | "bunny";
  videoRefs?: string[];
  title?: string;
} = {}): Promise<TestVideoProduct> {
  const { gradeId, subjectId } = await gradeAndSubject(opts.level ?? 7, opts.subjectSlug ?? "science");
  const slug = `v-${uniq()}`;
  const status = opts.status ?? "published";
  const [p] = await sql<{ id: string; price_fils: number }[]>`
    insert into products (slug, type, title, grade_id, subject_id, academic_year, term, price_fils, status, published_at, teacher_id,
                          access_mode, access_until, access_days)
    values (${slug}, ${opts.type ?? "unit"}, ${opts.title ?? `وحدة فيديو ${slug}`}, ${gradeId}, ${subjectId}, '2026-2027', 1,
            ${opts.priceFils ?? 4000}, ${status}, ${status === "published" ? new Date() : null}, ${opts.teacherId ?? null},
            ${opts.accessMode ?? "unlimited"}, ${opts.accessUntil ?? null}, ${opts.accessDays ?? null})
    returning id, price_fils
  `;
  const lessonIds: string[] = [];
  const n = opts.lessons ?? 3;
  const provider = opts.provider ?? "file";
  for (let i = 0; i < n; i++) {
    let ref: string;
    let size: number | null = null;
    if (provider === "bunny") {
      ref = opts.videoRefs?.[i] ?? randomUUID();
    } else {
      ref = `lessons/${p.id}/${randomUUID()}.mp4`;
      size = writePrivateVideo(ref);
    }
    const [l] = await sql<{ id: string }[]>`
      insert into lessons (product_id, unit_title, title, provider, video_ref, mime_type, size_bytes, duration_seconds,
                           is_free_preview, is_published, sort_order, processing_status)
      values (${p.id}, 'الوحدة الأولى', ${`الدرس ${i + 1}`}, ${provider}, ${ref}, 'video/mp4', ${size}, 60,
              ${opts.freePreviewIndex === i}, true, ${i}, ${opts.ready === false ? "processing" : "ready"})
      returning id
    `;
    lessonIds.push(l.id);
  }
  return { id: p.id, slug, priceFils: p.price_fils, mainFileId: null, previewFileId: null, lessonIds };
}

/** حاوية (باقة/دورة/وحدة) تضم منتجات أخرى */
export async function createContainer(opts: {
  type?: "bundle" | "video_course" | "unit";
  items: string[];
  priceFils?: number;
  status?: "draft" | "published";
  teacherId?: string | null;
  accessMode?: "unlimited" | "until_date" | "days";
  accessUntil?: Date | null;
  accessDays?: number | null;
  level?: number;
}): Promise<TestProduct> {
  const { gradeId, subjectId } = await gradeAndSubject(opts.level ?? 7, "science");
  const slug = `c-${uniq()}`;
  const status = opts.status ?? "published";
  const type = opts.type ?? "bundle";
  const [b] = await sql<{ id: string; price_fils: number }[]>`
    insert into products (slug, type, title, grade_id, subject_id, academic_year, term, price_fils, status, published_at, teacher_id,
                          access_mode, access_until, access_days)
    values (${slug}, ${type}, ${`حاوية ${slug}`}, ${gradeId}, ${type === "bundle" ? null : subjectId}, '2026-2027', 1,
            ${opts.priceFils ?? 9000}, ${status}, ${status === "published" ? new Date() : null}, ${opts.teacherId ?? null},
            ${opts.accessMode ?? "unlimited"}, ${opts.accessUntil ?? null}, ${opts.accessDays ?? null})
    returning id, price_fils
  `;
  let i = 0;
  for (const item of opts.items) {
    await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${b.id}, ${item}, ${i++})`;
  }
  return { id: b.id, slug, priceFils: b.price_fils, mainFileId: null, previewFileId: null };
}
