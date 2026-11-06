import "server-only";
import { z } from "zod";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";
import { AdminError } from "../admin/common";
import { PermissionError, type Actor } from "../auth/permissions";
import { teacherSubjectIds } from "../admin/teachers";
import { fieldErrors } from "@/lib/validation";
import { ar, count, type CountWord } from "@/lib/design";

const ROW: CountWord = { one: "صف", two: "صفّان", plural: "صفوف", acc: "صفًّا" };
import { cleanText, latinDigits } from "./rules";
import { parseCsv, rowsToRecords } from "./csv";
import { QUESTION_WORD } from "@/server/questions/words";

/**
 * المنهج: الكتب المدرسية ← الوحدات ← (الفصول، اختيارية) ← دروس المنهج (بنطاق صفحات).
 * الفصل يُخزَّن في صف الدرس (chapter_number و chapter_title)، وعنوانه موحّد في كل دروس الفصل.
 * يديره المالك وحده، لكل المراحل والصفوف حتى المخفية، ليبدأ المعلمون إدخال الأسئلة قبل إظهار المرحلة.
 * لا شرط هنا على مرحلة أو صف بعينه: كل شيء من stages و grades و subjects.
 */

function assertOwner(actor: Actor): asserts actor is Actor & { kind: "owner" } {
  if (actor.kind !== "owner") throw new PermissionError("إدارة المنهج متاحة لإدارة المنصة فقط");
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new AdminError("راجع الحقول المظللة", fieldErrors(r.error));
  return r.data;
}

const uuid = z.string().uuid({ error: "طلب غير صالح" });
const title = z.string().transform(cleanText).pipe(z.string().min(2, { error: "العنوان قصير" }).max(160, { error: "العنوان أطول من ١٦٠ حرفًا" }));
const number = z.coerce.number({ error: "اكتب رقمًا" }).int({ error: "اكتب رقمًا صحيحًا" }).min(1, { error: "الرقم من ١ إلى ٩٩" }).max(99, { error: "الرقم من ١ إلى ٩٩" });
const page = z.coerce.number({ error: "اكتب رقم الصفحة" }).int({ error: "رقم الصفحة عدد صحيح" }).min(1, { error: "رقم الصفحة غير صحيح" }).max(2000, { error: "رقم الصفحة غير صحيح" });
/** الفصل اختياري: فارغ = null */
const chapterNumber = z.preprocess(
  (v) => (v == null || String(v).trim() === "" ? null : latinDigits(String(v).trim())),
  z.union([z.null(), z.coerce.number({ error: "اكتب رقمًا" }).int({ error: "اكتب رقمًا صحيحًا" }).min(1, { error: "رقم الفصل من ١ إلى ٢٠" }).max(20, { error: "رقم الفصل من ١ إلى ٢٠" })]),
);
const chapterTitle = z.preprocess(
  (v) => (v == null ? "" : cleanText(String(v))),
  z.union([z.literal("").transform(() => null), z.string().min(2, { error: "عنوان الفصل قصير" }).max(160, { error: "عنوان الفصل أطول من ١٦٠ حرفًا" })]),
);
/** رقم الفصل وعنوانه معًا أو لا شيء */
function chapterPair<T extends { chapterNumber: number | null; chapterTitle: string | null }>(v: T, ctx: z.RefinementCtx) {
  if (v.chapterNumber !== null && v.chapterTitle === null) ctx.addIssue({ code: "custom", path: ["chapterTitle"], message: "اكتب عنوان الفصل" });
  if (v.chapterNumber === null && v.chapterTitle !== null) ctx.addIssue({ code: "custom", path: ["chapterNumber"], message: "اكتب رقم الفصل" });
}

/* ───────────── القراءة ───────────── */

export type TextbookRow = {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_slug: string;
  subject_published: boolean;
  grade_id: string;
  grade_name: string;
  grade_level: number;
  grade_published: boolean;
  stage_name: string;
  stage_published: boolean;
  term: 1 | 2;
  title: string;
  edition: string;
  is_current: boolean;
  rights_confirmed_at: Date | null;
  units: number;
  lessons: number;
  questions: number;
};

const TEXTBOOK_SELECT = (db: Db) => db`
  select t.id, t.subject_id, s.name as subject_name, s.slug as subject_slug, s.is_published as subject_published,
         g.id as grade_id, g.name as grade_name, g.level as grade_level, g.is_published as grade_published,
         st.name as stage_name, st.is_published as stage_published,
         t.term, t.title, t.edition, t.is_current, t.rights_confirmed_at,
         (select count(*)::int from curriculum_units u where u.textbook_id = t.id) as units,
         (select count(*)::int from curriculum_lessons l join curriculum_units u on u.id = l.unit_id where u.textbook_id = t.id) as lessons,
         (select count(*)::int from questions q join curriculum_lessons l on l.id = q.lesson_id join curriculum_units u on u.id = l.unit_id
            where u.textbook_id = t.id) as questions
  from textbooks t
  join subjects s on s.id = t.subject_id
  join grades g on g.id = s.grade_id
  join stages st on st.id = g.stage_id
`;

/** كل الكتب بترتيب المراحل والصفوف والمواد (المخفية ضمنًا) */
export async function listTextbooks(): Promise<TextbookRow[]> {
  return sql<TextbookRow[]>`
    ${TEXTBOOK_SELECT(sql)}
    order by st.sort_order, g.sort_order, g.level, s.sort_order, s.name, s.id, t.term, t.is_current desc, t.created_at desc
  `;
}

export type CurriculumLesson = {
  id: string;
  chapter_number: number | null;
  chapter_title: string | null;
  number: number;
  title: string;
  page_start: number;
  page_end: number;
  questions: number;
};
export type CurriculumUnit = { id: string; number: number; title: string; lessons: CurriculumLesson[] };

export async function getTextbook(id: string): Promise<(TextbookRow & { unitsList: CurriculumUnit[] }) | null> {
  if (!uuid.safeParse(id).success) return null;
  const [t] = await sql<TextbookRow[]>`${TEXTBOOK_SELECT(sql)} where t.id = ${id}`;
  if (!t) return null;
  const units = await sql<{ id: string; number: number; title: string }[]>`
    select id, number, title from curriculum_units where textbook_id = ${id} order by number
  `;
  const lessons = await sql<(CurriculumLesson & { unit_id: string })[]>`
    select l.id, l.unit_id, l.chapter_number, l.chapter_title, l.number, l.title, l.page_start, l.page_end,
           (select count(*)::int from questions q where q.lesson_id = l.id) as questions
    from curriculum_lessons l join curriculum_units u on u.id = l.unit_id
    where u.textbook_id = ${id} order by u.number, coalesce(l.chapter_number, 0), l.number
  `;
  return {
    ...t,
    unitsList: units.map((u) => ({ ...u, lessons: lessons.filter((l) => l.unit_id === u.id).map(({ unit_id: _u, ...l }) => l) })),
  };
}

/** خيارات المواد لنموذج الكتاب: كل المواد بكل الصفوف والمراحل، ظاهرة أو مخفية */
export async function subjectOptions(): Promise<{ id: string; label: string; hidden: boolean }[]> {
  const rows = await sql<{ id: string; subject: string; grade: string; stage: string; hidden: boolean }[]>`
    select s.id, s.name as subject, g.name as grade, st.name as stage,
           not (s.is_published and g.is_published and st.is_published) as hidden
    from subjects s join grades g on g.id = s.grade_id join stages st on st.id = g.stage_id
    order by st.sort_order, g.sort_order, g.level, s.sort_order, s.name
  `;
  return rows.map((r) => ({ id: r.id, label: `${r.subject} · ${r.grade}`, hidden: r.hidden }));
}

/* ───────────── الكتب ───────────── */

export const textbookInputSchema = z.object({
  subjectId: uuid,
  term: z.coerce.number().int().refine((v) => v === 1 || v === 2, { error: "اختر الفصل الدراسي" }),
  title,
  edition: z.string().transform(cleanText).pipe(z.string().min(1, { error: "اكتب الطبعة أو العام" }).max(60, { error: "الطبعة أطول من ٦٠ حرفًا" })),
  isCurrent: z.boolean(),
  rightsConfirmed: z.boolean(),
});
export type TextbookInput = z.input<typeof textbookInputSchema>;

export async function createTextbook(input: TextbookInput, actor: Actor, ip?: string): Promise<string> {
  assertOwner(actor);
  const v = parse(textbookInputSchema, input);
  return sql.begin(async (tx) => {
    if (v.isCurrent) await tx`update textbooks set is_current = false where subject_id = ${v.subjectId} and term = ${v.term} and is_current`;
    const [row] = await tx<{ id: string }[]>`
      insert into textbooks (subject_id, term, title, edition, is_current, rights_confirmed_at, rights_confirmed_by, created_by)
      values (${v.subjectId}, ${v.term}, ${v.title}, ${v.edition}, ${v.isCurrent},
              case when ${v.rightsConfirmed} then now() end, case when ${v.rightsConfirmed} then ${actor.userId}::uuid end, ${actor.userId})
      returning id
    `;
    await audit({ actorId: actor.userId, action: "curriculum.textbook_create", entityType: "textbook", entityId: row.id, metadata: { subjectId: v.subjectId, term: v.term }, ip }, tx);
    return row.id;
  });
}

export async function updateTextbook(id: string, input: Omit<TextbookInput, "subjectId" | "term">, actor: Actor, ip?: string): Promise<void> {
  assertOwner(actor);
  const v = parse(textbookInputSchema.omit({ subjectId: true, term: true }), input);
  await sql.begin(async (tx) => {
    const [t] = await tx<{ subject_id: string; term: number }[]>`select subject_id, term from textbooks where id = ${id} for update`;
    if (!t) throw new AdminError("الكتاب غير موجود");
    if (v.isCurrent) await tx`update textbooks set is_current = false where subject_id = ${t.subject_id} and term = ${t.term} and is_current and id <> ${id}`;
    await tx`
      update textbooks set title = ${v.title}, edition = ${v.edition}, is_current = ${v.isCurrent},
        rights_confirmed_at = case when ${v.rightsConfirmed} then coalesce(rights_confirmed_at, now()) end,
        rights_confirmed_by = case when ${v.rightsConfirmed} then coalesce(rights_confirmed_by, ${actor.userId}::uuid) end
      where id = ${id}
    `;
    await audit({ actorId: actor.userId, action: "curriculum.textbook_update", entityType: "textbook", entityId: id, ip }, tx);
  });
}

/* ───────────── الوحدات والدروس ───────────── */

export const unitInputSchema = z.object({ textbookId: uuid, number, title });
export async function saveUnit(input: z.input<typeof unitInputSchema> & { id?: string }, actor: Actor, ip?: string): Promise<string> {
  assertOwner(actor);
  const v = parse(unitInputSchema, input);
  if (input.id) {
    if (!uuid.safeParse(input.id).success) throw new AdminError("طلب غير صالح");
    const rows = await sql`update curriculum_units set number = ${v.number}, title = ${v.title} where id = ${input.id} and textbook_id = ${v.textbookId} returning id`;
    if (!rows.length) throw new AdminError("الوحدة غير موجودة");
    await audit({ actorId: actor.userId, action: "curriculum.unit_update", entityType: "textbook", entityId: v.textbookId, metadata: { unitId: input.id }, ip });
    return input.id;
  }
  const [row] = await sql<{ id: string }[]>`insert into curriculum_units (textbook_id, number, title) values (${v.textbookId}, ${v.number}, ${v.title}) returning id`;
  await audit({ actorId: actor.userId, action: "curriculum.unit_create", entityType: "textbook", entityId: v.textbookId, metadata: { unitId: row.id }, ip });
  return row.id;
}

async function questionsOutsideRange(db: Db, lessonId: string, start: number, end: number): Promise<number> {
  const [{ n }] = await db<{ n: number }[]>`
    select count(*)::int as n from questions where lesson_id = ${lessonId} and (page < ${start} or page > ${end})
  `;
  return n;
}

export const lessonInputSchema = z
  .object({ unitId: uuid, chapterNumber, chapterTitle, number, title, pageStart: page, pageEnd: page })
  .superRefine(chapterPair)
  .refine((l) => l.pageEnd >= l.pageStart, { path: ["pageEnd"], error: "صفحة النهاية قبل صفحة البداية" });

/** دروس الوحدة كلها بفصول أو كلها بلا فصول: الخلط يجعل الترقيم والمرجع ملتبسين */
async function mixedChapters(db: Db, unitId: string, withChapter: boolean, exceptId?: string): Promise<boolean> {
  const [row] = await db`
    select 1 from curriculum_lessons
    where unit_id = ${unitId} and (chapter_number is not null) <> ${withChapter} ${exceptId ? db`and id <> ${exceptId}` : db``}
    limit 1
  `;
  return Boolean(row);
}

/** الفصل اختياري في المدخلات (غيابه = كتاب بلا فصول) */
export type LessonInput = Omit<z.input<typeof lessonInputSchema>, "chapterNumber" | "chapterTitle"> & {
  chapterNumber?: string | number | null;
  chapterTitle?: string | null;
  id?: string;
};

export async function saveLesson(input: LessonInput, actor: Actor, ip?: string): Promise<string> {
  assertOwner(actor);
  const v = parse(lessonInputSchema, input);
  return sql.begin(async (tx) => {
    let id = input.id;
    if (id && !uuid.safeParse(id).success) throw new AdminError("طلب غير صالح");
    if (await mixedChapters(tx, v.unitId, v.chapterNumber !== null, id)) {
      throw v.chapterNumber === null
        ? new AdminError("دروس هذه الوحدة مقسّمة إلى فصول", { chapterNumber: "اكتب رقم الفصل كما في الكتاب" })
        : new AdminError("دروس هذه الوحدة بلا فصول", { chapterNumber: "اترك الفصل فارغًا في هذه الوحدة" });
    }
    if (id) {
      const outside = await questionsOutsideRange(tx, id, v.pageStart, v.pageEnd);
      if (outside) throw new AdminError(`لا يمكن تضييق نطاق الصفحات: ${count(outside, QUESTION_WORD)} من الدرس خارج النطاق الجديد`);
      const rows = await tx`
        update curriculum_lessons set chapter_number = ${v.chapterNumber}, chapter_title = ${v.chapterTitle},
          number = ${v.number}, title = ${v.title}, page_start = ${v.pageStart}, page_end = ${v.pageEnd}
        where id = ${id} and unit_id = ${v.unitId} returning id
      `;
      if (!rows.length) throw new AdminError("الدرس غير موجود");
    } else {
      [{ id }] = await tx<{ id: string }[]>`
        insert into curriculum_lessons (unit_id, chapter_number, chapter_title, number, title, page_start, page_end)
        values (${v.unitId}, ${v.chapterNumber}, ${v.chapterTitle}, ${v.number}, ${v.title}, ${v.pageStart}, ${v.pageEnd}) returning id
      `;
    }
    // عنوان الفصل واحد في كل دروسه: تعديله من أي درس يعدّله في البقية
    if (v.chapterNumber !== null) {
      await tx`
        update curriculum_lessons set chapter_title = ${v.chapterTitle}
        where unit_id = ${v.unitId} and chapter_number = ${v.chapterNumber} and chapter_title <> ${v.chapterTitle}
      `;
    }
    const [{ textbook_id }] = await tx<{ textbook_id: string }[]>`select textbook_id from curriculum_units where id = ${v.unitId}`;
    await audit({ actorId: actor.userId, action: input.id ? "curriculum.lesson_update" : "curriculum.lesson_create", entityType: "textbook", entityId: textbook_id, metadata: { lessonId: id }, ip }, tx);
    return id!;
  });
}

/** الحذف ممنوع متى وُجد سؤال في الدرس (أيًّا كانت حالته)؛ القاعدة تمنعه أيضًا (on delete restrict) */
export async function deleteLesson(id: string, actor: Actor, ip?: string): Promise<void> {
  assertOwner(actor);
  if (!uuid.safeParse(id).success) throw new AdminError("طلب غير صالح");
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from questions where lesson_id = ${id}`;
  if (n) throw new AdminError("لا يمكن حذف درس فيه أسئلة");
  const rows = await sql<{ textbook_id: string }[]>`
    delete from curriculum_lessons l using curriculum_units u where l.id = ${id} and u.id = l.unit_id returning u.textbook_id
  `;
  if (!rows.length) throw new AdminError("الدرس غير موجود");
  await audit({ actorId: actor.userId, action: "curriculum.lesson_delete", entityType: "textbook", entityId: rows[0].textbook_id, metadata: { lessonId: id }, ip });
}

export async function deleteUnit(id: string, actor: Actor, ip?: string): Promise<void> {
  assertOwner(actor);
  if (!uuid.safeParse(id).success) throw new AdminError("طلب غير صالح");
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from questions q join curriculum_lessons l on l.id = q.lesson_id where l.unit_id = ${id}
  `;
  if (n) throw new AdminError("لا يمكن حذف وحدة فيها أسئلة");
  const rows = await sql<{ textbook_id: string }[]>`delete from curriculum_units where id = ${id} returning textbook_id`;
  if (!rows.length) throw new AdminError("الوحدة غير موجودة");
  await audit({ actorId: actor.userId, action: "curriculum.unit_delete", entityType: "textbook", entityId: rows[0].textbook_id, metadata: { unitId: id }, ip });
}

/* ───────────── استيراد فهرس الكتاب (CSV) ───────────── */

export const TOC_COLUMNS = ["unit_number", "unit_title", "lesson_number", "lesson_title", "page_start", "page_end"] as const;
/** اختياريان: للكتب التي تقسّم الوحدة إلى فصول (يُتركان فارغين لغيرها، أو يُحذف العمودان) */
export const TOC_CHAPTER_COLUMNS = ["chapter_number", "chapter_title"] as const;

export type TocRow = {
  line: number;
  unitNumber: number;
  unitTitle: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  lessonNumber: number;
  lessonTitle: string;
  pageStart: number;
  pageEnd: number;
};
export type TocPreview = {
  rows: (TocRow & { action: "create" | "update" | "same"; errors: string[] })[];
  fileError?: string;
  summary: { units: number; lessonsCreate: number; lessonsUpdate: number; errors: number };
};

const tocRowSchema = z
  .object({ unitNumber: number, unitTitle: title, chapterNumber, chapterTitle, lessonNumber: number, lessonTitle: title, pageStart: page, pageEnd: page })
  .superRefine(chapterPair);

/** تشغيل تجريبي: يتحقق من كل صف ويقارن بالموجود دون أي كتابة (قراءة فقط: المستدعي يتحقق من أنه المالك) */
export async function previewTocImport(textbookId: string, text: string): Promise<TocPreview> {
  const empty: TocPreview = { rows: [], summary: { units: 0, lessonsCreate: 0, lessonsUpdate: 0, errors: 1 } };
  const parsed = parseCsv(text);
  if ("error" in parsed) return { ...empty, fileError: parsed.line ? `السطر ${ar(parsed.line)}: ${parsed.error}` : parsed.error };
  const recs = rowsToRecords(parsed.rows, TOC_COLUMNS, parsed.lines);
  if ("error" in recs) return { ...empty, fileError: recs.error };

  const existing = await getTextbook(textbookId);
  if (!existing) return { ...empty, fileError: "الكتاب غير موجود" };
  /** عنوان كل وحدة (وكل فصل) كما ورد أول مرة في الملف: تكراره بعنوان آخر خطأ */
  const fileUnitTitles = new Map<number, string>();
  const fileChapterTitles = new Map<string, string>();
  /** هل دروس الوحدة في الملف بفصول؟ (أول صف سليم يحدّد) */
  const fileUnitChaptered = new Map<number, boolean>();
  const seenLessons = new Set<string>();
  const out: TocPreview["rows"] = [];
  for (const { line, data } of recs.records) {
    const errors: string[] = [];
    const r = tocRowSchema.safeParse({
      unitNumber: latinDigits(data.unit_number), unitTitle: data.unit_title,
      chapterNumber: data.chapter_number ?? "", chapterTitle: data.chapter_title ?? "",
      lessonNumber: latinDigits(data.lesson_number), lessonTitle: data.lesson_title,
      pageStart: latinDigits(data.page_start), pageEnd: latinDigits(data.page_end),
    });
    if (!r.success) {
      const fe = fieldErrors(r.error);
      out.push({
        line, unitNumber: 0, unitTitle: data.unit_title ?? "", chapterNumber: null, chapterTitle: data.chapter_title || null,
        lessonNumber: 0, lessonTitle: data.lesson_title ?? "", pageStart: 0, pageEnd: 0, action: "create", errors: Object.values(fe),
      });
      continue;
    }
    const v = r.data;
    if (v.pageEnd < v.pageStart) errors.push("صفحة النهاية قبل صفحة البداية");
    const firstTitle = fileUnitTitles.get(v.unitNumber);
    if (firstTitle === undefined) fileUnitTitles.set(v.unitNumber, v.unitTitle);
    else if (firstTitle !== v.unitTitle) errors.push(`عنوان الوحدة ${ar(v.unitNumber)} يختلف عن صف سابق في الملف`);
    const chaptered = v.chapterNumber !== null;
    if (chaptered) {
      const ck = `${v.unitNumber}:${v.chapterNumber}`;
      const firstChapter = fileChapterTitles.get(ck);
      if (firstChapter === undefined) fileChapterTitles.set(ck, v.chapterTitle!);
      else if (firstChapter !== v.chapterTitle) errors.push(`عنوان الفصل ${ar(v.chapterNumber!)} يختلف عن صف سابق في الملف`);
    }
    const unitChaptered = fileUnitChaptered.get(v.unitNumber);
    if (unitChaptered === undefined) fileUnitChaptered.set(v.unitNumber, chaptered);
    else if (unitChaptered !== chaptered) errors.push(`دروس الوحدة ${ar(v.unitNumber)} في الملف بعضها بفصول وبعضها بلا فصول`);
    const key = `${v.unitNumber}:${v.chapterNumber ?? 0}:${v.lessonNumber}`;
    if (seenLessons.has(key)) errors.push("الدرس مكرر في الملف");
    seenLessons.add(key);
    const unit = existing.unitsList.find((u) => u.number === v.unitNumber);
    if (unit?.lessons.some((l) => (l.chapter_number !== null) !== chaptered)) {
      errors.push(chaptered ? `دروس الوحدة ${ar(v.unitNumber)} المحفوظة بلا فصول` : `دروس الوحدة ${ar(v.unitNumber)} المحفوظة مقسّمة إلى فصول`);
    }
    const lesson = unit?.lessons.find((l) => (l.chapter_number ?? 0) === (v.chapterNumber ?? 0) && l.number === v.lessonNumber);
    let action: "create" | "update" | "same" = "create";
    if (lesson) {
      const same =
        lesson.title === v.lessonTitle && lesson.page_start === v.pageStart && lesson.page_end === v.pageEnd &&
        lesson.chapter_title === v.chapterTitle && unit!.title === v.unitTitle;
      action = same ? "same" : "update";
      if (!same) {
        const outside = await questionsOutsideRange(sql, lesson.id, v.pageStart, v.pageEnd);
        if (outside) errors.push(`${count(outside, QUESTION_WORD)} من الدرس ستصبح خارج نطاق الصفحات`);
      }
    }
    out.push({ line, ...v, action, errors });
  }
  return {
    rows: out,
    summary: {
      units: new Set(out.filter((o) => !o.errors.length).map((o) => o.unitNumber)).size,
      lessonsCreate: out.filter((o) => !o.errors.length && o.action === "create").length,
      lessonsUpdate: out.filter((o) => !o.errors.length && o.action === "update").length,
      errors: out.filter((o) => o.errors.length).length,
    },
  };
}

/** التطبيق: يرفض الملف كله إن وُجد أي خطأ، ثم ينشئ ويحدّث في معاملة واحدة */
export async function applyTocImport(textbookId: string, text: string, actor: Actor, ip?: string): Promise<TocPreview["summary"]> {
  assertOwner(actor);
  const preview = await previewTocImport(textbookId, text);
  if (preview.fileError) throw new AdminError(preview.fileError);
  if (preview.summary.errors) throw new AdminError(`في الملف أخطاء في ${count(preview.summary.errors, ROW)}. صحّحها ثم أعد المحاولة.`);
  await sql.begin(async (tx) => {
    for (const r of preview.rows) {
      if (r.action === "same") continue;
      const [unit] = await tx<{ id: string }[]>`
        insert into curriculum_units (textbook_id, number, title) values (${textbookId}, ${r.unitNumber}, ${r.unitTitle})
        on conflict (textbook_id, number) do update set title = excluded.title
        returning id
      `;
      await tx`
        insert into curriculum_lessons (unit_id, chapter_number, chapter_title, number, title, page_start, page_end)
        values (${unit.id}, ${r.chapterNumber}, ${r.chapterTitle}, ${r.lessonNumber}, ${r.lessonTitle}, ${r.pageStart}, ${r.pageEnd})
        on conflict (unit_id, (coalesce(chapter_number, 0)), number)
        do update set chapter_title = excluded.chapter_title, title = excluded.title, page_start = excluded.page_start, page_end = excluded.page_end
      `;
      // دروس الفصل المحفوظة غير الواردة في الملف تأخذ عنوانه الجديد
      if (r.chapterNumber !== null) {
        await tx`
          update curriculum_lessons set chapter_title = ${r.chapterTitle}
          where unit_id = ${unit.id} and chapter_number = ${r.chapterNumber} and chapter_title <> ${r.chapterTitle}
        `;
      }
    }
    await audit({ actorId: actor.userId, action: "curriculum.toc_import", entityType: "textbook", entityId: textbookId, metadata: preview.summary, ip }, tx);
  });
  return preview.summary;
}

/* ───────────── للنماذج والتحقق ───────────── */

export type LessonContext = {
  lesson_id: string;
  chapter_number: number | null;
  chapter_title: string | null;
  lesson_number: number;
  lesson_title: string;
  page_start: number;
  page_end: number;
  unit_number: number;
  unit_title: string;
  textbook_id: string;
  textbook_title: string;
  textbook_current: boolean;
  term: 1 | 2;
  subject_id: string;
  subject_name: string;
  grade_name: string;
};

export async function lessonContext(lessonId: string, db: Db = sql): Promise<LessonContext | null> {
  if (!uuid.safeParse(lessonId).success) return null;
  const [row] = await db<LessonContext[]>`
    select l.id as lesson_id, l.chapter_number, l.chapter_title, l.number as lesson_number, l.title as lesson_title, l.page_start, l.page_end,
           u.number as unit_number, u.title as unit_title, t.id as textbook_id, t.title as textbook_title, t.is_current as textbook_current,
           t.term, s.id as subject_id, s.name as subject_name, g.name as grade_name
    from curriculum_lessons l
    join curriculum_units u on u.id = l.unit_id
    join textbooks t on t.id = u.textbook_id
    join subjects s on s.id = t.subject_id
    join grades g on g.id = s.grade_id
    where l.id = ${lessonId}
  `;
  return row ?? null;
}

export type CurriculumOption = {
  textbookId: string;
  label: string;
  subjectId: string;
  units: {
    id: string;
    number: number;
    title: string;
    lessons: { id: string; chapterNumber: number | null; chapterTitle: string | null; number: number; title: string; pageStart: number; pageEnd: number }[];
  }[];
};

/** شجرة الكتب الحالية التي يحق للفاعل إدخال أسئلة فيها: المالك كلها، والمعلم مواده فقط */
export async function curriculumOptions(actor: Actor): Promise<CurriculumOption[]> {
  const subjects = actor.kind === "teacher" ? await teacherSubjectIds(actor.teacherId) : null;
  if (subjects && !subjects.length) return [];
  const rows = await sql<
    { textbook_id: string; textbook_title: string; edition: string; term: number; subject_id: string; subject_name: string; grade_name: string; unit_id: string | null; unit_number: number | null; unit_title: string | null; lesson_id: string | null; chapter_number: number | null; chapter_title: string | null; lesson_number: number | null; lesson_title: string | null; page_start: number | null; page_end: number | null }[]
  >`
    select t.id as textbook_id, t.title as textbook_title, t.edition, t.term, s.id as subject_id, s.name as subject_name, g.name as grade_name,
           u.id as unit_id, u.number as unit_number, u.title as unit_title,
           l.id as lesson_id, l.chapter_number, l.chapter_title, l.number as lesson_number, l.title as lesson_title, l.page_start, l.page_end
    from textbooks t
    join subjects s on s.id = t.subject_id
    join grades g on g.id = s.grade_id
    join stages st on st.id = g.stage_id
    left join curriculum_units u on u.textbook_id = t.id
    left join curriculum_lessons l on l.unit_id = u.id
    where t.is_current ${subjects ? sql`and t.subject_id = any(${subjects}::uuid[])` : sql``}
    order by st.sort_order, g.sort_order, g.level, s.sort_order, t.term, u.number, coalesce(l.chapter_number, 0), l.number
  `;
  const out: CurriculumOption[] = [];
  for (const r of rows) {
    let tb = out.find((o) => o.textbookId === r.textbook_id);
    if (!tb) {
      tb = { textbookId: r.textbook_id, label: `${r.subject_name} · ${r.grade_name} · ${r.term === 1 ? "الفصل الأول" : "الفصل الثاني"}`, subjectId: r.subject_id, units: [] };
      out.push(tb);
    }
    if (!r.unit_id) continue;
    let unit = tb.units.find((u) => u.id === r.unit_id);
    if (!unit) {
      unit = { id: r.unit_id, number: r.unit_number!, title: r.unit_title!, lessons: [] };
      tb.units.push(unit);
    }
    if (r.lesson_id) {
      unit.lessons.push({
        id: r.lesson_id, chapterNumber: r.chapter_number, chapterTitle: r.chapter_title,
        number: r.lesson_number!, title: r.lesson_title!, pageStart: r.page_start!, pageEnd: r.page_end!,
      });
    }
  }
  return out;
}
