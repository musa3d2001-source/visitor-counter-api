import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { filsToKwdString } from "@/lib/money";
import { unsellableProductIds } from "@/server/commerce/cart";
import { computeEarningLines, computeOrderFee } from "@/server/commerce/earnings";
import { createOrder } from "@/server/commerce/orders";
import { publishBlockers } from "@/server/admin/products";
import { getSettings, saveSettings } from "@/server/platform/settings";
import { TeacherMoneyRules } from "@/components/admin/teacher-money-rules";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createProduct, createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";

const ctx = vi.hoisted(() => ({ user: null as unknown, sessionId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.72", userAgent: async () => "t" }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), useRouter: () => ({ refresh() {} }), usePathname: () => "/admin/earnings" }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => (ctx.user ? { user: ctx.user, sessionId: ctx.sessionId, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));

const { saveSettingsAction } = await import("@/app/admin/settings/actions");
const { default: TeacherEarningsPage } = await import("@/app/admin/earnings/page");

let owner: Awaited<ReturnType<typeof createUser>>;
let teacher: TestTeacher;
const asOwner = () => {
  ctx.user = { id: owner.id, email: owner.email, fullName: "المالك", phone: null, role: "admin", gradeId: null, isActive: true };
};
const unconfirm = () => sql`delete from settings where key = 'fee_rules_confirmed_at'`;
const confirm = () => saveSettings({ fee_rules_confirmed_at: "2026-02-02T00:00:00.000Z" }, owner.id);
const VALID = { site_name: "منصة فرقد", tagline: "", hero_title: "عنوان", hero_subtitle: "", primary_color: "#0a6b66", accent_color: "#ffc531", whatsapp_number: "", contact_email: "", contact_phone: "", instagram_url: "", academic_year: "2026-2027", faq: "[]", footer_note: "" };
const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...VALID, ...values })) fd.set(k, v);
  return fd;
};

beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: "admin" });
  ctx.sessionId = (await provenOwner(owner)).sessionId;
  teacher = await createTeacher({ shareBps: 4000, mode: "self_managed", withUser: true });
});
afterAll(async () => {
  await closeDb();
});
beforeEach(asOwner);
afterEach(confirm);

describe("اعتماد الرسوم قبل أول بيع لمعلم", () => {
  it("teacher content is not sold before the owner confirms, even with a share set", async () => {
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 2000 });
    await unconfirm();
    expect((await unsellableProductIds([unit.id])).has(unit.id)).toBe(true);
    await expect(createOrder({ user: await createUser(), productIds: [unit.id], isTest: false })).rejects.toThrow();
    await confirm();
    expect((await unsellableProductIds([unit.id])).has(unit.id)).toBe(false);
  });

  it("a bundle holding a teacher's item is blocked as well", async () => {
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 2000 });
    const note = await createProduct({ level: 7, subjectSlug: "science", priceFils: 1000 });
    const bundle = await createBundle({ items: [unit.id, note.id], priceFils: 2500 });
    await unconfirm();
    expect((await unsellableProductIds([bundle.id])).has(bundle.id)).toBe(true);
  });

  it("the platform's own content keeps selling", async () => {
    const note = await createProduct({ level: 7, subjectSlug: "science", priceFils: 1000 });
    await unconfirm();
    expect((await unsellableProductIds([note.id])).has(note.id)).toBe(false);
  });

  it("publishing a teacher's product is refused with a reason, the platform's is not", async () => {
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 2000, status: "draft" });
    const note = await createProduct({ level: 7, subjectSlug: "science", priceFils: 1000 });
    await unconfirm();
    expect((await publishBlockers(unit.id)).join(" ")).toContain("لم تُعتمد رسوم الدفع");
    expect((await publishBlockers(note.id)).join(" ")).not.toContain("رسوم الدفع");
    await confirm();
    expect((await publishBlockers(unit.id)).join(" ")).not.toContain("رسوم الدفع");
  });

  it("a fee change reaches the audit log with the values before and after", async () => {
    await saveSettings({ fee_percent_bps: 100, fee_fixed_fils: 50 }, owner.id);
    await sql`delete from audit_logs where action = 'settings.update'`;
    expect((await saveSettingsAction(null, form({ fee_percent: "2.5", fee_fixed: "0.100" })))?.ok).toBe(true);
    const [log] = await sql<{ metadata: Record<string, unknown> }[]>`select metadata from audit_logs where action = 'settings.update'`;
    expect(log.metadata.fees).toEqual({ from: [100, 50], to: [250, 100] });
  });

  it("a save that leaves the fees alone records no fee change", async () => {
    await saveSettings({ fee_percent_bps: 250, fee_fixed_fils: 100 }, owner.id);
    await sql`delete from audit_logs where action = 'settings.update'`;
    expect((await saveSettingsAction(null, form({ fee_percent: "2.5", fee_fixed: "0.100" })))?.ok).toBe(true);
    const [log] = await sql<{ metadata: Record<string, unknown> }[]>`select metadata from audit_logs where action = 'settings.update'`;
    expect(log.metadata.fees).toBeUndefined();
  });

  it("entering values alone does not count as confirmation", async () => {
    await unconfirm();
    await saveSettings({ fee_percent_bps: 250, fee_fixed_fils: 100 }, owner.id);
    expect((await getSettings()).fee_rules_confirmed_at).toBeNull();
    const res = await saveSettingsAction(null, form({ fee_percent: "2.5", fee_fixed: "0.100" }));
    expect(res?.ok).toBe(true);
    expect((await getSettings()).fee_rules_confirmed_at).toBeNull();
    expect(await sql`select 1 from audit_logs where action = 'settings.fee_rules_confirm'`).toHaveLength(0);
  });

  it("the explicit tick confirms once and is audited with the values; a later save keeps the date", async () => {
    await unconfirm();
    expect((await saveSettingsAction(null, form({ fee_percent: "0", fee_fixed: "0", fee_rules_confirm: "on" })))?.ok).toBe(true);
    const first = (await getSettings()).fee_rules_confirmed_at;
    expect(first).not.toBeNull();
    const logs = await sql<{ actor_id: string; metadata: Record<string, unknown> }[]>`select actor_id, metadata from audit_logs where action = 'settings.fee_rules_confirm'`;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actor_id: owner.id, metadata: { feePercentBps: 0, feeFixedFils: 0 } });

    await saveSettingsAction(null, form({ fee_percent: "1", fee_fixed: "0", fee_rules_confirm: "on" }));
    expect((await getSettings()).fee_rules_confirmed_at).toBe(first);
    expect(await sql`select 1 from audit_logs where action = 'settings.fee_rules_confirm'`).toHaveLength(1);
  });

  it("a teacher cannot confirm through a crafted request", async () => {
    await unconfirm();
    ctx.user = { id: teacher.user!.id, email: teacher.user!.email, fullName: "معلم", phone: null, role: "teacher", gradeId: null, isActive: true };
    expect((await saveSettingsAction(null, form({ fee_percent: "0", fee_fixed: "0", fee_rules_confirm: "on" })))?.ok).toBeFalsy();
    expect((await getSettings()).fee_rules_confirmed_at).toBeNull();
  });
});

describe("النص يطابق الكود", () => {
  const html = (props: Parameters<typeof TeacherMoneyRules>[0]) => renderToStaticMarkup(TeacherMoneyRules(props));

  it("states the percent, the fixed amount, the cap and that it is a set rate", () => {
    const h = html({ audience: "teacher", shareBps: 4000, feePercentBps: 250, feeFixedFils: 100 });
    expect(h).toContain("نسبتك ٤٠٪ من صافي كل بيع");
    expect(h).toContain("٢.٥٪ من المبلغ المدفوع بعد الخصم، مقربة لأقرب فلس");
    expect(h).toContain("0.100 د.ك ثابتة لكل طلب");
    expect(h).toContain("بحد أقصى قيمة الطلب");
    expect(h).toContain("قبل حساب الحصة");
    expect(h).toContain("وليس ما تقتطعه ماي فاتورة فعليًا");
    expect(h).toContain("الدفعات القادمة فقط");
    expect(h).toContain("تُقرَّب لأسفل إلى الفلس");
  });

  it("the worked example is the real calculation, not typed numbers", () => {
    for (const [bps, fixed, share] of [
      [250, 100, 4000],
      [333, 7, 3333],
      [2000, 10000, 10000],
    ]) {
      const fee = computeOrderFee(10000, bps, fixed);
      const [line] = computeEarningLines([{ orderItemId: "x", grossFils: 10000, shareBps: share }], 0, fee);
      const h = html({ audience: "owner", shareBps: share, feePercentBps: bps, feeFixedFils: fixed });
      for (const fils of [line.feeFils, line.netFils, line.teacherFils]) expect(h).toContain(filsToKwdString(fils));
    }
  });

  it("a zero rate says plainly that the platform carries the fee", () => {
    const h = html({ audience: "owner", shareBps: 5000, feePercentBps: 0, feeFixedFils: 0 });
    expect(h).toContain("المعدل المعتمد الآن صفر");
    expect(h).toContain("تتحمله المنصة");
    expect(h).not.toContain("وليس ما تقتطعه");
  });

  it("says so when the share is missing, and shows only what applies", () => {
    expect(html({ audience: "teacher", shareBps: null, feePercentBps: 0, feeFixedFils: 0 })).toContain("لم تُحدد نسبتك بعد");
    expect(html({ audience: "owner", shareBps: null, feePercentBps: 0, feeFixedFils: 0 })).toContain("لم تُحدد نسبة هذا المعلم بعد");
    const h = html({ audience: "owner", feePercentBps: 100, feeFixedFils: 0 });
    expect(h).toContain("١٪ من المبلغ المدفوع");
    expect(h).not.toContain("ثابتة لكل طلب");
    expect(h).toContain("بنسبة ٥٠٪");
  });

  it("the teacher sees their share and the live fee on their earnings page", async () => {
    await saveSettings({ fee_percent_bps: 150, fee_fixed_fils: 25 }, owner.id);
    ctx.user = { id: teacher.user!.id, email: teacher.user!.email, fullName: "معلم", phone: null, role: "teacher", gradeId: null, isActive: true };
    const h = renderToStaticMarkup(await TeacherEarningsPage({ searchParams: Promise.resolve({}) }));
    expect(h).toContain('data-testid="money-rules"');
    expect(h).toContain("نسبتك ٤٠٪");
    expect(h).toContain("١.٥٪ من المبلغ المدفوع");
    expect(h).toContain("0.025 د.ك ثابتة لكل طلب");
  });
});
