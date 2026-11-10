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

/**
 * عدد ثابت من الطلبات المتزامنة يتجاوز المكانين والطابور (٥٢)، فيبقى الطابور ممتلئًا.
 * كل عامل ينتظر رده قبل طلبه التالي: موجات بلا سقف تملأ طابور الاتصالات في نظام التشغيل، وهذا ليس ما نختبره هنا.
 */
function startFlood(request: APIRequestContext, base: string, fields: Record<string, string>, email: string, workers: number) {
  const state = { running: true, shed: 0 };
  const running = Array.from({ length: workers }, async (_, i) => {
    for (let n = 1; state.running; n++) {
      const res = await request.post("/login", {
        multipart: { ...fields, email, password: STUDENT_PASSWORD },
        headers: { origin: base, "x-forwarded-for": `10.77.${(i % 200) + 1}.${(n % 200) + 1}` },
        maxRedirects: 0,
        failOnStatusCode: false,
        timeout: 40_000,
      });
      if ((await res.text()).includes('data-testid="login-busy"')) state.shed++;
      await new Promise((r) => setTimeout(r, 400));
    }
  });
  return {
    shed: () => state.shed,
    stop: async () => {
      state.running = false;
      await Promise.all(running);
    },
  };
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

    const flood = startFlood(request, baseURL!, fields, email, 70);
    await expect.poll(flood.shed, { timeout: 30_000 }).toBeGreaterThan(0);

    // الطابور ممتلئ فالمحاولة تُرفض قبل فحصها. إن صادفت مكانًا خاليًا فدخلت، يخرج الطالب ويعيدها
    await expect(async () => {
      if (!page.url().includes("/login")) {
        await page.context().clearCookies();
        await page.goto("/login?next=%2Flibrary");
        await page.fill("#email", email);
        await page.fill("#password", STUDENT_PASSWORD);
      }
      await page.getByRole("button", { name: "تسجيل الدخول" }).click({ timeout: 2_000 });
      await expect(page.getByTestId("login-busy")).toBeVisible({ timeout: 12_000 });
    }).toPass({ timeout: 60_000 });

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
    await flood.stop();

    await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeEnabled({ timeout: 10_000 });
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/library"), { timeout: 30_000 });

    // العدّاد يُكتب بعد الرد على الخادم الحقيقي، ومن دون أن يعتمد على طلب آخر
    await expect.poll(async () => Number((await db()`select coalesce(sum(count), 0)::int as n from saturation_counters where kind = 'login_shed'`)[0].n), { timeout: 45_000 }).toBeGreaterThan(0);
  });
});
