import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CONSENT_VERSIONS } from "@/lib/consent";
import { closeDb, resetDb } from "../helpers/db";

const { default: PrivacyPage } = await import("@/app/(site)/privacy/page");
const { default: TermsPage } = await import("@/app/(site)/terms/page");

beforeAll(resetDb);
afterAll(closeDb);

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * بصمة نص كل صفحة لها موافقة مسجلة. سجل الموافقة يقول «وافق على النسخة كذا»، فلا قيمة له إذا تغير النص وبقي الرقم.
 * إذا فشل هذا الاختبار بعد تعديل الصفحة: ارفع رقم النسخة في src/lib/consent.ts، ثم حدّث الرقم والبصمة هنا.
 */
const PINNED = {
  terms: { version: "2026-11-draft-1", sha256: "86668fafb010de8b44f869edbb450fc3eb1c2fbb8bc63e5b3dea149d3f8934a3" },
  privacy: { version: "2026-11-draft-2", sha256: "a42df7fecc3a3bdf107d6d5f100f1a749cdb125477a30b549881aaa7392c645a" },
};

describe("each consent version names one exact text", () => {
  it("the terms page shows the version recorded when someone agrees to it", async () => {
    expect(renderToStaticMarkup(await TermsPage())).toContain(CONSENT_VERSIONS.terms);
  });

  it("the privacy page shows the version recorded when someone agrees to it", async () => {
    expect(renderToStaticMarkup(await PrivacyPage())).toContain(CONSENT_VERSIONS.privacy);
  });

  it("the terms text cannot change while its version stays the same", async () => {
    expect({ version: CONSENT_VERSIONS.terms, sha256: sha256(textOf(renderToStaticMarkup(await TermsPage()))) }).toEqual(PINNED.terms);
  });

  it("the privacy text cannot change while its version stays the same", async () => {
    expect({ version: CONSENT_VERSIONS.privacy, sha256: sha256(textOf(renderToStaticMarkup(await PrivacyPage()))) }).toEqual(PINNED.privacy);
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
