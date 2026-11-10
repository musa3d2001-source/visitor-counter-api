import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CONSENT_VERSIONS, LEGAL_PAGE_VERSIONS } from "@/lib/consent";
import { LEGAL_TEXT_SETTINGS } from "@/server/platform/consent";
import { DEFAULT_SETTINGS, readSettings, type PlatformSettings } from "@/server/platform/settings";
import { closeDb, resetDb, sql } from "../helpers/db";

const { default: PrivacyPage } = await import("@/app/(site)/privacy/page");
const { default: TermsPage } = await import("@/app/(site)/terms/page");
const { default: RefundPage } = await import("@/app/(site)/refund-policy/page");
const { default: CopyrightPage } = await import("@/app/(site)/copyright/page");

beforeAll(resetDb);
afterAll(closeDb);

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * بصمة نص كل صفحة لها رقم نسخة. سجل الموافقة يقول «وافق على النسخة كذا»، وخطوة مراجعة المحامي تقول «راجع النسخة كذا»،
 * فلا قيمة لأي منهما إذا تغير النص وبقي الرقم.
 * إذا فشل هذا الاختبار بعد تعديل الصفحة: ارفع رقم النسخة في src/lib/consent.ts، ثم حدّث الرقم والبصمة هنا.
 */
const PINNED = {
  terms: { version: "2026-11-draft-3", sha256: "939b35ef850604683dd0c8491fb2bbee21dca70de720b897c1aef1447c16ef3b" },
  privacy: { version: "2026-11-draft-6", sha256: "aeca9fd1449175c862feea0fab5777ab9fb1a293ac3bf48d115a5babd7632805" },
  refund_policy: { version: "2026-11-draft-1", sha256: "d68a8ad9f99496253ed097e27bcf00c7f42e7f89a48e05cd336c40a96fb54617" },
  copyright: { version: "2026-11-draft-1", sha256: "91ea4aabe1ccb8a90a5aa29f9b13b8d5c2982afa17cd7b90db3f4b9c468f4c1a" },
};

const PAGES = {
  terms: { render: () => TermsPage(), version: () => CONSENT_VERSIONS.terms },
  privacy: { render: () => PrivacyPage(), version: () => CONSENT_VERSIONS.privacy },
  refund_policy: { render: () => RefundPage(), version: () => LEGAL_PAGE_VERSIONS.refund_policy },
  copyright: { render: () => CopyrightPage(), version: () => LEGAL_PAGE_VERSIONS.copyright },
} as const;

const markup = async (doc: keyof typeof PAGES) => renderToStaticMarkup(await PAGES[doc].render());

describe("each version names one exact text", () => {
  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("%s shows its version on the page", async (doc) => {
    expect(await markup(doc)).toContain(PAGES[doc].version());
  });

  it.each(Object.keys(PAGES) as (keyof typeof PAGES)[])("%s cannot change while its version stays the same", async (doc) => {
    expect({ version: PAGES[doc].version(), sha256: sha256(textOf(await markup(doc))) }).toEqual(PINNED[doc]);
  });
});

/**
 * الشروط والخصوصية تطبعان بعض الإعدادات، فيتغير نصهما دون أن يتغير رقمهما. لذلك يحمل السجل بصمة تلك الإعدادات.
 * هذا الاختبار يغير كل إعداد على حدة: إن تغير نص إحدى الصفحتين فيجب أن يكون الإعداد ضمن البصمة.
 */
describe("every setting printed in the terms or privacy text is part of the recorded version", () => {
  const OTHER: Record<keyof PlatformSettings, unknown> = {
    site_name: "منصة أخرى",
    tagline: "شعار آخر",
    hero_title: "عنوان آخر",
    hero_subtitle: "وصف آخر",
    logo_key: "public/logo-other.png",
    primary_color: "#123456",
    accent_color: "#654321",
    whatsapp_number: "+96550001111",
    contact_email: "other@farqad.test",
    contact_phone: "+965 5000 2222",
    instagram_url: "https://instagram.com/other",
    academic_year: "2027-2028",
    videos_enabled: false,
    watermark_enabled: false,
    faq: [{ q: "سؤال آخر؟", a: "جواب آخر." }],
    footer_note: "تذييل آخر",
    fee_percent_bps: 250,
    fee_fixed_fils: 100,
    fee_rules_confirmed_at: "2026-11-01T00:00:00.000Z",
    seller_legal_name: "شركة أخرى",
    seller_license_number: "998877",
    seller_address: "عنوان آخر",
    mail_provider_name: "مزود آخر",
  };
  const both = async () => [textOf(await markup("terms")), textOf(await markup("privacy"))].join(" | ");

  afterEach(async () => {
    await sql`delete from settings`;
  });

  it("the test changes every setting the platform has", () => {
    expect(Object.keys(OTHER).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it.each(Object.keys(OTHER) as (keyof PlatformSettings)[])("%s", async (key) => {
    const before = await both();
    await sql`insert into settings (key, value) values (${key}, ${sql.json(OTHER[key] as never)})`;
    const after = await both();
    // قيمة لا تقبلها الإعدادات تعيد الافتراضي كله، فلا يقيس الاختبار شيئًا
    expect((await readSettings())[key]).toEqual(OTHER[key]);
    if (after !== before) expect(LEGAL_TEXT_SETTINGS as readonly string[], `${key} changes the legal text`).toContain(key);
  });
});

describe("the privacy page says what the system really does", () => {
  let text = "";
  beforeAll(async () => {
    text = textOf(renderToStaticMarkup(await PrivacyPage()));
  });

  it("names IP and device data", () => {
    expect(text).toContain("عنوان IP ونوع المتصفح والجهاز");
  });

  it("names every kind of provider that receives data, not only the payment gateway", () => {
    for (const provider of ["بوابة الدفع", "استضافة الموقع وقاعدة البيانات", "إرسال البريد الإلكتروني", "بث الدروس المرئية"]) expect(text).toContain(provider);
    expect(text).not.toContain("إلا بوابة الدفع");
  });

  it("says what deletion keeps as well as what it removes", () => {
    expect(text).toContain("نزيل اسمك وبريدك وهاتفك");
    expect(text).toContain("نُبقي الطلبات والمدفوعات وسجل موافقاتك");
  });
});
