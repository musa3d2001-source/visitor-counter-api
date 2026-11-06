import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { hashPassword } from "../../src/server/auth/password-core";
import { db, expectNoHorizontalOverflow, login, loginAdmin } from "./helpers";

/**
 * اللعبة وبنك أسئلة الكتاب.
 * المرحلة ١ (بنك الأسئلة):
 *  أ) المالك يضيف كتاب العلوم للصف السابع ← يلصق فهرس الكتاب (وحدتان وثلاثة دروس) ← تشغيل تجريبي ← تطبيق ← تظهر الدروس.
 *  ب) معلم بحساب دخول (يُنشأ مباشرة في القاعدة) يكتب سؤال اختيار من متعدد في درس من الكتاب ← مسودة ← إرسال للمراجعة،
 *     ولا يصل لصفحات المنهج.
 *  ج) المالك يراجع السؤال من تبويب «الأسئلة» ويعتمده وينشره، وتبويب المحتوى في صفحة المراجعة يبقى كما كان.
 *  د) على الجوال (390): صفحات المنهج وبنك الأسئلة بلا تمرير أفقي.
 * السيناريوهات أ وب وج متتابعة؛ وإن شُغّل أحدها وحده (أو فشل ما قبله) أنشأ ما يحتاجه مباشرة في القاعدة.
 * قاعدة E2E مشتركة بين المشاريع، فكل الأسماء فريدة بختم زمني.
 * سيناريوهات اللعبة نفسها تُضاف لاحقًا في هذا الملف.
 */

type Lesson = { id: string; unitId: string; unitNumber: number; number: number; title: string; pageStart: number; pageEnd: number };
type Book = { id: string; title: string; lessons: Lesson[] };
type TeacherAccount = { id: string; userId: string; email: string; password: string; name: string };

/** فهرس تجريبي من تأليفنا (لا من كتاب حقيقي): وحدتان وثلاثة دروس */
const TOC = [
  { unit: 1, unitTitle: "المادة وخصائصها", lesson: 1, title: "حالات المادة", start: 10, end: 17 },
  { unit: 1, unitTitle: "المادة وخصائصها", lesson: 2, title: "التغيرات الفيزيائية والكيميائية", start: 18, end: 25 },
  { unit: 2, unitTitle: "الطاقة وتحولاتها", lesson: 1, title: "أشكال الطاقة", start: 40, end: 48 },
] as const;

const TOC_CSV = [
  "unit_number,unit_title,lesson_number,lesson_title,page_start,page_end",
  ...TOC.map((r) => `${r.unit},${r.unitTitle},${r.lesson},${r.title},${r.start},${r.end}`),
].join("\n");

/** الوحدات بترتيبها مع دروسها (لفحص العرض بعد الاستيراد) */
const TOC_UNITS = [...new Set(TOC.map((r) => r.unit))].map((n) => ({
  number: n,
  title: TOC.find((r) => r.unit === n)!.unitTitle,
  lessons: TOC.filter((r) => r.unit === n).map((r) => r.title),
}));

/** الفصل الثاني عمدًا: لا يزاحم كتابًا تجريبيًا للفصل الحالي (الأول) إن أضافته بيانات البذر لاحقًا */
const TERM = 2;

/** سؤال الاختبار (اختيار من متعدد) في درس «حالات المادة» */
const CHOICES = ["حجمه فقط", "شكله فقط", "شكله وحجمه معًا", "لم يتغير شيء"] as const;
const CORRECT = 1;
const EXPLANATION = "السائل يحافظ على حجمه لأن جزيئاته متقاربة، لكنها تنزلق بعضها فوق بعض فيأخذ شكل الإناء الجديد. لذلك تغيّر الشكل وبقي الحجم.";
const HINT = "فكّر في كمية العصير قبل السكب وبعده.";

/** الأرقام العربية كما تعرضها الواجهة */
const ar = (n: number | string) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

/** حالة مشتركة بين سيناريوهات الملف (تُفقد إن أُعيد تشغيل العامل بعد فشل، فتُستعمل البدائل المباشرة) */
const shared: { teacher?: TeacherAccount; book?: Book; question?: { id: string; stem: string } } = {};

async function scienceGrade7Id(): Promise<string> {
  const [s] = await db()<{ id: string }[]>`
    select s.id from subjects s join grades g on g.id = s.grade_id where g.level = 7 and s.slug = 'science'
  `;
  return s.id;
}

async function loadBook(id: string): Promise<Book> {
  const [t] = await db()<{ id: string; title: string }[]>`select id, title from textbooks where id = ${id}`;
  const rows = await db()<{ id: string; unit_id: string; unit_number: number; number: number; title: string; page_start: number; page_end: number }[]>`
    select l.id, l.unit_id, u.number as unit_number, l.number, l.title, l.page_start, l.page_end
    from curriculum_lessons l join curriculum_units u on u.id = l.unit_id
    where u.textbook_id = ${id}
    order by u.number, l.number
  `;
  return {
    id: t.id,
    title: t.title,
    lessons: rows.map((r) => ({ id: r.id, unitId: r.unit_id, unitNumber: r.unit_number, number: r.number, title: r.title, pageStart: r.page_start, pageEnd: r.page_end })),
  };
}

/** بديل مباشر في القاعدة لسيناريو المالك: كتاب حالي بالفهرس نفسه */
async function bookViaDb(): Promise<Book> {
  const subjectId = await scienceGrade7Id();
  const title = `كتاب العلوم للاختبار ${Date.now() % 100000}`;
  await db()`update textbooks set is_current = false where subject_id = ${subjectId} and term = ${TERM} and is_current`;
  const [tb] = await db()<{ id: string }[]>`
    insert into textbooks (subject_id, term, title, edition, is_current, rights_confirmed_at)
    values (${subjectId}, ${TERM}, ${title}, '2026-2027', true, now())
    returning id
  `;
  for (const r of TOC) {
    const [u] = await db()<{ id: string }[]>`
      insert into curriculum_units (textbook_id, number, title) values (${tb.id}, ${r.unit}, ${r.unitTitle})
      on conflict (textbook_id, number) do update set title = excluded.title
      returning id
    `;
    await db()`insert into curriculum_lessons (unit_id, number, title, page_start, page_end) values (${u.id}, ${r.lesson}, ${r.title}, ${r.start}, ${r.end})`;
  }
  return loadBook(tb.id);
}

async function ensureBook(): Promise<Book> {
  if (!shared.book) shared.book = await bookViaDb();
  return shared.book;
}

/** معلم بوضع «يدير محتواه» وحساب دخول، مادته علوم الصف السابع (دون المرور بواجهة إنشاء المعلم) */
async function createTeacherAccount(): Promise<TeacherAccount> {
  const ts = Date.now();
  const email = `teacher-qbank-${ts}@example.com`;
  const password = `Teacher-QBank-${ts}`;
  const name = `أ. نورة العلوم ${ts % 100000}`;
  const subjectId = await scienceGrade7Id();
  const [u] = await db()<{ id: string }[]>`
    insert into users (email, password_hash, full_name, role, email_verified_at)
    values (${email}, ${await hashPassword(password)}, ${name}, 'teacher', now())
    returning id
  `;
  const [t] = await db()<{ id: string }[]>`
    insert into teachers (slug, display_name, headline, mode, user_id, can_upload)
    values (${`e2e-qbank-${ts}`}, ${name}, 'معلمة علوم، حساب اختبار', 'self_managed', ${u.id}, true)
    returning id
  `;
  await db()`insert into teacher_subjects (teacher_id, subject_id) values (${t.id}, ${subjectId})`;
  return { id: t.id, userId: u.id, email, password, name };
}

/** بديل مباشر لسيناريو المعلم: سؤال بانتظار المراجعة (الخيارات تُضاف والسؤال مسودة، ثم يُرسل) */
async function pendingQuestionViaDb(book: Book, teacher: TeacherAccount): Promise<{ id: string; stem: string }> {
  const lesson = book.lessons[0];
  const stem = `سكبت مريم عصيرًا من كوب واسع إلى زجاجة طويلة. ما الذي تغيّر في العصير؟ (بديل ${Date.now() % 100000})`;
  const [q] = await db()<{ id: string }[]>`
    insert into questions (lesson_id, page, source_kind, type, lang, stem, explanation, hint, difficulty,
                           teacher_id, created_by, content_hash, rights_confirmed_at, rights_confirmed_by)
    values (${lesson.id}, ${lesson.pageStart}, 'textbook_based', 'mcq', 'ar', ${stem}, ${EXPLANATION}, ${HINT}, 2,
            ${teacher.id}, ${teacher.userId}, ${createHash("sha256").update(stem).digest("hex")}, now(), ${teacher.userId})
    returning id
  `;
  for (const [i, text] of CHOICES.entries()) {
    await db()`insert into question_choices (question_id, position, text, is_correct) values (${q.id}, ${i + 1}, ${text}, ${i === CORRECT})`;
  }
  await db()`update questions set status = 'in_review', submitted_at = now() where id = ${q.id}`;
  return { id: q.id, stem };
}

async function questionStatus(id: string): Promise<string> {
  return (await db()<{ status: string }[]>`select status from questions where id = ${id}`)[0].status;
}

test.describe("بنك الأسئلة", () => {
  test.describe("دورة السؤال من الكتاب إلى النشر", () => {
    test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تُشغَّل على الكمبيوتر"));
    test.beforeAll(async ({}, info) => {
      if (info.project.name !== "desktop") return;
      shared.teacher = await createTeacherAccount();
    });

    test("المالك يضيف كتاب العلوم للصف السابع ← يلصق فهرس الكتاب ← تشغيل تجريبي ← تطبيق الاستيراد ← تظهر الوحدات والدروس", async ({ page }) => {
      test.setTimeout(120_000);
      const ts = Date.now();
      const title = `كتاب العلوم للاختبار ${ts % 100000}`;
      const subjectId = await scienceGrade7Id();

      await loginAdmin(page);
      await page.goto("/admin/curriculum");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("المنهج والكتب");

      // ---------- 1) إضافة الكتاب: المادة من القائمة بتسميتها «العلوم · الصف السابع» ----------
      const add = page.locator("#add-textbook");
      const option = add.locator("#tb-subject option").filter({ hasText: "العلوم" }).filter({ hasText: "الصف السابع" });
      await expect(option).toHaveCount(1);
      await expect(option).not.toContainText("(مخفي)");
      const subjectValue = await option.getAttribute("value");
      expect(subjectValue).toBe(subjectId);
      await page.selectOption("#tb-subject", subjectValue!);
      await page.selectOption("#tb-term", String(TERM));
      await page.fill("#tb-title", title);
      await page.fill("#tb-edition", "2026-2027");
      await expect(page.locator("#tb-current")).toBeChecked();
      await page.check("#tb-rights");
      await add.getByRole("button", { name: "إضافة الكتاب" }).click();
      await page.waitForURL(/\/admin\/curriculum\/[0-9a-f-]{36}\?created=1/);
      const textbookId = page.url().match(/curriculum\/([0-9a-f-]{36})/)![1];

      const [tb] = await db()<{ subject_id: string; term: number; title: string; is_current: boolean; rights: boolean }[]>`
        select subject_id, term, title, is_current, rights_confirmed_at is not null as rights from textbooks where id = ${textbookId}
      `;
      expect(tb).toEqual({ subject_id: subjectId, term: TERM, title, is_current: true, rights: true });
      await expect(page.getByRole("heading", { level: 1 })).toContainText("العلوم · الصف السابع · الفصل الثاني");
      await expect(page.getByText("تمت إضافة الكتاب").first()).toBeVisible();

      // ---------- 2) استيراد الفهرس: تشغيل تجريبي لا يكتب شيئًا ----------
      const importer = page.locator("#toc-import");
      await importer.locator("#toc-csv").fill(TOC_CSV);
      await importer.getByRole("button", { name: "تشغيل تجريبي" }).click();
      const preview = importer.locator("section", { has: page.locator("#toc-preview-h") });
      await expect(preview).toBeVisible();
      await expect(preview.locator("ol > li")).toHaveCount(TOC.length);
      await expect(preview.locator("ol > li", { hasText: "جديد" })).toHaveCount(TOC.length);
      await expect(preview).toContainText("لا أخطاء");
      await expect(importer.getByText("انتهى التشغيل التجريبي بلا أخطاء")).toBeVisible();
      const [{ n: unitsAfterPreview }] = await db()<{ n: number }[]>`select count(*)::int as n from curriculum_units where textbook_id = ${textbookId}`;
      expect(unitsAfterPreview).toBe(0);

      // ---------- 3) تطبيق الاستيراد: النص الملصق باقٍ بعد التشغيل التجريبي ----------
      await expect(importer.locator("#toc-csv")).toHaveValue(TOC_CSV);
      await importer.getByRole("button", { name: "تطبيق الاستيراد" }).click();
      await expect(importer.getByText(/تم الاستيراد/).first()).toBeVisible();
      await expect
        .poll(async () => (await db()<{ n: number }[]>`select count(*)::int as n from curriculum_lessons l join curriculum_units u on u.id = l.unit_id where u.textbook_id = ${textbookId}`)[0].n)
        .toBe(TOC.length);

      for (const u of TOC_UNITS) {
        await expect(page.getByRole("heading", { name: `الوحدة ${ar(u.number)}: ${u.title}` })).toBeVisible();
        const list = page.getByRole("list", { name: `دروس الوحدة ${ar(u.number)}`, exact: true });
        await expect(list.locator(":scope > li")).toHaveCount(u.lessons.length);
        for (const lessonTitle of u.lessons) await expect(list).toContainText(lessonTitle);
      }

      // ---------- 4) قائمة الكتب: الكتاب بطبعته الحالية وحقوقه المؤكدة ----------
      await page.goto("/admin/curriculum");
      const item = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) }).first();
      await expect(item).toContainText("الطبعة الحالية");
      await expect(item).toContainText("الحقوق مؤكدة");

      shared.book = await loadBook(textbookId);
    });

    test("المعلم يكتب سؤال اختيار من متعدد في درس الكتاب ← يحفظه مسودة ← يرسله للمراجعة، ولا يصل لصفحات المنهج", async ({ page }) => {
      test.setTimeout(120_000);
      const teacher = shared.teacher!;
      const book = await ensureBook();
      const lesson = book.lessons[0];
      const qPage = lesson.pageStart + 2;
      const stem = `سكبت مريم عصيرًا من كوب واسع إلى زجاجة طويلة. ما الذي تغيّر في العصير؟ (اختبار ${Date.now() % 100000})`;

      await login(page, teacher.email, teacher.password, "/admin");
      // المنهج ومراجعة الأسئلة للمالك وحده
      expect((await page.goto("/admin/curriculum"))?.status()).toBe(404);
      expect((await page.goto(`/admin/curriculum/${book.id}`))?.status()).toBe(404);
      expect((await page.goto("/admin/review?tab=questions"))?.status()).toBe(404);

      // ---------- 1) كتابة السؤال: الكتاب ← الوحدة ← الدرس ثم الصفحة ----------
      await page.goto("/admin/questions/new");
      await page.selectOption("#q-textbook", book.id);
      await page.selectOption("#q-unit", lesson.unitId);
      await page.selectOption("#q-lesson", lesson.id);
      await expect(page.getByText(`صفحات الدرس من ${ar(lesson.pageStart)} إلى ${ar(lesson.pageEnd)}`)).toBeVisible();
      // صفحة خارج نطاق الدرس أولًا: يرفضها الخادم
      await page.fill("#q-page", String(lesson.pageEnd + 5));
      await page.fill("#q-exercise", "3");
      await page.selectOption("#q-source", "textbook_exercise");
      await expect(page.locator("#q-type")).toHaveValue("mcq");
      await expect(page.locator("#q-lang")).toHaveValue("ar");
      await page.selectOption("#q-difficulty", "2");
      await page.fill("#q-stem", stem);
      for (const [i, text] of CHOICES.entries()) await page.fill(`#q-choice-${i + 1}`, text);
      await page.locator(`label[for="q-correct-${CORRECT + 1}"]`).click();
      await expect(page.locator(`#q-correct-${CORRECT + 1}`)).toBeChecked();
      await page.fill("#q-explanation", EXPLANATION);
      await page.fill("#q-hint", HINT);
      await page.check("#q-rights");
      await page.getByRole("button", { name: "حفظ كمسودة" }).click();
      await expect(page.locator("#q-page-error")).toContainText("خارج نطاق الدرس");
      await expect(page).toHaveURL(/\/admin\/questions\/new/);
      // القيم المكتوبة باقية بعد الخطأ
      await expect(page.locator("#q-stem")).toHaveValue(stem);
      await expect(page.locator("#q-lesson")).toHaveValue(lesson.id);
      await expect(page.locator(`#q-correct-${CORRECT + 1}`)).toBeChecked();

      await page.fill("#q-page", String(qPage));
      await page.getByRole("button", { name: "حفظ كمسودة" }).click();
      await page.waitForURL(/\/admin\/questions\/[0-9a-f-]{36}\?created=1/);
      const questionId = page.url().match(/questions\/([0-9a-f-]{36})/)![1];

      const [q] = await db()<{ status: string; teacher_id: string; lesson_id: string; page: number; exercise_ref: string; source_kind: string; rights: boolean }[]>`
        select status, teacher_id, lesson_id, page, exercise_ref, source_kind, rights_confirmed_at is not null as rights from questions where id = ${questionId}
      `;
      expect(q).toEqual({ status: "draft", teacher_id: teacher.id, lesson_id: lesson.id, page: qPage, exercise_ref: "3", source_kind: "textbook_exercise", rights: true });
      const choices = await db()<{ text: string; is_correct: boolean }[]>`select text, is_correct from question_choices where question_id = ${questionId} order by position`;
      expect(choices.map((c) => ({ text: c.text, is_correct: c.is_correct }))).toEqual(CHOICES.map((text, i) => ({ text, is_correct: i === CORRECT })));

      await expect(page.getByText("تم حفظ السؤال كمسودة").first()).toBeVisible();
      // المرجع الكامل: المادة والصف والفصل والوحدة والدرس والصفحة والتمرين
      await expect(
        page.getByText(`كتاب العلوم، الصف السابع، الفصل الدراسي الثاني، الوحدة ${ar(lesson.unitNumber)}، الدرس ${ar(lesson.number)}، ص ${ar(qPage)}، تمرين ٣`).first(),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "كما يراه الطالب" })).toBeVisible();

      // ---------- 2) الإرسال للمراجعة: يُقفل التعديل ----------
      await page.getByRole("button", { name: "إرسال للمراجعة" }).click();
      await expect.poll(() => questionStatus(questionId)).toBe("in_review");
      await page.reload();
      await expect(page.getByText("بانتظار المراجعة").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "سحب من المراجعة" })).toBeVisible();
      await expect(page.locator("#q-stem")).toHaveCount(0);

      // ---------- 3) قائمة «أسئلتي» ----------
      await page.goto("/admin/questions");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("أسئلتي");
      await expect(page.getByText(stem).first()).toBeVisible();

      shared.question = { id: questionId, stem };
    });

    test("المالك يراجع السؤال من تبويب «الأسئلة» ← يعتمده وينشره، وتبويب المحتوى يبقى كما كان", async ({ page }) => {
      test.setTimeout(90_000);
      const teacher = shared.teacher!;
      const question = shared.question ?? (await pendingQuestionViaDb(await ensureBook(), teacher));

      await loginAdmin(page);
      await page.goto("/admin/review?tab=questions");
      const tabs = page.getByRole("navigation", { name: "نوع المراجعة" });
      await expect(tabs.getByRole("link", { name: /الأسئلة/ })).toHaveAttribute("aria-current", "page");
      const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: question.stem }) });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(teacher.name);
      await expect(card).toContainText("بانتظار المراجعة");
      await card.getByRole("link", { name: question.stem }).click();
      await page.waitForURL(new RegExp(`/admin/questions/${question.id}`));

      await expect(page.locator("#review-h")).toBeVisible();
      await page.getByRole("button", { name: "اعتماد ونشر السؤال" }).click();
      await expect.poll(() => questionStatus(question.id)).toBe("published");
      await page.waitForURL(/approved=1/);
      await expect(page.getByText("تم اعتماد السؤال ونشره").first()).toBeVisible();

      const [row] = await db()<{ published: boolean; reviewer_role: string }[]>`
        select q.published_at is not null as published, u.role as reviewer_role
        from questions q join users u on u.id = q.reviewed_by where q.id = ${question.id}
      `;
      expect(row).toEqual({ published: true, reviewer_role: "admin" });
      const actions = (await db()<{ action: string }[]>`select action from audit_logs where entity_id = ${question.id}`).map((a) => a.action);
      expect(actions).toContain("question.review_approve");

      // خرج من طابور المراجعة
      await page.goto("/admin/review?tab=questions");
      await expect(page.getByRole("link", { name: question.stem })).toHaveCount(0);

      // صفحة المراجعة بلا تبويب: عرض المحتوى كما كان
      await page.goto("/admin/review");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("مراجعة المحتوى");
      await expect(page.getByText("محتوى أرسله المعلمون للنشر")).toBeVisible();
      await expect(tabs.getByRole("link", { name: /المحتوى/ })).toHaveAttribute("aria-current", "page");
      await expect(tabs.getByRole("link", { name: /الأسئلة/ })).not.toHaveAttribute("aria-current", "page");
    });
  });

  test.describe("على الجوال", () => {
    test.beforeEach(({}, info) => test.skip(info.project.name !== "iphone", "تُشغَّل على الجوال"));

    test("صفحات المنهج وبنك الأسئلة ← بلا تمرير أفقي على عرض 390", async ({ page }) => {
      test.setTimeout(90_000);
      await loginAdmin(page);
      for (const url of ["/admin/questions/new", "/admin/curriculum", "/admin/questions", "/admin/review?tab=questions"]) {
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }

      // صفحة الكتاب، ثم نتيجة تشغيل تجريبي (صفوفها بطاقات على الجوال). التشغيل التجريبي لا يكتب شيئًا.
      const [latest] = await db()<{ id: string }[]>`select id from textbooks order by created_at desc limit 1`;
      const bookId = latest?.id ?? (await bookViaDb()).id;
      await page.goto(`/admin/curriculum/${bookId}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.locator("#toc-csv").fill(TOC_CSV);
      await page.getByRole("button", { name: "تشغيل تجريبي" }).click();
      await expect(page.locator("#toc-preview-h")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  });
});
