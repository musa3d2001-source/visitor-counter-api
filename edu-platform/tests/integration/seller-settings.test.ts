import { createElement } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getSettings, saveSettings } from "@/server/platform/settings";
import { closeDb, resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";

const ctx = vi.hoisted(() => ({ user: null as unknown, sessionId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.73", userAgent: async () => "t" }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => (ctx.user ? { user: ctx.user, sessionId: ctx.sessionId, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));

const { SiteFooter } = await import("@/components/site/footer");
const { SettingsForm } = await import("@/components/admin/settings-form");
const { saveSettingsAction } = await import("@/app/admin/settings/actions");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const footerHtml = async () => renderToStaticMarkup(await SiteFooter());
const NO_SELLER = { seller_legal_name: "", seller_license_number: "", seller_address: "", mail_provider_name: "" };

let owner: Awaited<ReturnType<typeof createUser>>;
beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: "admin" });
  ctx.sessionId = (await provenOwner(owner)).sessionId;
});
afterAll(closeDb);
beforeEach(async () => {
  ctx.user = { id: owner.id, email: owner.email, fullName: "المالك", phone: null, role: "admin", gradeId: null, isActive: true };
  await saveSettings(NO_SELLER, owner.id);
});

describe("the footer shows the seller the owner entered", () => {
  const SELLER = { seller_legal_name: "شركة الاختبار للتعليم", seller_license_number: "LIC-2026-77", seller_address: "الكويت، حولي، شارع الاختبار" };

  it("shows no seller block while nothing is set", async () => {
    expect(await footerHtml()).not.toContain('data-testid="footer-seller"');
  });

  it("shows every value once the owner enters it", async () => {
    await saveSettings(SELLER, owner.id);
    const markup = await footerHtml();
    expect(markup).toContain('data-testid="footer-seller"');
    for (const value of Object.values(SELLER)) expect(textOf(markup)).toContain(value);
  });

  it("a field left empty leaves no label behind", async () => {
    await saveSettings({ seller_license_number: "LIC-ONLY" }, owner.id);
    const out = textOf(await footerHtml());
    expect(out).toContain("رقم الرخصة التجارية");
    expect(out).toContain("LIC-ONLY");
    expect(out).not.toContain("البائع:");
    expect(out).not.toContain("العنوان:");
  });

  it("a value of spaces counts as empty", async () => {
    await saveSettings({ seller_legal_name: "   " }, owner.id);
    expect(await footerHtml()).not.toContain('data-testid="footer-seller"');
  });
});

describe("the owner can enter the seller identity", () => {
  const VALID = { site_name: "منصة فرقد", tagline: "", hero_title: "عنوان", hero_subtitle: "", primary_color: "#0a6b66", accent_color: "#ffc531", whatsapp_number: "", contact_email: "", contact_phone: "", instagram_url: "", academic_year: "2026-2027", faq: "[]", footer_note: "", fee_percent: "0", fee_fixed: "0" };
  const form = (values: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...VALID, ...values })) fd.set(k, v);
    return fd;
  };

  it("the settings action saves all four fields", async () => {
    const res = await saveSettingsAction(null, form({ seller_legal_name: "اسم نظامي", seller_license_number: "12345", seller_address: "عنوان البائع", mail_provider_name: "مزود بريد" }));
    expect(res?.ok).toBe(true);
    expect(await getSettings()).toMatchObject({ seller_legal_name: "اسم نظامي", seller_license_number: "12345", seller_address: "عنوان البائع", mail_provider_name: "مزود بريد" });
  });

  it("clearing a field in the form clears it on the site", async () => {
    await saveSettings({ seller_legal_name: "اسم قديم" }, owner.id);
    expect((await saveSettingsAction(null, form({ seller_legal_name: "" })))?.ok).toBe(true);
    expect((await getSettings()).seller_legal_name).toBe("");
  });

  it("a value over the limit is refused with the field named", async () => {
    const res = await saveSettingsAction(null, form({ seller_legal_name: "س".repeat(121) }));
    expect(res?.ok).not.toBe(true);
    expect(res?.fieldErrors?.seller_legal_name ?? res?.error).toContain("الاسم النظامي للبائع");
    expect((await getSettings()).seller_legal_name).toBe("");
  });

  it("the form offers each field with its saved value", () => {
    const values = { seller_legal_name: "القيمة الأولى", seller_license_number: "القيمة الثانية", seller_address: "القيمة الثالثة", mail_provider_name: "القيمة الرابعة" };
    const markup = renderToStaticMarkup(
      createElement(SettingsForm, {
        action: async () => null,
        values: { site_name: "س", tagline: "", hero_title: "", hero_subtitle: "", primary_color: "#0a6b66", accent_color: "#ffc531", whatsapp_number: "", contact_email: "", contact_phone: "", instagram_url: "", academic_year: "", faq: [], footer_note: "", watermark_enabled: true, ...values } as never,
      }),
    );
    for (const [name, value] of Object.entries(values)) expect(markup).toMatch(new RegExp(`name="${name}"[^>]*value="${value}"|value="${value}"[^>]*name="${name}"`));
  });
});
