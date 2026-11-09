import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ar } from "@/lib/design";
import { looksLikeBankDetails, REFUND_HOLD_DAYS } from "@/lib/teacher-terms";
import { createOrder, markOrderPaid } from "@/server/commerce/orders";
import { listEarnings, listPayouts, PayoutRefused, recordPayout, teacherBalance, voidPayout } from "@/server/commerce/earnings";
import { listTeachersAdmin } from "@/server/admin/teachers";
import { applyAcceptedRefund } from "../helpers/payment-flow";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";

const ctx = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.71", userAgent: async () => "t" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => (ctx.user ? { user: ctx.user, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));

const { recordPayoutAction, voidPayoutAction } = await import("@/app/admin/teachers/actions");

let owner: Awaited<ReturnType<typeof createUser>>;
beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: "admin" });
});
afterAll(async () => {
  await closeDb();
});
beforeEach(() => {
  ctx.user = { id: owner.id, email: owner.email, fullName: "المالك", phone: null, role: "admin", gradeId: null, isActive: true };
});

/** بيع مؤكد بحصة 50٪: المبلغ المحفوظ للمعلم = السعر ÷ 2 */
async function sale(teacher: TestTeacher, priceFils: number, ageDays = 0, isTest = false) {
  const unit = await createVideoProduct({ teacherId: teacher.id, priceFils });
  const order = await createOrder({ user: await createUser(), productIds: [unit.id], isTest });
  await sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));
  if (ageDays) await sql`update teacher_earnings set created_at = now() - make_interval(days => ${ageDays}) where order_id = ${order.id}`;
  return order;
}
const pay = (teacherId: string, amountFils: number, extra: { confirmOverBalance?: boolean; reference?: string; note?: string } = {}) =>
  recordPayout({ teacherId, amountFils, method: "bank_transfer", reference: extra.reference ?? "TRX-9", note: extra.note ?? "تسوية", ownerId: owner.id, confirmOverBalance: extra.confirmOverBalance });
const refusal = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PayoutRefused);
  return err as PayoutRefused;
};
const payoutAudit = (teacherId: string, action: string) => sql<{ actor_id: string; reason: string; metadata: Record<string, unknown> }[]>`select actor_id, reason, metadata from audit_logs where entity_id = ${teacherId} and action = ${action} order by created_at`;
const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};

describe("الرصيد المستحق يستبعد فترة الاسترداد", () => {
  it("a sale inside the window is held, one past it is payable", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 4000);
    await sale(t, 2000, 8);
    expect(await teacherBalance(t.id)).toEqual({ earnedFils: 3000, heldFils: 2000, reversedFils: 0, paidFils: 0, balanceFils: 1000, salesCount: 2 });
  });

  it("the boundary is exactly the hold: just inside is held, just outside is not", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    const order = await sale(t, 1000);
    const setAge = (minutes: number) => sql`update teacher_earnings set created_at = now() - make_interval(mins => ${minutes}) where order_id = ${order.id}`;
    await setAge(REFUND_HOLD_DAYS * 24 * 60 - 5);
    expect(await teacherBalance(t.id)).toMatchObject({ heldFils: 500, balanceFils: 0 });
    await setAge(REFUND_HOLD_DAYS * 24 * 60 + 5);
    expect(await teacherBalance(t.id)).toMatchObject({ heldFils: 0, balanceFils: 500 });
  });

  it("the hold is the one the refund policy promises", () => {
    const page = readFileSync("src/app/(site)/refund-policy/page.tsx", "utf8");
    expect(page).toContain(`خلال ${ar(REFUND_HOLD_DAYS)} أيام من الشراء`);
  });

  it("a refunded sale leaves the held amount as well", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    const order = await sale(t, 4000);
    await applyAcceptedRefund(order.id, owner.id, "طلب العميل");
    expect(await teacherBalance(t.id)).toMatchObject({ earnedFils: 0, heldFils: 0, reversedFils: 2000, balanceFils: 0 });
  });

  it("the ledger marks each row with when it is released", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 1000);
    await sale(t, 3000, 9);
    const rows = await listEarnings(t.id);
    expect(rows.map((r) => r.is_held).sort()).toEqual([false, true]);
    const held = rows.find((r) => r.is_held)!;
    expect(new Date(held.held_until).getTime() - new Date(held.created_at).getTime()).toBe(REFUND_HOLD_DAYS * 86_400_000);
  });

  it("the teachers list shows the same payable figure and ignores voided payouts", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 4000);
    await sale(t, 2000, 8);
    const id = await pay(t.id, 400);
    const row = async () => (await listTeachersAdmin()).find((x) => x.id === t.id)!.balance;
    expect(await row()).toBe(600);
    await voidPayout({ payoutId: id, reason: "خطأ", ownerId: owner.id });
    expect(await row()).toBe(1000);
  });
});

describe("التسوية فوق الرصيد", () => {
  it("is refused without the owner's explicit confirmation and leaves nothing behind", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    await sale(t, 4000);
    const err = await refusal(pay(t.id, 1001));
    expect(err.reason).toBe("over_balance");
    expect(err.payableFils).toBe(1000);
    expect(await listPayouts(t.id)).toHaveLength(0);
    expect(await payoutAudit(t.id, "teacher.payout")).toHaveLength(0);
  });

  it("an exact payout passes without a warning", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    await pay(t.id, 1000);
    expect(await teacherBalance(t.id)).toMatchObject({ paidFils: 1000, balanceFils: 0 });
  });

  it("goes through when confirmed, and the audit says by how much it was over", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    await pay(t.id, 1500, { confirmOverBalance: true });
    expect((await teacherBalance(t.id)).balanceFils).toBe(-500);
    const [log] = await payoutAudit(t.id, "teacher.payout");
    expect(log.metadata).toMatchObject({ amountFils: 1500, payableFils: 1000, overByFils: 500 });
    expect(log.actor_id).toBe(owner.id);
  });

  it("a negative balance counts in full against a later payout", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await pay(t.id, 100, { confirmOverBalance: true });
    const err = await refusal(pay(t.id, 1));
    expect(err.payableFils).toBe(-100);
  });

  it("two payouts at once cannot both spend the same balance", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    const results = await Promise.allSettled([pay(t.id, 800), pay(t.id, 800)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(PayoutRefused);
    expect((await teacherBalance(t.id)).paidFils).toBe(800);
  });
});

describe("قفل صف المعلم عند التسوية", () => {
  it("a payout waits for one in progress and then sees it", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let held = () => {};
    const locked = new Promise<void>((r) => (held = r));
    const first = sql.begin(async (tx) => {
      await tx`select id from teachers where id = ${t.id} for update`;
      await tx`insert into teacher_payouts (teacher_id, amount_fils, method, reference, note, created_by) values (${t.id}, 800, 'cash', 'x', 'y', ${owner.id})`;
      held();
      await gate;
    });
    await locked;
    const second = pay(t.id, 800);
    const settled = second.then(
      () => "done",
      () => "done",
    );
    const waiting = await Promise.race([settled, new Promise<string>((r) => setTimeout(() => r("waiting"), 400))]);
    expect(waiting).toBe("waiting");
    release();
    await first;
    expect((await refusal(second)).reason).toBe("over_balance");
  });
});

describe("إلغاء التسوية", () => {
  it("restores the balance exactly once, keeps the row, and audits who and why", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    const id = await pay(t.id, 700);
    expect((await teacherBalance(t.id)).balanceFils).toBe(300);

    await voidPayout({ payoutId: id, reason: "سُجلت بالخطأ", ownerId: owner.id, ip: "192.0.2.5" });
    expect(await teacherBalance(t.id)).toMatchObject({ paidFils: 0, balanceFils: 1000 });
    const err = await refusal(voidPayout({ payoutId: id, reason: "مرة ثانية", ownerId: owner.id }));
    expect(err.reason).toBe("already_voided");
    expect(await teacherBalance(t.id)).toMatchObject({ paidFils: 0, balanceFils: 1000 });

    const [row] = await listPayouts(t.id);
    expect(row).toMatchObject({ id, amount_fils: 700, void_reason: "سُجلت بالخطأ" });
    expect(row.voided_at).toBeInstanceOf(Date);
    const logs = await payoutAudit(t.id, "teacher.payout_void");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actor_id: owner.id, reason: "سُجلت بالخطأ" });
    expect(logs[0].metadata).toMatchObject({ payoutId: id, amountFils: 700 });
  });

  it("two voids at once take effect once", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    const id = await pay(t.id, 700);
    const results = await Promise.allSettled([voidPayout({ payoutId: id, reason: "أ", ownerId: owner.id }), voidPayout({ payoutId: id, reason: "ب", ownerId: owner.id })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await payoutAudit(t.id, "teacher.payout_void")).toHaveLength(1);
    expect((await teacherBalance(t.id)).balanceFils).toBe(1000);
  });

  it("needs a reason, enforced by the database as well", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    const id = await pay(t.id, 100);
    expect((await refusal(voidPayout({ payoutId: id, reason: "   ", ownerId: owner.id }))).reason).toBe("void_reason");
    await expect(sql`update teacher_payouts set voided_at = now() where id = ${id}`).rejects.toThrow();
  });

  it("is owner only, through the action as well", async () => {
    const t = await createTeacher({ shareBps: 5000, withUser: true, mode: "self_managed" });
    await sale(t, 2000, 8);
    const id = await pay(t.id, 100);
    ctx.user = { id: t.user!.id, email: t.user!.email, fullName: "معلم", phone: null, role: "teacher", gradeId: null, isActive: true };
    expect((await voidPayoutAction(null, form({ payoutId: id, reason: "محاولة" }))).ok).toBeFalsy();
    expect((await recordPayoutAction(null, form({ teacherId: t.id, amount: "0.100", method: "cash", reason: "محاولة" }))).ok).toBeFalsy();
    expect((await teacherBalance(t.id)).paidFils).toBe(100);
    expect(await listPayouts(t.id)).toHaveLength(1);
  });
});

describe("الإجراء على الخادم", () => {
  it("refuses an amount over the balance from a crafted request and asks for the confirmation", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    const res = await recordPayoutAction(null, form({ teacherId: t.id, amount: "5.000", method: "bank_transfer", reference: "A1", reason: "تسوية" }));
    expect(res.error).toContain("1.000");
    expect(res.error).toContain("خانة التأكيد");
    expect(await listPayouts(t.id)).toHaveLength(0);
    const ok = await recordPayoutAction(null, form({ teacherId: t.id, amount: "5.000", method: "bank_transfer", reference: "A1", reason: "تسوية", confirmOverBalance: "on" }));
    expect(ok.ok).toBe(true);
    expect((await teacherBalance(t.id)).balanceFils).toBe(-4000);
  });

  it("void through the action restores the balance; a garbage id is refused", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    const id = await pay(t.id, 700);
    expect((await voidPayoutAction(null, form({ payoutId: id, reason: "خطأ" }))).ok).toBe(true);
    expect((await voidPayoutAction(null, form({ payoutId: id, reason: "خطأ" }))).error).toContain("ملغاة");
    expect((await voidPayoutAction(null, form({ payoutId: "x", reason: "خطأ" }))).error).toBeTruthy();
    expect((await teacherBalance(t.id)).balanceFils).toBe(1000);
  });
});

describe("بعد التسوية يحدث الاسترداد", () => {
  it("a refund after a payout turns the balance negative and later sales pay it off", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    const order = await sale(t, 2000, 8);
    await pay(t.id, 1000);
    await applyAcceptedRefund(order.id, owner.id, "طلب العميل");
    expect(await teacherBalance(t.id)).toMatchObject({ earnedFils: 0, reversedFils: 1000, paidFils: 1000, balanceFils: -1000 });
    await sale(t, 3000, 8);
    expect((await teacherBalance(t.id)).balanceFils).toBe(500);
  });
});

describe("بيانات الحساب البنكي لا تُحفظ", () => {
  it("no column in the schema is meant to hold them", async () => {
    const cols = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_name ~* '(iban|bank|swift|account_n)'
    `;
    expect(cols).toEqual([]);
  });

  it("an IBAN in the reference or the note is refused, in latin or Arabic digits, spaced or not", async () => {
    const t = await createTeacher({ shareBps: 5000 });
    await sale(t, 2000, 8);
    const kw = "KW81 CBKU 0000 0000 0000 1234 5601 01";
    expect((await refusal(pay(t.id, 100, { reference: kw }))).reason).toBe("bank_details");
    expect((await refusal(pay(t.id, 100, { note: `حوّلت إلى ${kw.replace(/\s/g, "")}` }))).reason).toBe("bank_details");
    expect((await refusal(pay(t.id, 100, { note: "الآيبان عندي" }))).reason).toBe("bank_details");
    expect(await listPayouts(t.id)).toHaveLength(0);
  });

  it("ordinary transfer references still pass", () => {
    for (const ref of ["TRX-1", "FT23123ABCDE", "FT12345678901234", "123456789012", "تسوية نوفمبر", ""]) expect(looksLikeBankDetails(ref)).toBe(false);
    for (const iban of ["KW81CBKU0000000000001234560101", "SA0380000000608010167519", "ae07 0331 2345 6789 0123 456", "KW٨١CBKU0000000000001234560101"]) expect(looksLikeBankDetails(iban)).toBe(true);
  });
});
