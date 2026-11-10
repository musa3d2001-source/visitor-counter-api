import { test, expect, type APIRequestContext } from "@playwright/test";
import { db, expectNoHorizontalOverflow, registerStudent, STUDENT_PASSWORD } from "./helpers";

/**
 * موجة دخول حقيقية على الخادم الفعلي: الطابور ممتلئ فتُرفض المحاولة قبل فحصها.
 * ما يهم هنا ما لا تراه اختبارات الوحدات: النموذج المرسل فعلًا، والعداد التنازلي، وبقاء الكلمة، وكتابة العدّاد بعد الرد.
 */
function hiddenFields(html: string) {
  const fields: Record<string, string> = {};
  for (const [tag] of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name) fields[name] = (/value="([^"]*)"/.exec(tag)?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  }
  return fields;
}

function floodWave(request: APIRequestContext, base: string, fields: Record<string, string>, email: string, size: number) {
  return Array.from({ length: size }, async (_, i) => {
    const res = await request.post("/login", {
      multipart: { ...fields, email, password: STUDENT_PASSWORD },
      headers: { origin: base, "x-forwarded-for": `10.77.${(i % 200) + 1}.${(Date.now() % 200) + 1}` },
      maxRedirects: 0,
      failOnStatusCode: false,
      timeout: 40_000,
    });
    return res.status();
  });
}

test.describe("a login storm", () => {
  test("the student is asked to wait, keeps the password, then gets in", async ({ page, browser, request, baseURL }, info) => {
    test.setTimeout(120_000);
    const signup = await browser.newContext();
    const email = await registerStudent(await signup.newPage());
    await signup.close();
    await db()`delete from saturation_counters where kind = 'login_shed'`;

    const fields = hiddenFields(await (await request.get("/login")).text());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login?next=%2Flibrary");
    await page.fill("#email", email);
    await page.fill("#password", STUDENT_PASSWORD);

    const inFlight: Promise<number>[] = [];
    let flooding = true;
    const flood = (async () => {
      while (flooding) {
        inFlight.push(...floodWave(request, baseURL!, fields, email, 25));
        await new Promise((r) => setTimeout(r, 150));
      }
    })();

    // الطابور ممتلئ ما دامت الموجة مستمرة، فالمحاولة تُرفض قبل فحصها. إن سبقت الامتلاء تكمل عادية، فتُعاد في نافذة جديدة
    await expect(async () => {
      await page.getByRole("button", { name: "تسجيل الدخول" }).click({ timeout: 2_000 });
      await expect(page.getByTestId("login-busy")).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 40_000 });
    flooding = false;
    await flood;

    const notice = page.getByTestId("login-busy");
    await expect(notice).toHaveAttribute("data-retry-after", /^[1-9]\d*$/);
    await expect(notice).toContainText("لم تُحتسب هذه المحاولة عليك");
    await expect(page.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحة")).toHaveCount(0);
    await expect(page.locator("#password")).toHaveValue(STUDENT_PASSWORD);
    await expect(page.locator("#email")).toHaveValue(email);
    await expect(page.getByTestId("login-wait")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath("login-busy-390.png") });

    await Promise.all(inFlight);
    await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeEnabled({ timeout: 10_000 });
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/library"), { timeout: 30_000 });

    // العدّاد يُكتب بعد الرد على الخادم الحقيقي، ومن دون أن يعتمد على طلب آخر
    await expect.poll(async () => Number((await db()`select coalesce(sum(count), 0)::int as n from saturation_counters where kind = 'login_shed'`)[0].n), { timeout: 45_000 }).toBeGreaterThan(0);
  });
});
