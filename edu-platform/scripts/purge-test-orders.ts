/**
 * تنظيف أثر الطلبات التجريبية (is_test) قبل التحول إلى الدفع الحقيقي:
 *   - يسحب الصلاحيات الممنوحة من طلبات تجريبية، إلا ما يغطيه طلب حقيقي مدفوع للطالب نفسه (يُربط به بدل سحبه)
 *   - يغلق الطلبات التجريبية المفتوحة (معلقة/فاشلة → ملغاة) ومحاولات دفعها المفتوحة
 *   - يحذف استخدامات الكوبونات المرتبطة بها حتى تعود حدود الكوبون كما كانت
 * لا يمس الطلبات الحقيقية، ولا أرباح المعلمين التجريبية (مستبعدة أصلًا من الأرصدة والتقارير).
 *
 * الاستخدام:
 *   npm run payments:purge-test-orders                        معاينة فقط (الافتراضي، قراءة دون أي تعديل)
 *   npm run payments:purge-test-orders -- --apply             تنفيذ على قاعدة يدل اسمها على الاختبار
 *   npm run payments:purge-test-orders -- --apply --confirm-database <الاسم الدقيق>
 *                                                             تنفيذ على أي قاعدة أخرى (مثل postgres في Supabase)
 */
import postgres from "postgres";
import { loadEnvFile } from "./_env";

type Db = postgres.Sql | postgres.TransactionSql;

export type PurgeOptions = { apply: boolean; confirmDatabase?: string | null };

export type PurgeReport = {
  database: string;
  applied: boolean;
  testOrders: number;
  revokedEntitlements: number;
  /** صلاحيات من طلب تجريبي يغطيها طلب حقيقي مدفوع: بقيت وأُعيد ربطها به */
  keptEntitlements: number;
  closedOrders: number;
  expiredPayments: number;
  deletedRedemptions: number;
};

export class PurgeRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurgeRefusedError";
  }
}

const TEST_DATABASE_NAME = /(^|[^a-z0-9])(test|e2e|sandbox|staging|dev|local)([^a-z0-9]|$)/i;

/** لماذا نرفض التنفيذ على هذه القاعدة؟ (null = النية واضحة) */
export function purgeRefusalReason(database: string, confirmDatabase?: string | null): string | null {
  if (confirmDatabase !== undefined && confirmDatabase !== null) {
    return confirmDatabase === database ? null : `--confirm-database does not match the current database (${database}). Nothing was changed.`;
  }
  if (TEST_DATABASE_NAME.test(database)) return null;
  return `Database "${database}" does not look like a test database. To apply here, add --confirm-database ${database}. Nothing was changed.`;
}

type Plan = {
  entitlements: { id: string; real_order_id: string | null; real_root: string | null; product_id: string }[];
  testOrders: number;
  closedOrders: string[];
  expiredPayments: string[];
  redemptions: number;
};

async function buildPlan(db: Db): Promise<Plan> {
  const [{ n: testOrders }] = await db<{ n: number }[]>`select count(*)::int as n from orders where is_test`;
  const entitlements = await db<Plan["entitlements"]>`
    with recursive covered(order_id, user_id, paid_at, root, product_id) as (
      select o.id, o.user_id, o.paid_at, oi.product_id, oi.product_id
      from orders o join order_items oi on oi.order_id = o.id
      where o.status = 'paid' and not o.is_test
      union
      select c.order_id, c.user_id, c.paid_at, c.root, bi.product_id
      from covered c join bundle_items bi on bi.bundle_id = c.product_id
    )
    select e.id, e.product_id, real.order_id as real_order_id, real.root as real_root
    from entitlements e
    join orders t on t.id = e.order_id and t.is_test
    left join lateral (
      select c.order_id, c.root from covered c
      where c.user_id = e.user_id and c.product_id = e.product_id
      order by (c.root = c.product_id) desc, c.paid_at desc nulls last
      limit 1
    ) real on true
    where e.revoked_at is null
  `;
  const closedOrders = await db<{ id: string }[]>`select id from orders where is_test and status in ('pending', 'failed')`;
  const expiredPayments = await db<{ id: string }[]>`
    select p.id from payments p join orders o on o.id = p.order_id where o.is_test and p.status in ('initiated', 'pending')
  `;
  const [{ n: redemptions }] = await db<{ n: number }[]>`
    select count(*)::int as n from coupon_redemptions r join orders o on o.id = r.order_id where o.is_test
  `;
  return { entitlements: [...entitlements], testOrders, closedOrders: closedOrders.map((r) => r.id), expiredPayments: expiredPayments.map((r) => r.id), redemptions };
}

function report(database: string, applied: boolean, plan: Plan): PurgeReport {
  return {
    database,
    applied,
    testOrders: plan.testOrders,
    revokedEntitlements: plan.entitlements.filter((e) => !e.real_order_id).length,
    keptEntitlements: plan.entitlements.filter((e) => e.real_order_id).length,
    closedOrders: plan.closedOrders.length,
    expiredPayments: plan.expiredPayments.length,
    deletedRedemptions: plan.redemptions,
  };
}

/** المعاينة لا تكتب شيئًا (معاملة للقراءة فقط)، والتنفيذ كله في معاملة واحدة ويمكن تكراره بأمان */
export async function purgeTestOrders(sql: postgres.Sql, opts: PurgeOptions): Promise<PurgeReport> {
  const [{ database }] = await sql<{ database: string }[]>`select current_database() as database`;
  if (!opts.apply) return (await sql.begin("read only", async (tx) => report(database, false, await buildPlan(tx)))) as PurgeReport;

  const refused = purgeRefusalReason(database, opts.confirmDatabase);
  if (refused) throw new PurgeRefusedError(refused);

  return (await sql.begin(async (tx) => {
    const plan = await buildPlan(tx);
    const revoke = plan.entitlements.filter((e) => !e.real_order_id).map((e) => e.id);
    if (revoke.length) {
      await tx`
        update entitlements set revoked_at = now(), revoked_by = null, revoke_reason = 'purge of test orders'
        where id = any(${revoke}::uuid[]) and revoked_at is null
      `;
    }
    for (const e of plan.entitlements.filter((x) => x.real_order_id)) {
      const direct = e.real_root === e.product_id;
      await tx`
        update entitlements set order_id = ${e.real_order_id}, source = ${direct ? "purchase" : "bundle"}, via_bundle_id = ${direct ? null : e.real_root}
        where id = ${e.id}
      `;
    }
    if (plan.closedOrders.length) await tx`update orders set status = 'cancelled' where id = any(${plan.closedOrders}::uuid[])`;
    if (plan.expiredPayments.length) await tx`update payments set status = 'expired' where id = any(${plan.expiredPayments}::uuid[])`;
    await tx`delete from coupon_redemptions r using orders o where o.id = r.order_id and o.is_test`;
    const out = report(database, true, plan);
    if (out.revokedEntitlements || out.keptEntitlements || out.closedOrders || out.expiredPayments || out.deletedRedemptions) {
      await tx`
        insert into audit_logs (actor_id, action, entity_type, reason, metadata)
        values (null, 'payments.purge_test_orders', 'system', 'purge-test-orders script', ${tx.json(out as never)})
      `;
    }
    return out;
  })) as PurgeReport;
}

export function parsePurgeArgs(argv: string[]): PurgeOptions {
  const opts: PurgeOptions = { apply: false, confirmDatabase: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--confirm-database" && argv[i + 1] && !argv[i + 1].startsWith("--")) opts.confirmDatabase = argv[++i];
    else if (arg.startsWith("--confirm-database=") && arg.length > "--confirm-database=".length) opts.confirmDatabase = arg.slice("--confirm-database=".length);
    else throw new PurgeRefusedError(`Unknown or incomplete argument: ${arg}. Nothing was changed.`);
  }
  return opts;
}

async function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL غير مضبوط");
    process.exit(1);
  }
  const opts = parsePurgeArgs(process.argv.slice(2));
  const pgbouncer = process.env.DATABASE_PGBOUNCER === "true";
  const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: !pgbouncer, ...(pgbouncer && { max_pipeline: 1 }) });
  try {
    const out = await purgeTestOrders(sql, opts);
    console.log(out.applied ? "Applied:" : "Dry run, nothing was changed. Add --apply to act:");
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("purge-test-orders.ts")) {
  main().catch((err) => {
    console.error(err instanceof PurgeRefusedError ? err.message : err);
    process.exit(err instanceof PurgeRefusedError ? 2 : 1);
  });
}
