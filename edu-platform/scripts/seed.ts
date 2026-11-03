/**
 * بذر البيانات الأساسية (آمن للتكرار):
 *   npm run db:seed          → الهيكل الدراسي فقط (المرحلة المتوسطة منشورة، والمرحلتان الأخريان مخفيتان)
 *   npm run db:seed:demo     → + منتجات تعليمية تجريبية أصلية كمسودات (لا تُنشر تلقائيًا)
 *   npm run db:seed -- --demo --publish   → للعرض المحلي فقط: نشر المنتجات التجريبية
 */
import postgres from "postgres";
import { loadEnvFile } from "./_env";
import { buildDemoPdf, closeDemoBrowser } from "./demo-pdf";
import { seedDemoTeachers } from "./demo-teachers";
import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

loadEnvFile();

type SubjectDef = { slug: string; name: string; icon: string };

export const STAGES = [
  { slug: "primary", name: "المرحلة الابتدائية", description: "الصفوف من الأول إلى الخامس", sort: 1, published: false, levels: [1, 2, 3, 4, 5] },
  { slug: "intermediate", name: "المرحلة المتوسطة", description: "الصفوف من السادس إلى التاسع", sort: 2, published: true, levels: [6, 7, 8, 9] },
  { slug: "secondary", name: "المرحلة الثانوية", description: "الصفوف من العاشر إلى الثاني عشر", sort: 3, published: false, levels: [10, 11, 12] },
];

export const GRADE_NAMES: Record<number, string> = {
  1: "الصف الأول",
  2: "الصف الثاني",
  3: "الصف الثالث",
  4: "الصف الرابع",
  5: "الصف الخامس",
  6: "الصف السادس",
  7: "الصف السابع",
  8: "الصف الثامن",
  9: "الصف التاسع",
  10: "الصف العاشر",
  11: "الصف الحادي عشر",
  12: "الصف الثاني عشر",
};

/** مواد المرحلة المتوسطة في الكويت */
export const INTERMEDIATE_SUBJECTS: SubjectDef[] = [
  { slug: "arabic", name: "اللغة العربية", icon: "book-open" },
  { slug: "english", name: "اللغة الإنجليزية", icon: "languages" },
  { slug: "math", name: "الرياضيات", icon: "calculator" },
  { slug: "science", name: "العلوم", icon: "flask" },
  { slug: "islamic", name: "التربية الإسلامية", icon: "moon" },
  { slug: "social", name: "الاجتماعيات", icon: "globe" },
];

export async function seedStructure(sql: postgres.Sql) {
  for (const st of STAGES) {
    const [stage] = await sql<{ id: string }[]>`
      insert into stages (slug, name, description, sort_order, is_published)
      values (${st.slug}, ${st.name}, ${st.description}, ${st.sort}, ${st.published})
      on conflict (slug) do update set name = excluded.name
      returning id
    `;
    for (const level of st.levels) {
      const [grade] = await sql<{ id: string }[]>`
        insert into grades (stage_id, slug, name, level, sort_order, is_published, current_term)
        values (${stage.id}, ${`grade-${level}`}, ${GRADE_NAMES[level]}, ${level}, ${level}, ${st.published}, 1)
        on conflict (slug) do update set name = excluded.name
        returning id
      `;
      if (st.slug !== "intermediate") continue;
      let i = 0;
      for (const sub of INTERMEDIATE_SUBJECTS) {
        await sql`
          insert into subjects (grade_id, slug, name, icon, sort_order, is_published)
          values (${grade.id}, ${sub.slug}, ${sub.name}, ${sub.icon}, ${i++}, true)
          on conflict (grade_id, slug) do nothing
        `;
      }
    }
  }
}

type DemoDef = {
  level: number;
  subject: string;
  type: "final_notes" | "exam_night" | "exam_model" | "answer_key" | "review_notes";
  title: string;
  price: number;
  compareAt?: number;
  term: 1 | 2;
  downloadable?: boolean;
};

const TYPE_TITLES: Record<DemoDef["type"], string> = {
  final_notes: "المذكرة النهائية",
  exam_night: "مذكرة ليلة الاختبار",
  exam_model: "نماذج اختبارات",
  answer_key: "نماذج الإجابة",
  review_notes: "مذكرة الشرح والمراجعة",
};

function demoDefs(): DemoDef[] {
  const out: DemoDef[] = [];
  for (const level of [6, 7, 8, 9]) {
    for (const sub of INTERMEDIATE_SUBJECTS) {
      out.push({ level, subject: sub.slug, type: "final_notes", title: `${TYPE_TITLES.final_notes} لمادة ${sub.name}`, price: 3000, compareAt: 4000, term: 1 });
      if (["math", "science", "arabic", "english"].includes(sub.slug)) {
        out.push({ level, subject: sub.slug, type: "exam_night", title: `${TYPE_TITLES.exam_night} لمادة ${sub.name}`, price: 1500, term: 1 });
        out.push({ level, subject: sub.slug, type: "exam_model", title: `${TYPE_TITLES.exam_model} لمادة ${sub.name}`, price: 2000, term: 1, downloadable: true });
        out.push({ level, subject: sub.slug, type: "answer_key", title: `${TYPE_TITLES.answer_key} لمادة ${sub.name}`, price: 1000, term: 1 });
      }
    }
  }
  return out;
}

const SUBJECT_EN: Record<string, string> = { arabic: "arabic", english: "english", math: "math", science: "science", islamic: "islamic", social: "social" };

export async function seedDemo(sql: postgres.Sql, opts: { publish: boolean; storageDir: string; academicYear: string }) {
  const grades = await sql<{ id: string; level: number }[]>`select id, level from grades where level between 6 and 9`;
  const subjects = await sql<{ id: string; slug: string; grade_id: string; name: string }[]>`select id, slug, grade_id, name from subjects`;
  const status = opts.publish ? "published" : "draft";
  let created = 0;
  const pdfCache = new Map<string, Uint8Array>();

  for (const d of demoDefs()) {
    const grade = grades.find((g) => g.level === d.level);
    const subject = subjects.find((s) => s.grade_id === grade?.id && s.slug === d.subject);
    if (!grade || !subject) continue;
    const slug = `g${d.level}-${SUBJECT_EN[d.subject]}-${d.type.replace("_", "-")}-t${d.term}`;
    const exists = await sql`select 1 from products where slug = ${slug}`;
    if (exists.length) continue;

    const cacheKey = `${d.level}-${d.subject}-${d.type}`;
    let pdf = pdfCache.get(cacheKey);
    if (!pdf) {
      pdf = await buildDemoPdf({ gradeName: GRADE_NAMES[d.level], subjectName: subject.name, typeTitle: TYPE_TITLES[d.type], pages: d.type === "final_notes" ? 8 : 5 });
      pdfCache.set(cacheKey, pdf);
    }
    const pageCount = (await PDFDocument.load(pdf)).getPageCount();
    const [product] = await sql<{ id: string }[]>`
      insert into products (slug, type, title, summary, description, contents, grade_id, subject_id, academic_year, term,
                            price_fils, compare_at_price_fils, status, is_downloadable, preview_pages, page_count, published_at, sort_order)
      values (${slug}, ${d.type}, ${d.title},
        ${`ملخص منظم لمادة ${subject.name} في ${GRADE_NAMES[d.level]}`},
        ${`محتوى تجريبي أصلي لأغراض العرض والاختبار. يحتوي على شرح مختصر وأمثلة محلولة وتدريبات لمادة ${subject.name}.`},
        ${"شرح مختصر لكل درس\nأمثلة محلولة خطوة بخطوة\nتدريبات متنوعة مع الإجابات\nأسئلة متوقعة للاختبار"},
        ${grade.id}, ${subject.id}, ${opts.academicYear}, ${d.term}, ${d.price}, ${d.compareAt ?? null}, ${status},
        ${d.downloadable ?? false}, 2, ${pageCount}, ${opts.publish ? new Date() : null}, ${created})
      returning id
    `;
    // حفظ الملفات في التخزين المحلي الخاص
    const mainKey = `products/${product.id}/${randomUUID()}.pdf`;
    writePrivate(opts.storageDir, mainKey, pdf);
    await sql`
      insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count)
      values (${product.id}, 'main', ${d.title}, ${mainKey}, 'demo.pdf', 'application/pdf', ${pdf.length}, ${pageCount})
    `;
    const src = await PDFDocument.load(pdf);
    const prev = await PDFDocument.create();
    for (const p of await prev.copyPages(src, [0, 1])) prev.addPage(p);
    const prevBytes = await prev.save();
    const prevKey = `previews/${product.id}/${randomUUID()}.pdf`;
    writePrivate(opts.storageDir, prevKey, prevBytes);
    await sql`
      insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, is_auto_preview)
      values (${product.id}, 'preview', 'معاينة مجانية', ${prevKey}, 'preview.pdf', 'application/pdf', ${prevBytes.length}, 2, true)
    `;
    created++;
  }

  // باقة لكل صف تضم المذكرات النهائية للفصل الأول
  for (const g of grades) {
    const slug = `g${g.level}-final-bundle-t1`;
    const exists = await sql`select 1 from products where slug = ${slug}`;
    if (exists.length) continue;
    const items = await sql<{ id: string; price_fils: number }[]>`
      select id, price_fils from products where grade_id = ${g.id} and type = 'final_notes' and term = 1
    `;
    if (items.length < 2) continue;
    const sum = items.reduce((s, i) => s + i.price_fils, 0);
    const [bundle] = await sql<{ id: string }[]>`
      insert into products (slug, type, title, summary, description, contents, grade_id, academic_year, term, price_fils,
                            compare_at_price_fils, status, is_featured, published_at)
      values (${slug}, 'bundle', ${`باقة المذكرات النهائية ${GRADE_NAMES[g.level].replace(/^ال/, "لل")}`},
        ${"كل المذكرات النهائية للفصل الأول بسعر واحد"},
        ${"باقة تجريبية تجمع المذكرات النهائية لكل مواد الصف للفصل الدراسي الأول."},
        ${"جميع المذكرات النهائية لمواد الصف\nوصول فوري بعد الدفع\nتحديثات المذكرات ضمن الباقة"},
        ${g.id}, ${opts.academicYear}, 1, ${Math.round((sum * 0.7) / 500) * 500}, ${sum}, ${status}, true, ${opts.publish ? new Date() : null})
      returning id
    `;
    let i = 0;
    for (const it of items) await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${bundle.id}, ${it.id}, ${i++})`;
    created++;
  }
  return created;
}

function writePrivate(storageDir: string, key: string, data: Uint8Array) {
  const full = resolve(storageDir, "private", key);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL غير مضبوط");
  const args = process.argv.slice(2);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await seedStructure(sql);
    console.log("✔ الهيكل الدراسي جاهز (المرحلة المتوسطة منشورة)");
    if (args.includes("--demo")) {
      if ((process.env.STORAGE_DRIVER ?? "local") !== "local") {
        throw new Error("البيانات التجريبية تُنشأ مع التخزين المحلي فقط");
      }
      const n = await seedDemo(sql, {
        publish: args.includes("--publish"),
        storageDir: join(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? "storage"),
        academicYear: "2026-2027",
      });
      console.log(`✔ تمت إضافة ${n} منتجًا تجريبيًا ${args.includes("--publish") ? "(منشورة)" : "(كمسودات)"}`);
      const t = await seedDemoTeachers(sql, {
        publish: args.includes("--publish"),
        storageDir: join(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? "storage"),
        academicYear: "2026-2027",
      });
      console.log(`✔ معلمون تجريبيون: ${t.created} منتج فيديو${t.videos ? "" : " (بدون مقاطع — ffmpeg غير متوفر)"}`);
    }
  } finally {
    await closeDemoBrowser();
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
