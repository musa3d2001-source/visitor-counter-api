/**
 * بيانات تجريبية للمعلمين ودروس الفيديو (أسماء وهمية — للعرض والاختبار فقط).
 * تُنشئ مقاطع فيديو قصيرة أصلية عبر ffmpeg (VP9/MP4) إن كان مثبتًا، وتحفظها في التخزين المحلي الخاص.
 * المنتجات تُنشأ كمسودات ما لم يُمرَّر publish.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";

type Clip = { path: string; size: number; duration: number };

function ffmpegAvailable(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** مقطع اختبار قصير (نمط ألوان + نغمة صامتة) — يعمل في Chromium بدون ترميزات مملوكة */
export function makeDemoClip(cacheDir: string, seconds = 8, label = "demo"): Clip | null {
  if (!ffmpegAvailable()) return null;
  mkdirSync(cacheDir, { recursive: true });
  const out = join(cacheDir, `${label}-${seconds}s.mp4`);
  if (!existsSync(out)) {
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=duration=${seconds}:size=640x360:rate=24`, "-c:v", "libvpx-vp9", "-b:v", "300k", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
      { stdio: "ignore" },
    );
  }
  return { path: out, size: statSync(out).size, duration: seconds };
}

const TEACHERS = [
  { slug: "demo-math-teacher", name: "أ. خالد (معلم تجريبي)", headline: "شرح الرياضيات للمرحلة المتوسطة، حساب تجريبي للعرض", level: 9, subject: "math", share: 4000 },
  { slug: "demo-science-teacher", name: "أ. نورة (معلمة تجريبية)", headline: "العلوم بأسلوب مبسط، حساب تجريبي للعرض", level: 8, subject: "science", share: 5000 },
  { slug: "demo-english-teacher", name: "أ. يوسف (معلم تجريبي)", headline: "English made easy، حساب تجريبي للعرض", level: 7, subject: "english", share: 4500 },
];

export async function seedDemoTeachers(sql: postgres.Sql, opts: { publish: boolean; storageDir: string; academicYear: string }) {
  const clip = makeDemoClip(resolve(process.cwd(), "tests/.tmp/clips"));
  const status = opts.publish ? "published" : "draft";
  let created = 0;
  for (const [ti, t] of TEACHERS.entries()) {
    const exists = await sql`select 1 from teachers where slug = ${t.slug}`;
    if (exists.length) continue;
    const [row] = await sql<{ grade_id: string; subject_id: string; subject_name: string; grade_name: string }[]>`
      select g.id as grade_id, s.id as subject_id, s.name as subject_name, g.name as grade_name
      from grades g join subjects s on s.grade_id = g.id where g.level = ${t.level} and s.slug = ${t.subject}
    `;
    if (!row) continue;
    const [teacher] = await sql<{ id: string }[]>`
      insert into teachers (slug, display_name, headline, bio, mode, is_published, revenue_share_bps, sort_order)
      values (${t.slug}, ${t.name}, ${t.headline},
        ${"حساب تجريبي لعرض إمكانات المنصة. يشرح الدروس خطوة بخطوة مع أمثلة محلولة ومراجعات مركزة قبل الاختبارات."},
        'managed', ${opts.publish}, ${t.share}, ${ti})
      returning id
    `;
    await sql`insert into teacher_subjects (teacher_id, subject_id) values (${teacher.id}, ${row.subject_id})`;

    const mk = async (type: string, title: string, price: number, lessons: string[], freeFirst: boolean, extra: { compareAt?: number; summary?: string } = {}) => {
      const slug = `${t.slug.replace("demo-", "d-")}-${type.replace("_", "-")}-${randomUUID().slice(0, 6)}`;
      const [p] = await sql<{ id: string }[]>`
        insert into products (slug, type, title, summary, description, contents, grade_id, subject_id, academic_year, term,
          price_fils, compare_at_price_fils, status, teacher_id, published_at, sort_order, is_featured)
        values (${slug}, ${type}, ${title}, ${extra.summary ?? `${row.subject_name} في ${row.grade_name}`},
          ${"محتوى فيديو تجريبي أصلي لعرض المنصة واختبارها."}, ${"شرح مبسط لكل درس\nأمثلة محلولة\nأسئلة متوقعة"},
          ${row.grade_id}, ${row.subject_id}, ${opts.academicYear}, 1, ${price}, ${extra.compareAt ?? null}, ${status}, ${teacher.id},
          ${opts.publish ? new Date() : null}, ${created}, ${type === "video_course"})
        returning id
      `;
      for (const [li, title] of lessons.entries()) {
        let ref = `missing-${randomUUID()}`;
        let size: number | null = null;
        if (clip) {
          ref = `lessons/${p.id}/${randomUUID()}.mp4`;
          const full = resolve(opts.storageDir, "private", ref);
          mkdirSync(dirname(full), { recursive: true });
          copyFileSync(clip.path, full);
          size = clip.size;
        }
        await sql`
          insert into lessons (product_id, unit_title, title, description, provider, video_ref, mime_type, size_bytes, duration_seconds,
            is_free_preview, is_published, sort_order, processing_status)
          values (${p.id}, ${type === "unit" || type === "video_course" ? "الوحدة الأولى" : ""}, ${title}, ${"شرح تجريبي قصير."}, 'file', ${ref},
            'video/mp4', ${size}, ${clip?.duration ?? null}, ${freeFirst && li === 0}, true, ${li}, ${clip ? "ready" : "failed"})
        `;
      }
      created++;
      return p.id;
    };

    const unit = await mk("unit", `شرح الوحدة الأولى في ${row.subject_name}`, 4000, ["الدرس الأول: مقدمة الوحدة", "الدرس الثاني: الأفكار الأساسية", "الدرس الثالث: حل التمارين"], true, { compareAt: 5000 });
    const quiz = await mk("quiz_review", `مراجعة الاختبار القصير الأول في ${row.subject_name}`, 1500, ["مراجعة شاملة للاختبار القصير"], true);
    const exam = await mk("exam_review", `مراجعة ليلة الاختبار في ${row.subject_name}`, 2500, ["أهم الأسئلة المتوقعة", "حل نموذج اختبار"], false);
    const lesson = await mk("video_lesson", `درس منفرد: أسئلة الفهم في ${row.subject_name}`, 750, ["أسئلة الفهم خطوة بخطوة"], false);
    // دورة كاملة تضم الوحدة والمراجعات والدرس المنفرد
    const course = await mk("video_course", `الدورة الكاملة: ${row.subject_name} ${row.grade_name.replace(/^ال/, "لل")}`, 7000, [], false, { compareAt: 8750, summary: "كل الشروحات والمراجعات بسعر واحد" });
    let i = 0;
    for (const item of [unit, quiz, exam, lesson]) await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${course}, ${item}, ${i++})`;
    // باقة شاملة: الدورة + المذكرة النهائية (PDF) للمادة إن وجدت
    const [notes] = await sql<{ id: string }[]>`
      select id from products where grade_id = ${row.grade_id} and subject_id = ${row.subject_id} and type = 'final_notes' and teacher_id is null limit 1
    `;
    if (notes) {
      const bundle = await mk("bundle", `الباقة الشاملة: ${row.subject_name} ${row.grade_name.replace(/^ال/, "لل")}`, 8500, [], false, { compareAt: 10000, summary: "الدورة الكاملة + المذكرة النهائية" });
      await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${bundle}, ${course}, 0), (${bundle}, ${notes.id}, 1)`;
    }
  }
  return { created, videos: Boolean(clip) };
}

export function clipBytes(path: string) {
  return readFileSync(path);
}
