import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { count, W } from "@/lib/design";
import { ACCESS_MODE_LABELS } from "@/lib/labels";
import { REFUND_HOLD_DAYS } from "@/lib/teacher-terms";
import { VERIFICATION_LINK_HOURS } from "@/server/auth/email-verification";
import { INVOICE_TTL_MINUTES, ORDER_LIFETIME_HOURS } from "@/server/payments/limits";
import { SESSION_DAYS, STUDENT_ACTIVE_SESSIONS } from "@/server/auth/session";
import { saveSettings } from "@/server/platform/settings";
import { closeDb, resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";

const { default: TermsPage } = await import("@/app/(site)/terms/page");
const { default: PrivacyPage } = await import("@/app/(site)/privacy/page");
const { default: RefundPage } = await import("@/app/(site)/refund-policy/page");
const { default: CopyrightPage } = await import("@/app/(site)/copyright/page");
const { SiteFooter } = await import("@/components/site/footer");
const { default: sitemap } = await import("@/app/sitemap");

const LEGAL = { terms: TermsPage, privacy: PrivacyPage, refund: RefundPage, copyright: CopyrightPage };
const legalNames = Object.keys(LEGAL) as (keyof typeof LEGAL)[];
const html = async (name: keyof typeof LEGAL) => renderToStaticMarkup(await LEGAL[name]());
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const text = async (name: keyof typeof LEGAL) => textOf(await html(name));
const footerHtml = async () => renderToStaticMarkup(await SiteFooter());

const NO_SELLER = { seller_legal_name: "", seller_license_number: "", seller_address: "", mail_provider_name: "", contact_email: "", contact_phone: "", whatsapp_number: "" };

let owner: Awaited<ReturnType<typeof createUser>>;
beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: "admin" });
});
afterAll(closeDb);
beforeEach(async () => {
  await saveSettings(NO_SELLER, owner.id);
});

describe("every legal page says it is an unreviewed draft", () => {
  it.each(legalNames)("%s carries the visible notice", async (name) => {
    const markup = await html(name);
    expect(markup).toContain('data-testid="legal-draft-notice"');
    expect(textOf(markup)).toContain("مسودة بانتظار مراجعة محامٍ");
  });
});

describe("the seller identity comes from the owner's settings", () => {
  const SELLER = { seller_legal_name: "شركة الاختبار للتعليم", seller_license_number: "LIC-2026-77", seller_address: "الكويت، حولي، شارع الاختبار" };

  it.each(legalNames)("%s shows no seller block while nothing is set", async (name) => {
    expect(await html(name)).not.toContain('data-testid="legal-seller"');
  });

  it.each(legalNames)("%s shows every value once the owner enters it", async (name) => {
    await saveSettings(SELLER, owner.id);
    const markup = await html(name);
    expect(markup).toContain('data-testid="legal-seller"');
    for (const value of Object.values(SELLER)) expect(textOf(markup)).toContain(value);
  });

  it.each(legalNames)("%s leaves no label behind for a field left empty", async (name) => {
    await saveSettings({ seller_license_number: "LIC-ONLY" }, owner.id);
    const block = (await html(name)).match(/data-testid="legal-seller".*?<\/dl>/s)?.[0] ?? "";
    expect(textOf(block)).toContain("رقم الرخصة التجارية");
    expect(textOf(block)).toContain("LIC-ONLY");
    expect(textOf(block)).not.toContain("البائع");
    expect(textOf(block)).not.toContain("العنوان");
  });
});

describe("the terms say how long access lasts and what each format carries", () => {
  it("names all three kinds of access exactly as the product page words the first", async () => {
    const out = await text("terms");
    expect(out).toContain("مدة الوصول");
    expect(out).toContain(ACCESS_MODE_LABELS.unlimited);
    expect(out).toContain("عدد أيام يبدأ من تاريخ الشراء");
    expect(out).toContain("حتى تاريخ محدد");
  });

  it("does not turn 'no end date' into a promise of forever", async () => {
    const out = await text("terms");
    expect(out).toContain("ليس وعدًا ببقاء الخدمة إلى الأبد");
    expect(out).not.toMatch(/مدى الحياة|وصول دائم/);
  });

  it("says there is no automatic renewal", async () => {
    expect(await text("terms")).toContain("لا يوجد تجديد تلقائي");
  });

  it("describes the note stamp and the video overlay as the different things they are", async () => {
    const out = await text("terms");
    expect(out).toContain("المذكرات: عند فتح مذكرة اشتريتها أو تنزيلها نكتب على كل صفحة");
    expect(out).toContain("على الشاشة فقط");
    expect(out).toContain("ولا تُكتب داخل ملف الفيديو نفسه");
    expect(out).toContain("ما دامت خاصية الختم مفعّلة");
  });

  it("does not claim the marks stop copying", async () => {
    expect(await text("terms")).toContain("ولا تمنع النسخ أو التصوير تمامًا");
  });

  it("states the limits the code enforces", async () => {
    const out = await text("terms");
    expect(out).toContain(`${count(STUDENT_ACTIVE_SESSIONS, W.session)} دخول نشطة`);
    expect(out).toContain(`رابط الدفع صالح ${count(INVOICE_TTL_MINUTES, W.minute)}`);
    expect(out).toContain(`غير المدفوع بعد ${count(ORDER_LIFETIME_HOURS, W.hour)}`);
  });

  it("records the guardian declaration without claiming to verify it", async () => {
    expect(await text("terms")).toContain("نسجل هذا الإقرار، ولا نتحقق من العمر أو من حضور ولي الأمر");
  });

  it("has a section for teachers and a route for rights-holders", async () => {
    const markup = await html("terms");
    expect(textOf(markup)).toContain("المعلمون والمحتوى");
    expect(markup).toContain('href="/copyright"');
  });

  it("leaves the governing law to the lawyer instead of asserting one", async () => {
    expect(await text("terms")).toContain("ويحددهما المحامي عند مراجعتها");
  });
});

describe("the privacy policy names who holds the data and for how long", () => {
  it("names each processor with what is honestly known of its country", async () => {
    const out = await text("privacy");
    for (const fragment of ["MyFatoorah، شركة تعمل من الكويت", "ولا نعرف مواقع خوادمها بدقة", "Vercel، شركة في الولايات المتحدة", "Supabase، شركة في الولايات المتحدة", "في فرانكفورت بألمانيا", "BunnyWay في سلوفينيا", "خارج دولة الكويت"]) expect(out).toContain(fragment);
  });

  it("the gateway and Bunny are conditional on being in use", async () => {
    const out = await text("privacy");
    expect(out).toContain("حين يكون الدفع الإلكتروني مفعّلًا");
    expect(out).toContain("حين تُشغَّل الدروس عبرها");
  });

  it("does not invent a mail provider while none is named", async () => {
    expect(await text("privacy")).toContain("الشركة التي ترسل بريد المنصة، ويُذكر اسمها هنا عند اعتمادها");
  });

  it("names the mail provider once the owner enters it", async () => {
    await saveSettings({ mail_provider_name: "مزود-الاختبار" }, owner.id);
    const out = await text("privacy");
    expect(out).toContain("إرسال البريد الإلكتروني: مزود-الاختبار");
    expect(out).not.toContain("عند اعتمادها");
  });

  it("states the periods the code enforces", async () => {
    const out = await text("privacy");
    expect(out).toContain(`تنتهي بعد ${count(SESSION_DAYS, W.day)}`);
    expect(out).toContain(`تأكيد البريد ${count(VERIFICATION_LINK_HOURS, W.hour)}`);
    expect(out).toContain(`يُغلق بعد ${count(ORDER_LIFETIME_HOURS, W.hour)}`);
    expect(out).toContain("صالح ساعة واحدة");
  });

  it("admits what has no automatic deletion", async () => {
    const out = await text("privacy");
    expect(out).toContain("ليس لها حذف تلقائي");
    expect(out).toContain("لم تُحدد بعد مدة الاحتفاظ النهائية");
  });

  it("says what deletion leaves outside the platform and when it is blocked", async () => {
    const out = await text("privacy");
    expect(out).toContain("لا يشمل الحذف ما تحتفظ به بوابة الدفع");
    expect(out).toContain("النسخ الاحتياطية");
    expect(out).toContain("لا يتم الحذف ما دام لديك طلب أو عملية دفع أو استرجاع لم تكتمل");
  });

  it("has its own section on minors and does not claim age is checked", async () => {
    const out = await text("privacy");
    expect(out).toContain("بيانات الطلاب القاصرين");
    expect(out).toContain("ولا نتحقق من العمر");
  });
});

describe("the refund policy states the real rules and leaves the law open", () => {
  it("uses the same window the teacher earnings are held for", async () => {
    const out = await text("refund");
    expect(out).toContain(`خلال ${count(REFUND_HOLD_DAYS, W.day)} من الشراء`);
  });

  it("states the whole-order rule and the duplicate-payment exception", async () => {
    const out = await text("refund");
    expect(out).toContain("يُسترد الطلب كاملًا فقط");
    expect(out).toContain("ولا يمكن استرداد منتج واحد من طلب فيه عدة منتجات");
    expect(out).toContain("الدفع المكرر لنفس الطلب يُرد وحده");
  });

  it("promises no date for the money", async () => {
    expect(await text("refund")).toContain("فلا نستطيع تحديد موعد دقيق له");
  });

  it("notes the decree-law as an open point without concluding", async () => {
    const out = await text("refund");
    expect(out).toContain("المرسوم بقانون رقم ١٠ لسنة ٢٠٢٦");
    expect(out).toContain("١٤ يومًا");
    expect(out).toContain("اكتمل تنزيلها");
    expect(out).toContain("لم يُحسم بعد");
    expect(out).toContain("ليست رأيًا قانونيًا");
  });

  it("does not say the product arrives the moment the buyer pays", async () => {
    expect(await text("refund")).not.toContain("فور الدفع");
  });
});

describe("rights-holders have a route that really leads somewhere", () => {
  it("says so plainly when no contact channel is set, with no link to nowhere", async () => {
    const markup = await html("copyright");
    expect(markup).toContain('data-testid="copyright-no-channel"');
    expect(markup).not.toContain('data-testid="copyright-contacts"');
    expect(markup).not.toMatch(/href="(mailto:|tel:|https:\/\/wa\.me\/)"/);
  });

  it("lists only the channels the owner set", async () => {
    await saveSettings({ contact_email: "rights@example.com" }, owner.id);
    const markup = await html("copyright");
    expect(markup).toContain('data-testid="copyright-contacts"');
    expect(markup).toContain('href="mailto:rights@example.com"');
    expect(markup).not.toContain("wa.me");
    expect(markup).not.toContain('data-testid="copyright-no-channel"');
  });

  it("does not promise a response time or an automatic form", async () => {
    expect(await text("copyright")).toContain("لا يوجد نموذج آلي للبلاغات، ولا تحدد هذه المسودة مدة للرد");
  });

  it("matches what hiding really does to existing buyers", async () => {
    expect(await text("copyright")).toContain("من اشتراه قبل الإخفاء يبقى وصوله كما هو ما لم يُسترد مبلغه");
  });

  it("is linked from the footer and listed in the sitemap", async () => {
    expect(await footerHtml()).toContain('href="/copyright"');
    expect((await sitemap()).map((e) => new URL(e.url).pathname)).toContain("/copyright");
  });
});

describe("no legal page links to a route that does not exist", () => {
  const appDir = join(process.cwd(), "src", "app");
  const routes = new Set<string>();
  const walk = (dir: string, path: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), /^\(.*\)$/.test(entry.name) ? path : `${path}/${entry.name}`);
      else if (entry.name === "page.tsx") routes.add(path || "/");
    }
  };
  walk(appDir, "");

  it.each(legalNames)("%s", async (name) => {
    const internal = [...(await html(name)).matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]).filter((href) => !href.startsWith("/_next"));
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) expect(routes, href).toContain(href);
  });
});
