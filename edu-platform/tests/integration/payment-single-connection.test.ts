import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrder, markOrderPaid, type OrderRow } from "@/server/commerce/orders";
import { saveSettings } from "@/server/platform/settings";
import { resetEnvCache } from "@/server/env";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

/**
 * تأكيد الدفع يحجز اتصالًا طوال معاملته. لو طلبت المعاملة اتصالًا ثانيًا من الحوض
 * (كما كان يفعل getSettings داخل recordEarnings) لتعلّقت عند امتلاء الحوض بدل أن تكتمل.
 */
let teacher: TestTeacher;

function withinTime<T>(work: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still waiting after ${ms}ms: the transaction asked the pool for a second connection`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function useSmallPool(max: number) {
  await closeDb();
  process.env.DATABASE_POOL_MAX = String(max);
  resetEnvCache();
}

async function teacherOrder() {
  const student = await createUser();
  const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 4000 });
  return createOrder({ user: student, productIds: [unit.id], isTest: false });
}

const confirm = (order: OrderRow) => sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));

beforeAll(async () => {
  await resetDb();
  const owner = await createUser({ role: "admin" });
  await saveSettings({ fee_percent_bps: 250, fee_fixed_fils: 100 }, owner.id);
  teacher = await createTeacher({ mode: "self_managed", shareBps: 4000 });
});

afterAll(async () => {
  await closeDb();
  process.env.DATABASE_POOL_MAX = TEST_ENV.DATABASE_POOL_MAX;
  resetEnvCache();
});

describe("recording earnings inside the payment transaction", () => {
  it("completes on a pool of one connection, and reads the fees through the transaction", async () => {
    const order = await teacherOrder();
    await useSmallPool(1);
    const out = await withinTime(confirm(order));
    expect(out.changed).toBe(true);
    const [e] = await sql<{ fee_fils: number; teacher_fils: number }[]>`select fee_fils, teacher_fils from teacher_earnings where order_id = ${order.id}`;
    // 2.5% من 4000 = 100، + 100 ثابت = 200، والصافي 3800 × 40% = 1520
    expect(e).toEqual({ fee_fils: 200, teacher_fils: 1520 });
  });

  it("many simultaneous confirmations cannot starve a small pool", async () => {
    await useSmallPool(5);
    const orders = await Promise.all(Array.from({ length: 8 }, () => teacherOrder()));
    await useSmallPool(2);
    const results = await withinTime(Promise.all(orders.map(confirm)), 20_000);
    expect(results.every((r) => r.changed)).toBe(true);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from teacher_earnings where order_id = any(${orders.map((o) => o.id)}::uuid[])`;
    expect(n).toBe(8);
  });
});
