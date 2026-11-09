import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkoutAndPay, db, login, loginAdmin, registerStudent } from "./helpers";
import { E2E_BUNNY } from "./e2e-env";
import { hashPassword } from "../../src/server/auth/password-core";
import { ar } from "../../src/lib/design";

/**
 * الدورة الكاملة للمعلم (المتطلب 9):
 * المالك ينشئ معلمًا ← يفعّل حسابه ← المعلم يرفع ثلاثة فيديوهات للوحدة الأولى (Bunny عبر TUS)
 * ← يرسلها للمراجعة ← المالك يحدد السعر وينشرها ← الطالب يشاهد المعاينة ← يشتري الوحدة
 * ← يشاهد الفيديوهات الثلاثة ← طالب آخر غير مشترٍ يُمنع ← البيع يظهر في تقارير المالك والمعلم.
 * Bunny هنا محاكي اختبار مطابق للعقد الموثق (الخدمة الحقيقية غير متاحة من بيئة البناء).
 */

function clip(seconds: number): string {
  const dir = resolve(__dirname, "../.tmp/e2e-clips");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `lesson-${seconds}s.mp4`);
  // حاوية MP4 صغيرة صحيحة البنية (ftyp ثم mdat). محاكي Bunny لا يفك الترميز، فلا حاجة إلى ffmpeg.
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const payload = Buffer.alloc(seconds * 4096, 0x5a);
  writeFileSync(out, Buffer.concat([u32(24), Buffer.from("ftypisom"), u32(512), Buffer.from("isommp42"), u32(payload.length + 8), Buffer.from("mdat"), payload]));
  return out;
}

async function uploadLesson(page: Page, title: string, file: string, freePreview = false) {
  await page.fill("#l-title", title);
  await page.fill("#l-unit", "الوحدة الأولى");
  const form = page.locator("form", { has: page.locator("#l-title") });
  if (freePreview) await form.getByLabel("درس مجاني للمعاينة").check();
  await form.getByTestId("upload-lesson").setInputFiles(file);
  await form.getByRole("button", { name: "رفع وإضافة الدرس" }).click();
  await expect(page.getByTestId("lesson-list")).toContainText(title, { timeout: 30_000 });
}

test.describe("دورة المعلم الكاملة", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تُشغَّل على الكمبيوتر"));

  test("إنشاء معلم ← رفع 3 فيديوهات ← مراجعة ونشر ← شراء ومشاهدة ← منع غير المشتري ← التقارير", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const ts = Date.now();
    const teacherName = `أ. فيصل الاختبار ${ts % 100000}`;
    const teacherEmail = `teacher-${ts}@example.com`;
    const unitTitle = `شرح الوحدة الأولى في الرياضيات ${ts % 100000}`;
    const [subject] = await db()<{ grade_id: string; subject_id: string }[]>`
      select g.id as grade_id, s.id as subject_id from grades g join subjects s on s.grade_id = g.id where g.level = 9 and s.slug = 'math'
    `;

    // ---------- 1) المالك ينشئ المعلم ويفعّل حسابه ----------
    await loginAdmin(page);
    await page.goto("/admin/teachers/new");
    await page.fill("#displayName", teacherName);
    await page.fill("#headline", "معلم رياضيات، حساب اختبار");
    await page.fill("#bio", "نبذة تجريبية للاختبار الآلي.");
    await page.fill("#slug", `e2e-teacher-${ts}`);
    await page.fill("#revenueShare", "40");
    await page.check(`input[name="s:${subject.subject_id}"]`);
    await page.getByLabel("إظهار صفحة المعلم للطلاب").check();
    await page.getByRole("button", { name: "حفظ المعلم" }).click();
    await page.waitForURL(/\/admin\/teachers\/[0-9a-f-]{36}/);
    const teacherId = page.url().match(/teachers\/([0-9a-f-]{36})/)![1];

    await page.fill("#acc-email", teacherEmail);
    await page.getByRole("button", { name: "تفعيل حساب المعلم" }).click();
    const password = (await page.getByTestId("one-time-secret").innerText({ timeout: 15_000 })).trim();
    expect(password.length).toBeGreaterThanOrEqual(12);
    const [t] = await db()<{ mode: string; user_id: string; role: string }[]>`
      select t.mode, t.user_id, u.role from teachers t join users u on u.id = t.user_id where t.id = ${teacherId}
    `;
    expect(t).toMatchObject({ mode: "self_managed", role: "teacher" });
    // زر «تم» يغلق اللوحة فعلًا، وتظهر أدوات الحساب المفعّل
    await page.getByRole("button", { name: "تم، متابعة" }).click();
    await expect(page.getByTestId("one-time-secret")).toBeHidden();
    await expect(page.getByTestId("confirm-teacher-reset")).toBeVisible();

    // ---------- 2) المعلم يدخل وينشئ الوحدة ويرفع 3 فيديوهات ----------
    const teacherCtx = await browser.newContext();
    const tp = await teacherCtx.newPage();
    // ملاحظة: لا نضيف ترويسة x-forwarded-for هنا لأنها تُرسل أيضًا مع رفع TUS المباشر إلى Bunny (طلب CORS)
    // الكلمة المؤقتة لا تفتح إلا صفحة اختيار كلمة جديدة (D17)، وللمعلم حد ١٢ حرفًا
    await tp.goto(`/login?next=${encodeURIComponent("/admin")}`);
    await tp.fill("#email", teacherEmail);
    await tp.fill("#password", password);
    await tp.getByRole("button", { name: "تسجيل الدخول" }).click();
    await tp.waitForURL(/\/change-password/);
    await expect(tp.getByText("١٢ حرفًا على الأقل")).toBeVisible();
    await tp.fill("#password", "Teacher-Chosen-Pass-2026");
    await tp.fill("#passwordConfirm", "Teacher-Chosen-Pass-2026");
    await tp.getByRole("button", { name: "حفظ كلمة المرور" }).click();
    await tp.waitForURL(/\/admin(\/|$)/);
    // المعلم لا يصل لصفحات المالك
    expect((await tp.goto("/admin/settings"))?.status()).toBe(404);
    expect((await tp.goto("/admin/teachers"))?.status()).toBe(404);
    await tp.goto("/admin/products/new");
    await tp.selectOption("#gradeId", subject.grade_id);
    await tp.selectOption("#subjectId", subject.subject_id);
    await tp.selectOption("#type", "unit");
    await tp.fill("#title", unitTitle);
    await tp.fill("#proposedPrice", "3.000");
    await tp.getByRole("button", { name: "حفظ كمسودة ومتابعة الرفع" }).click();
    await tp.waitForURL(/\/admin\/products\/[0-9a-f-]{36}/);
    const productId = tp.url().match(/products\/([0-9a-f-]{36})/)![1];
    const [draft] = await db()<{ teacher_id: string; status: string; price_fils: number; proposed_price_fils: number }[]>`
      select teacher_id, status, price_fils, proposed_price_fils from products where id = ${productId}
    `;
    expect(draft).toMatchObject({ teacher_id: teacherId, status: "draft", price_fils: 0, proposed_price_fils: 3000 });

    const file = clip(4);
    await uploadLesson(tp, "الدرس الأول: مقدمة", file, true);
    await uploadLesson(tp, "الدرس الثاني: التطبيقات", file);
    await uploadLesson(tp, "الدرس الثالث: حل التمارين", file);
    // المعالجة في Bunny (المحاكي) ثم Webhook موقّع ← «جاهز»
    await expect.poll(async () => (await db()`select count(*)::int as n from lessons where product_id = ${productId} and provider = 'bunny' and processing_status = 'ready'`)[0].n, { timeout: 30_000 }).toBe(3);
    const lessons = await db()<{ id: string; video_ref: string; duration_seconds: number }[]>`select id, video_ref, duration_seconds from lessons where product_id = ${productId} order by sort_order`;
    expect(lessons.every((l) => l.duration_seconds >= 3)).toBe(true);

    // الإرسال للمراجعة — بعدها يصبح المحتوى للقراءة فقط
    await tp.reload();
    // بلا الاتفاقية لا يوجد زر إرسال أصلًا، وصفحة المحتوى تدل عليها
    await expect(tp.getByTestId("agreement-needed")).toBeVisible();
    await tp.goto("/admin/agreement");
    await expect(tp.getByTestId("agreement-draft")).toBeVisible();
    await tp.getByTestId("agreement-accept").check();
    await tp.getByRole("button", { name: "قبول الاتفاقية" }).click();
    await expect(tp.getByText("قبلت هذه النسخة")).toBeVisible();
    await tp.goBack();
    await tp.reload();
    await tp.getByTestId("rights-attest").check();
    await tp.getByRole("button", { name: "إرسال للمراجعة" }).click();
    await expect.poll(async () => (await db()`select status from products where id = ${productId}`)[0].status).toBe("in_review");
    await tp.reload();
    await expect(tp.getByText("بانتظار المراجعة").first()).toBeVisible();

    // ---------- 3) المالك يراجع ويحدد السعر وينشر ----------
    await page.goto("/admin/review");
    await page.getByRole("link", { name: unitTitle }).click();
    await page.waitForURL(new RegExp(`/admin/products/${productId}`));
    await page.fill("#ap-price", "3.500");
    await page.getByRole("button", { name: "اعتماد ونشر" }).click();
    await expect.poll(async () => (await db()`select status, price_fils from products where id = ${productId}`)[0]).toMatchObject({ status: "published", price_fils: 3500 });
    const [{ slug }] = await db()<{ slug: string }[]>`select slug from products where id = ${productId}`;

    // ---------- 4) الطالب: صفحة المعلم ← المعاينة المجانية ← الشراء ← المشاهدة ----------
    const studentCtx = await browser.newContext();
    const sp = await studentCtx.newPage();
    await registerStudent(sp);
    await sp.goto(`/teachers/e2e-teacher-${ts}`);
    await expect(sp.getByRole("heading", { level: 1 })).toContainText(teacherName);
    await sp.getByRole("link", { name: unitTitle }).first().click();
    await expect(sp).toHaveURL(new RegExp(`/products/${slug}`));
    await expect(sp.getByText("3.500").first()).toBeVisible();
    // المعاينة المجانية (الدرس الأول) قبل الشراء — رابط تضمين موقّع يقبله Bunny
    await sp.goto(`/watch/${productId}?lesson=${lessons[0].id}`);
    await expect(sp.frameLocator('[data-testid="watch-player"] iframe').getByTestId("sim-embed-ok")).toBeVisible({ timeout: 15_000 });
    // الدرس الثاني مقفل قبل الشراء
    await sp.goto(`/watch/${productId}?lesson=${lessons[1].id}`);
    await expect(sp.getByTestId("lesson-locked-panel")).toBeVisible();

    await sp.goto(`/products/${slug}`);
    await sp.getByTestId("add-to-cart").first().click();
    await expect(sp.getByText("أضيفت إلى السلة").first()).toBeVisible();
    await checkoutAndPay(sp, "success");
    await expect(sp.getByText("تم الدفع بنجاح")).toBeVisible();

    for (const l of lessons) {
      await sp.goto(`/watch/${productId}?lesson=${l.id}`);
      await expect(sp.frameLocator('[data-testid="watch-player"] iframe').getByTestId("sim-embed-ok")).toBeVisible({ timeout: 15_000 });
    }
    await expect(sp.getByTestId("lesson-locked")).toHaveCount(0);

    // ---------- 5) طالب آخر غير مشترٍ يُمنع ----------
    const otherCtx = await browser.newContext();
    const op = await otherCtx.newPage();
    await registerStudent(op);
    await op.goto(`/watch/${productId}?lesson=${lessons[2].id}`);
    await expect(op.getByTestId("lesson-locked-panel")).toBeVisible();
    await expect(op.locator('[data-testid="watch-player"] iframe')).toHaveCount(0);
    // ولا يمكن تزوير رابط التضمين بدون توقيع صحيح
    const forged = await op.request.get(`${E2E_BUNNY.base}/embed/${E2E_BUNNY.library}/${lessons[2].video_ref}?token=deadbeef&expires=${Math.floor(Date.now() / 1000) + 3600}`);
    expect(forged.status()).toBe(403);

    // ---------- 6) التقارير: المالك والمعلم ----------
    const [earning] = await db()<{ gross_fils: number; net_fils: number; share_bps: number; teacher_fils: number; platform_fils: number; teacher_name: string }[]>`
      select gross_fils, net_fils, share_bps, teacher_fils, platform_fils, teacher_name from teacher_earnings where teacher_id = ${teacherId}
    `;
    expect(earning).toMatchObject({ gross_fils: 3500, net_fils: 3500, share_bps: 4000, teacher_fils: 1400, platform_fils: 2100, teacher_name: teacherName });

    // طلبات بيئة الاختبار مستبعدة من المستحقات افتراضيًا (لا تُعرض مبيعات تجريبية كأنها حقيقية)
    await page.goto(`/admin/teachers/${teacherId}`);
    await expect(page.getByTestId("teacher-balance")).toContainText("0.000");
    await page.goto(`/admin/teachers/${teacherId}?test=1`);
    await expect(page.getByText(unitTitle).first()).toBeVisible();
    // البيع الجديد قيد فترة الاسترداد: لا يدخل الرصيد المستحق الآن
    await expect(page.getByTestId("teacher-held")).toContainText("1.400");
    await expect(page.getByTestId("teacher-balance")).toContainText("0.000");
    await page.goto("/admin/reports?test=1");
    await expect(page.getByText(teacherName).first()).toBeVisible();

    await tp.goto("/admin/earnings?test=1");
    await expect(tp.getByText("1.400").first()).toBeVisible();
    await expect(tp.getByText(unitTitle).first()).toBeVisible();
    // المعلم لا يرى بيانات الطالب المشتري
    const studentEmail = (await db()<{ customer_email: string }[]>`
      select o.customer_email from orders o join order_items oi on oi.order_id = o.id where oi.product_id = ${productId} limit 1
    `)[0].customer_email;
    await expect(tp.getByText(studentEmail)).toHaveCount(0);

    // إعادة التعيين: كلمة تظهر مرة واحدة، و«تم» يغلقها، ويمكن الإصدار من جديد
    await page.goto(`/admin/teachers/${teacherId}`);
    await page.getByTestId("confirm-teacher-reset").check();
    await page.getByRole("button", { name: "إعادة تعيين كلمة المرور" }).click();
    const firstReset = (await page.getByTestId("one-time-secret").innerText({ timeout: 15_000 })).trim();
    await page.getByRole("button", { name: "تم، متابعة" }).click();
    await expect(page.getByTestId("one-time-secret")).toBeHidden();
    await page.getByTestId("confirm-teacher-reset").check();
    await page.getByRole("button", { name: "إعادة تعيين كلمة المرور" }).click();
    const secondReset = (await page.getByTestId("one-time-secret").innerText({ timeout: 15_000 })).trim();
    expect(secondReset).not.toBe(firstReset);

    await Promise.all([teacherCtx.close(), studentCtx.close(), otherCtx.close()]);
  });

  test("المالك يرفع فيديو نيابة عن معلم بدون حساب دخول وينشره", async ({ page }) => {
    test.setTimeout(120_000);
    const ts = Date.now();
    const name = `أ. منيرة المُدارة ${ts % 100000}`;
    const title = `مراجعة الاختبار القصير الأول ${ts % 100000}`;
    const [subject] = await db()<{ grade_id: string; subject_id: string }[]>`
      select g.id as grade_id, s.id as subject_id from grades g join subjects s on s.grade_id = g.id where g.level = 8 and s.slug = 'math'
    `;
    await loginAdmin(page);
    await page.goto("/admin/teachers/new");
    await page.fill("#displayName", name);
    await page.fill("#slug", `e2e-managed-${ts}`);
    // لا يُنشر منتج بسعر لمعلم بلا نسبة متفق عليها
    await page.fill("#revenueShare", "40");
    await page.check(`input[name="s:${subject.subject_id}"]`);
    await page.getByLabel("إظهار صفحة المعلم للطلاب").check();
    await page.getByRole("button", { name: "حفظ المعلم" }).click();
    await page.waitForURL(/\/admin\/teachers\/[0-9a-f-]{36}/);
    const teacherId = page.url().match(/teachers\/([0-9a-f-]{36})/)![1];
    const [tr] = await db()<{ mode: string; user_id: string | null }[]>`select mode, user_id from teachers where id = ${teacherId}`;
    expect(tr).toEqual({ mode: "managed", user_id: null });

    await page.goto("/admin/products/new");
    await page.selectOption("#teacherId", teacherId);
    await page.selectOption("#gradeId", subject.grade_id);
    await page.selectOption("#subjectId", subject.subject_id);
    await page.selectOption("#type", "quiz_review");
    await page.fill("#title", title);
    await page.fill("#price", "1.250");
    await page.getByRole("button", { name: "حفظ كمسودة ومتابعة الرفع" }).click();
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}/);
    const productId = page.url().match(/products\/([0-9a-f-]{36})/)![1];

    // لا يُسمح بالنشر قبل اكتمال المعالجة — ثم يُسمح بعدها
    await uploadLesson(page, "مراجعة شاملة للاختبار القصير", clip(3), true);
    await expect.poll(async () => (await db()`select processing_status from lessons where product_id = ${productId}`)[0]?.processing_status, { timeout: 30_000 }).toBe("ready");
    await page.reload();
    await page.getByRole("button", { name: "نشر للطلاب" }).click();
    await expect.poll(async () => (await db()`select status from products where id = ${productId}`)[0].status).toBe("published");

    const [owner] = await db()<{ id: string }[]>`select id from users where role = 'admin' order by created_at limit 1`;
    const [lesson] = await db()<{ uploaded_by: string; provider: string }[]>`select uploaded_by, provider from lessons where product_id = ${productId}`;
    expect(lesson.provider).toBe("bunny");
    expect(lesson.uploaded_by).toBe(owner.id);

    // يظهر للطلاب باسم المعلم
    const [{ slug }] = await db()<{ slug: string }[]>`select slug from products where id = ${productId}`;
    await page.context().clearCookies();
    await page.goto(`/products/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText(name).first()).toBeVisible();
    await page.goto(`/teachers/e2e-managed-${ts}`);
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("تعديل المعلم لملفه ينتظر موافقة المالك، ثم يظهر للطلاب", async ({ page, browser }) => {
    const ts = Date.now();
    const email = `teacher-profile-${ts}@example.com`;
    const password = "Profile-Review-Pass-2026";
    const slug = `e2e-profile-${ts}`;
    const name = `أ. ملف للمراجعة ${ts % 100000}`;
    const approved = "عنوان معتمد ظاهر للطلاب";
    const proposed = `عنوان ينتظر الموافقة ${ts % 100000}`;
    const [u] = await db()<{ id: string }[]>`insert into users (email, password_hash, full_name, role, email_verified_at) values (${email}, ${await hashPassword(password)}, ${name}, 'teacher', now()) returning id`;
    await db()`insert into teachers (slug, display_name, mode, user_id, is_published, revenue_share_bps, headline, bio) values (${slug}, ${name}, 'self_managed', ${u.id}, true, 4000, ${approved}, 'نبذة معتمدة')`;

    const teacherCtx = await browser.newContext();
    const tp = await teacherCtx.newPage();
    await login(tp, email, password, "/admin");
    await tp.goto("/admin/profile");
    await tp.fill("#headline", proposed);
    await tp.getByRole("button", { name: "إرسال للمراجعة" }).click();
    await expect(tp.getByTestId("profile-pending")).toBeVisible();

    // الزائر يرى المعتمد وحده حتى يوافق المالك
    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    await visitor.goto(`/teachers/${slug}`);
    await expect(visitor.getByText(approved).first()).toBeVisible();
    await expect(visitor.getByText(proposed)).toHaveCount(0);

    // المالك يعرف أن تعديلًا ينتظره: تنبيه في الرئيسية، وعدد الشريط الجانبي يشمل التعديلات
    await loginAdmin(page);
    await expect(page.getByText("على ملفات المعلمين بانتظار موافقتك")).toBeVisible();
    const [{ waiting }] = await db()<{ waiting: number }[]>`select (select count(*) from teacher_profile_changes where status = 'pending')::int + (select count(*) from products where status = 'in_review')::int as waiting`;
    await expect(page.getByLabel(`${ar(waiting)} بانتظار المراجعة`).first()).toBeVisible();

    // المالك يرى القديم والجديد معًا، وبعد الاعتماد يتغير ما يراه الزائر
    await page.goto("/admin/review");
    const card = page.getByTestId("profile-change").filter({ hasText: name });
    await expect(card).toContainText(approved);
    await expect(card).toContainText(proposed);
    await card.getByRole("button", { name: "اعتماد ونشر التعديل" }).click();
    await expect(card).toHaveCount(0);

    await visitor.reload();
    await expect(visitor.getByText(proposed).first()).toBeVisible();
    await expect(visitor.getByText(approved)).toHaveCount(0);
    await Promise.all([teacherCtx.close(), visitorCtx.close()]);
  });
});
