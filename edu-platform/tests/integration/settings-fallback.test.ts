import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SETTINGS, readSettings, readSettingsReport, settingsSchema } from "@/server/platform/settings";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser } from "../helpers/factories";

/**
 * إعداد محفوظ واحد مرفوض لا يعيد كل الإعدادات إلى الافتراضي، والمالك يُخبر باسم الحقل.
 * ورابط إنستغرام (يظهر في تذييل كل صفحة) https فقط.
 */
const ctx = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), usePathname: () => "/admin/settings" }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => (ctx.user ? { user: ctx.user, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));

const { saveSettingsAction } = await import("@/app/admin/settings/actions");
const { SettingsInvalidAlert } = await import("@/components/admin/settings-invalid-alert");
const { SETTINGS_LABELS } = await import("@/server/platform/settings");

/** ما تعرضه صفحة الإعدادات (app/admin/settings/page.tsx) من تقرير القراءة */
async function ownerWarning() {
  const { invalid } = await readSettingsReport();
  const el = SettingsInvalidAlert({ labels: invalid.map((k) => SETTINGS_LABELS[k]) });
  return el ? renderToStaticMarkup(el) : "";
}

async function store(key: string, value: unknown) {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
}

beforeEach(async () => {
  await resetDb();
  ctx.user = await createUser({ role: "admin", fullName: "مالك المنصة" });
});
afterAll(async () => {
  await closeDb();
});

describe("stored settings", () => {
  it("keep every valid value when one stored value is refused, and name the refused one", async () => {
    const confirmedAt = new Date("2026-10-01T09:00:00Z").toISOString();
    await store("site_name", "أكاديمية الاختبار");
    await store("contact_email", "not-an-email");
    await store("whatsapp_number", "96550000000");
    await store("fee_rules_confirmed_at", confirmedAt);
    await store("unknown_key_from_old_code", { a: 1 });

    const report = await readSettingsReport();
    expect(report.invalid).toEqual(["contact_email"]);
    expect(report.settings.site_name).toBe("أكاديمية الاختبار");
    expect(report.settings.whatsapp_number).toBe("96550000000");
    expect(report.settings.fee_rules_confirmed_at).toBe(confirmedAt);
    expect(report.settings.contact_email).toBe(DEFAULT_SETTINGS.contact_email);
    expect((await readSettings()).site_name).toBe("أكاديمية الاختبار");
  });

  it("tells the owner on the settings page which field fell back", async () => {
    await store("instagram_url", "http://instagram.com/old");
    await store("site_name", "أكاديمية الاختبار");
    const html = await ownerWarning();
    expect(html).toContain('data-testid="settings-invalid"');
    expect(html).toContain("«رابط إنستغرام»");
    expect(html).not.toContain("«اسم المنصة»");
  });

  it("shows no warning when everything stored is valid", async () => {
    await store("site_name", "أكاديمية الاختبار");
    expect(await ownerWarning()).toBe("");
  });
});

describe("instagram link", () => {
  const ig = settingsSchema.shape.instagram_url;

  it("accepts https on instagram.com and empty only", () => {
    for (const good of ["https://instagram.com/farqad", "https://www.instagram.com/farqad/", "https://WWW.Instagram.com/farqad", ""]) {
      expect(ig.safeParse(good).success, good).toBe(true);
    }
    const lookalikes = ["https://instagram.com.evil.example/farqad", "https://evil-instagram.com/farqad", "https://instagram.co/farqad", "https://example.com/instagram.com", "https://instagram.com@evil.example/x"];
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "http://instagram.com/farqad", "ftp://x.y/z", "instagram.com/farqad", ...lookalikes]) {
      expect(ig.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("the owner's save refuses a non-https link with a clear message", async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ site_name: "منصة", hero_title: "عنوان", primary_color: "#0a6b66", accent_color: "#ffc531", academic_year: "2026-2027", faq: "[]", instagram_url: "javascript:alert(1)" })) fd.set(k, v);
    const res = await saveSettingsAction({}, fd);
    expect(res?.error).toContain("https://");
    const [row] = await sql`select 1 from settings where key = 'instagram_url'`;
    expect(row).toBeUndefined();
  });

  it("a link saved before the host rule falls back to empty and the owner is told", async () => {
    await sql`insert into settings (key, value) values ('instagram_url', '"https://example.com/fake-support"'::jsonb) on conflict (key) do update set value = excluded.value`;
    const report = await readSettingsReport();
    expect(report.settings.instagram_url).toBe("");
    expect(report.invalid).toContain("instagram_url");
    await sql`delete from settings where key = 'instagram_url'`;
  });
});
