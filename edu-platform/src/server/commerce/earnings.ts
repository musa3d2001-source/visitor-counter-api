import "server-only";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";
import { readSettings } from "../platform/settings";
import { looksLikeBankDetails, REFUND_HOLD_DAYS } from "@/lib/teacher-terms";
import { isContainerType, type ProductType } from "@/lib/labels";

/**
 * السجل المحاسبي لأرباح المعلمين (اختياري لكل معلم — يفعّله المالك بتحديد نسبة):
 *   قيمة البند − حصته من الخصم − حصته من الرسوم المعتمدة = الصافي المؤهل
 *   حصة المعلم = floor(الصافي × النسبة) ، حصة المنصة = الباقي
 * يُسجَّل لحظة تأكيد الدفع داخل نفس المعاملة (لا يتكرر — order_item_id وorder_item_part_id فريدان)،
 * بنسبة المعلم والرسوم كما كانت وقت إنشاء الطلب (K011): saleTermsFor تلتقطها، وتغييرها بعد ذلك لا يغيّر ما يستحقه عن هذه المبيعة.
 * ويُعكس عند الاسترداد. التسوية يدوية عبر teacher_payouts مع سجل تدقيق.
 * بند الباقة يتوزع أولًا على محتوياتها بسعر القائمة (order_item_parts)، ثم يوزَّع الخصم والرسوم على الأجزاء كأنها بنود.
 */

/**
 * توزيع مبلغ على أوزان بدقة الفلس (أكبر باقٍ) — مجموع النتيجة = المبلغ دائمًا.
 * الحساب بأعداد صحيحة: الباقيان المتساويان يبقيان متساويين فيُحسم التعادل بالترتيب، والكسور العشرية كانت تكسر ذلك.
 * وزن صفر لا يأخذ فلسًا أبدًا.
 */
export function allocateProportional(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new Error("total must be a non-negative integer");
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) throw new Error("weights must be non-negative integers");
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const parts = weights.map((w, i) => {
    const scaled = BigInt(total) * BigInt(w);
    return { i, floor: Number(scaled / BigInt(sum)), rest: scaled % BigInt(sum) };
  });
  const out = parts.map((p) => p.floor);
  const missing = total - out.reduce((a, b) => a + b, 0);
  const order = [...parts].sort((a, b) => (a.rest === b.rest ? a.i - b.i : a.rest > b.rest ? -1 : 1));
  for (let k = 0; k < missing; k++) out[order[k].i] += 1;
  return out;
}

/** الرسوم المعتمدة لطلب: نسبة + مبلغ ثابت، بحد أقصى قيمة الطلب */
export function computeOrderFee(totalFils: number, feeBps: number, feeFixedFils: number): number {
  if (totalFils <= 0) return 0;
  return Math.min(totalFils, Math.round((totalFils * feeBps) / 10000) + feeFixedFils);
}

export type EarningLine = {
  orderItemId: string;
  grossFils: number;
  discountFils: number;
  feeFils: number;
  netFils: number;
  shareBps: number | null;
  teacherFils: number;
  platformFils: number;
};

/** حساب الأسطر (دالة نقية قابلة للاختبار) */
export function computeEarningLines(
  items: { orderItemId: string; grossFils: number; shareBps: number | null }[],
  discountFils: number,
  feeFils: number,
): EarningLine[] {
  const discounts = allocateProportional(discountFils, items.map((i) => i.grossFils));
  const afterDiscount = items.map((i, k) => i.grossFils - discounts[k]);
  const fees = allocateProportional(Math.min(feeFils, afterDiscount.reduce((a, b) => a + b, 0)), afterDiscount);
  return items.map((i, k) => {
    const net = afterDiscount[k] - fees[k];
    const teacher = i.shareBps === null ? 0 : Math.floor((net * i.shareBps) / 10000);
    return {
      orderItemId: i.orderItemId,
      grossFils: i.grossFils,
      discountFils: discounts[k],
      feeFils: fees[k],
      netFils: net,
      shareBps: i.shareBps,
      teacherFils: teacher,
      platformFils: net - teacher,
    };
  });
}

type TreeProduct = { id: string; type: string; title: string; price_fils: number; teacher_id: string | null; teacher_name: string | null; share_bps: number | null };
type LineOwner = { id: string; name: string | null; shareBps: number | null };
export type ExpandedPart = { productId: string; title: string; owner: LineOwner | null; listPriceFils: number; grossFils: number };

/**
 * توزيع قيمة بند على محتوياته. دالة نقية: الشجرة والمنتجات تُقرأ قبلها.
 *  - الباقة تتوزع دائمًا على محتوياتها، ومحتوى بلا معلم تبقى حصته للمنصة.
 *  - الدورة والوحدة تبقيان سطرًا واحدًا لمعلمها، إلا إن ضمّت محتوى لمعلم آخر. عندها تتوزع، وما لا معلم له فيها يتبع معلمها.
 *  - مجموع أسعار المحتويات صفر: لا أساس للتوزيع، فيبقى البند سطرًا واحدًا.
 * null تعني أن البند لم يتوزع ويُسجَّل كسطر مباشر.
 */
export function expandLine(
  rootId: string,
  grossFils: number,
  rootOwner: LineOwner | null,
  children: Map<string, string[]>,
  products: Map<string, TreeProduct>,
): ExpandedPart[] | null {
  const ownerOf = (p: TreeProduct, inherited: LineOwner | null): LineOwner | null =>
    p.teacher_id ? { id: p.teacher_id, name: p.teacher_name, shareBps: p.share_bps } : inherited;
  const hasOtherTeacher = (id: string, teacherId: string | null, seen: Set<string>): boolean =>
    (children.get(id) ?? []).some((kid) => {
      if (seen.has(kid)) return false;
      const t = products.get(kid)?.teacher_id ?? null;
      return (t !== null && t !== teacherId) || hasOtherTeacher(kid, teacherId, new Set([...seen, kid]));
    });
  const shouldSplit = (node: TreeProduct, owner: LineOwner | null, kids: string[]) =>
    kids.length > 0 &&
    kids.reduce((a, k) => a + products.get(k)!.price_fils, 0) > 0 &&
    (node.type === "bundle" || hasOtherTeacher(node.id, owner?.id ?? null, new Set([node.id])));

  const root = products.get(rootId);
  if (!root || !shouldSplit(root, rootOwner, children.get(rootId) ?? [])) return null;

  const out = new Map<string, ExpandedPart>();
  const walk = (id: string, amount: number, owner: LineOwner | null, seen: Set<string>) => {
    const node = products.get(id)!;
    const kids = (children.get(id) ?? []).filter((k) => !seen.has(k));
    if (!shouldSplit(node, owner, kids)) {
      const prior = out.get(id);
      if (prior) prior.grossFils += amount;
      else out.set(id, { productId: id, title: node.title, owner, listPriceFils: node.price_fils, grossFils: amount });
      return;
    }
    const shares = allocateProportional(amount, kids.map((k) => products.get(k)!.price_fils));
    const passed = node.type === "bundle" ? null : owner;
    kids.forEach((k, i) => walk(k, shares[i], ownerOf(products.get(k)!, passed), new Set([...seen, k])));
  };
  walk(rootId, grossFils, rootOwner, new Set([rootId]));
  return [...out.values()];
}

type OrderLine = {
  orderItemId: string | null;
  partId: string | null;
  productId: string | null;
  title: string;
  teacherId: string | null;
  teacherName: string | null;
  shareBps: number | null;
  grossFils: number;
};

async function loadTree(db: Db, roots: string[]) {
  const edges = roots.length
    ? await db<{ parent: string; child: string; sort_order: number }[]>`
        with recursive c(parent, child, sort_order, depth) as (
          select bi.bundle_id, bi.product_id, bi.sort_order, 1 from bundle_items bi where bi.bundle_id = any(${roots}::uuid[])
          union
          select bi.bundle_id, bi.product_id, bi.sort_order, c.depth + 1 from c join bundle_items bi on bi.bundle_id = c.child where c.depth < 8
        )
        select distinct parent, child, sort_order from c order by parent, sort_order, child
      `
    : [];
  const children = new Map<string, string[]>();
  for (const e of edges) {
    const list = children.get(e.parent) ?? [];
    if (!list.includes(e.child)) list.push(e.child);
    children.set(e.parent, list);
  }
  const products = new Map<string, TreeProduct>();
  if (edges.length) {
    const ids = [...new Set([...roots, ...edges.map((e) => e.child)])];
    const rows = await db<TreeProduct[]>`
      select p.id, p.type, p.title, p.price_fils, p.teacher_id, t.display_name as teacher_name, t.revenue_share_bps as share_bps
      from products p left join teachers t on t.id = p.teacher_id
      where p.id = any(${ids}::uuid[])
    `;
    for (const r of rows) products.set(r.id, r);
  }
  return { children, products };
}

export type SaleTerms = { teacherId: string | null; teacherName: string | null; shareBps: number | null; parts: ExpandedPart[] | null };

/** شروط البيع وقت إنشاء الطلب: معلم كل بند ونسبته، وتوزيع الباقة على محتوياتها. قراءة فقط، خارج المعاملة التي تقفل الكوبون */
export async function saleTermsFor(db: Db, lines: { id: string; type: string; priceFils: number }[]): Promise<Map<string, SaleTerms>> {
  const owners = await db<{ id: string; teacher_id: string | null; teacher_name: string | null; share_bps: number | null }[]>`
    select p.id, p.teacher_id, t.display_name as teacher_name, t.revenue_share_bps as share_bps
    from products p left join teachers t on t.id = p.teacher_id
    where p.id = any(${lines.map((l) => l.id)}::uuid[])
  `;
  const byId = new Map(owners.map((o) => [o.id, o]));
  const { children, products } = await loadTree(db, lines.filter((l) => isContainerType(l.type as ProductType)).map((l) => l.id));
  return new Map(
    lines.map((line) => {
      const o = byId.get(line.id);
      const owner = o?.teacher_id ? { id: o.teacher_id, name: o.teacher_name, shareBps: o.share_bps } : null;
      return [line.id, { teacherId: o?.teacher_id ?? null, teacherName: o?.teacher_name ?? null, shareBps: o?.teacher_id ? o.share_bps : null, parts: expandLine(line.id, line.priceFils, owner, children, products) }];
    }),
  );
}

/**
 * يحوّل بنود الطلب إلى أسطر محاسبية: بند مباشر أو أجزاء باقة.
 * طلب له لقطة (snapshot) يُقرأ كما كُتب ولا يعاد حساب شيء فيه. طلب أقدم من اللقطة يُحسب بما هو قائم الآن، كما كان يُسوّى.
 */
async function orderLines(db: Db, orderId: string, snapshot: boolean): Promise<OrderLine[]> {
  const items = await db<
    { id: string; product_id: string | null; title: string; unit_price_fils: number; teacher_id: string | null; teacher_name: string | null; share_bps: number | null }[]
  >`
    select oi.id, oi.product_id, oi.title, oi.unit_price_fils, oi.teacher_id, oi.teacher_name, case when ${snapshot} then oi.share_bps else t.revenue_share_bps end as share_bps
    from order_items oi left join teachers t on t.id = oi.teacher_id
    where oi.order_id = ${orderId}
    order by oi.created_at, oi.id
  `;
  const saved = await db<
    { id: string; order_item_id: string; product_id: string | null; title: string; teacher_id: string | null; teacher_name: string | null; share_bps: number | null; gross_fils: number }[]
  >`
    select p.id, p.order_item_id, p.product_id, p.title, p.teacher_id, p.teacher_name, case when ${snapshot} then p.share_bps else t.revenue_share_bps end as share_bps, p.gross_fils
    from order_item_parts p left join teachers t on t.id = p.teacher_id
    where p.order_id = ${orderId}
    order by p.created_at, p.id
  `;
  const roots = snapshot ? [] : items.filter((i) => i.product_id && !saved.some((p) => p.order_item_id === i.id)).map((i) => i.product_id!);
  const { children, products } = await loadTree(db, roots);

  const lines: OrderLine[] = [];
  for (const it of items) {
    const already = saved.filter((p) => p.order_item_id === it.id);
    if (already.length) {
      for (const p of already) {
        lines.push({ orderItemId: null, partId: p.id, productId: p.product_id, title: p.title, teacherId: p.teacher_id, teacherName: p.teacher_name, shareBps: p.share_bps, grossFils: p.gross_fils });
      }
      continue;
    }
    const owner = it.teacher_id ? { id: it.teacher_id, name: it.teacher_name, shareBps: it.share_bps } : null;
    const parts = it.product_id ? expandLine(it.product_id, it.unit_price_fils, owner, children, products) : null;
    if (!parts) {
      lines.push({ orderItemId: it.id, partId: null, productId: it.product_id, title: it.title, teacherId: it.teacher_id, teacherName: it.teacher_name, shareBps: it.share_bps, grossFils: it.unit_price_fils });
      continue;
    }
    for (const p of parts) {
      const [row] = await db<{ id: string }[]>`
        insert into order_item_parts (order_id, order_item_id, product_id, title, teacher_id, teacher_name, list_price_fils, gross_fils)
        values (${orderId}, ${it.id}, ${p.productId}, ${p.title}, ${p.owner?.id ?? null}, ${p.owner?.name ?? null}, ${p.listPriceFils}, ${p.grossFils})
        returning id
      `;
      lines.push({ orderItemId: null, partId: row.id, productId: p.productId, title: p.title, teacherId: p.owner?.id ?? null, teacherName: p.owner?.name ?? null, shareBps: p.owner?.shareBps ?? null, grossFils: p.grossFils });
    }
  }
  return lines;
}

/** تسجيل أرباح طلب مدفوع (idempotent) — يُستدعى داخل معاملة تأكيد الدفع */
export async function recordEarnings(db: Db, order: { id: string; total_fils: number; discount_fils: number; is_test: boolean; earnings_snapshot_at?: Date | null; fee_bps?: number | null; fee_fixed_fils?: number | null }) {
  const snapshot = Boolean(order.earnings_snapshot_at);
  const lines = await orderLines(db, order.id, snapshot);
  const eligible = lines.some((l) => l.teacherId && l.shareBps !== null);
  if (!eligible) return 0;
  const terms = snapshot ? { fee_percent_bps: order.fee_bps ?? 0, fee_fixed_fils: order.fee_fixed_fils ?? 0 } : await readSettings(db);
  const fee = computeOrderFee(order.total_fils, terms.fee_percent_bps, terms.fee_fixed_fils);
  const computed = computeEarningLines(
    lines.map((l, k) => ({ orderItemId: String(k), grossFils: l.grossFils, shareBps: l.teacherId ? l.shareBps : null })),
    order.discount_fils,
    fee,
  );
  let n = 0;
  for (let k = 0; k < lines.length; k++) {
    const it = lines[k];
    const l = computed[k];
    if (!it.teacherId || it.shareBps === null) continue;
    const rows = await db`
      insert into teacher_earnings (order_id, order_item_id, order_item_part_id, teacher_id, teacher_name, product_id, product_title,
        gross_fils, discount_fils, fee_fils, net_fils, share_bps, teacher_fils, platform_fils, is_test)
      values (${order.id}, ${it.orderItemId}, ${it.partId}, ${it.teacherId}, ${it.teacherName ?? ""}, ${it.productId}, ${it.title},
        ${l.grossFils}, ${l.discountFils}, ${l.feeFils}, ${l.netFils}, ${it.shareBps}, ${l.teacherFils}, ${l.platformFils}, ${order.is_test})
      on conflict do nothing
      returning id
    `;
    n += rows.length;
  }
  return n;
}

/** عكس أرباح طلب مسترد */
export async function reverseEarnings(db: Db, orderId: string, reason: string) {
  const rows = await db`
    update teacher_earnings set status = 'reversed', reversed_at = now(), reversal_reason = ${reason.slice(0, 500)}
    where order_id = ${orderId} and status = 'active'
    returning id
  `;
  return rows.length;
}

/**
 * earnedFils كل الأرباح النشطة، heldFils ما زال منها داخل فترة الاسترداد، balanceFils ما يصح دفعه الآن.
 * الرصيد قد يكون سالبًا: استرداد بعد التسوية، أو تسوية سبقت انتهاء الفترة.
 */
export type TeacherBalance = { earnedFils: number; heldFils: number; reversedFils: number; paidFils: number; balanceFils: number; salesCount: number };

/** الرصيد المستحق الآن: الأرباح النشطة − المعلق في فترة الاسترداد − التسويات غير الملغاة */
export async function teacherBalance(teacherId: string, opts: { includeTest?: boolean } = {}, db: Db = sql): Promise<TeacherBalance> {
  const includeTest = opts.includeTest ?? false;
  const [e] = await db<{ earned: string; held: string; reversed: string; sales: number }[]>`
    select
      coalesce(sum(teacher_fils) filter (where status = 'active'), 0)::bigint as earned,
      coalesce(sum(teacher_fils) filter (where status = 'active' and (held_at is not null or created_at > now() - make_interval(days => ${REFUND_HOLD_DAYS}))), 0)::bigint as held,
      coalesce(sum(teacher_fils) filter (where status = 'reversed'), 0)::bigint as reversed,
      count(*) filter (where status = 'active')::int as sales
    from teacher_earnings where teacher_id = ${teacherId} and (${includeTest} or not is_test)
  `;
  const [p] = await db<{ paid: string }[]>`select coalesce(sum(amount_fils), 0)::bigint as paid from teacher_payouts where teacher_id = ${teacherId} and voided_at is null`;
  const earned = Number(e.earned);
  const held = Number(e.held);
  const paid = Number(p.paid);
  return { earnedFils: earned, heldFils: held, reversedFils: Number(e.reversed), paidFils: paid, balanceFils: earned - held - paid, salesCount: e.sales };
}

export type EarningRow = {
  id: string;
  order_id: string;
  order_number: string;
  product_title: string;
  /** عنوان الباقة حين يكون السطر جزءًا منها */
  bundle_title: string | null;
  teacher_name: string;
  gross_fils: number;
  discount_fils: number;
  fee_fils: number;
  net_fils: number;
  share_bps: number;
  teacher_fils: number;
  platform_fils: number;
  status: "active" | "reversed";
  is_test: boolean;
  created_at: Date;
  reversed_at: Date | null;
  /** طلبه معلق بسبب نزاع أو استرداد جزئي حتى يقرر المالك. لا يُدفع مهما طال */
  on_review: boolean;
  /** هل ما زال السطر داخل فترة الاسترداد، ومتى تنتهي */
  is_held: boolean;
  held_until: Date;
};

export async function listEarnings(teacherId: string, opts: { includeTest?: boolean; from?: Date; to?: Date; limit?: number } = {}, db: Db = sql) {
  return db<EarningRow[]>`
    select te.id, te.order_id, o.number as order_number, te.product_title, root.title as bundle_title, te.teacher_name, te.gross_fils, te.discount_fils, te.fee_fils,
      te.net_fils, te.share_bps, te.teacher_fils, te.platform_fils, te.status, te.is_test, te.created_at, te.reversed_at,
      (te.status = 'active' and te.held_at is not null) as on_review,
      (te.status = 'active' and (te.held_at is not null or te.created_at > now() - make_interval(days => ${REFUND_HOLD_DAYS}))) as is_held,
      te.created_at + make_interval(days => ${REFUND_HOLD_DAYS}) as held_until
    from teacher_earnings te join orders o on o.id = te.order_id
      left join order_item_parts part on part.id = te.order_item_part_id
      left join order_items root on root.id = part.order_item_id
    where te.teacher_id = ${teacherId}
      and (${opts.includeTest ?? false} or not te.is_test)
      ${opts.from ? db`and te.created_at >= ${opts.from}` : db``}
      ${opts.to ? db`and te.created_at < ${opts.to}` : db``}
    order by te.created_at desc
    limit ${opts.limit ?? 500}
  `;
}

export type PayoutRow = {
  id: string;
  amount_fils: number;
  method: string;
  reference: string;
  note: string;
  paid_at: Date;
  created_by_name: string | null;
  voided_at: Date | null;
  void_reason: string | null;
  voided_by_name: string | null;
};

export async function listPayouts(teacherId: string, db: Db = sql) {
  return db<PayoutRow[]>`
    select tp.id, tp.amount_fils, tp.method, tp.reference, tp.note, tp.paid_at, u.full_name as created_by_name,
      tp.voided_at, tp.void_reason, v.full_name as voided_by_name
    from teacher_payouts tp left join users u on u.id = tp.created_by left join users v on v.id = tp.voided_by
    where tp.teacher_id = ${teacherId}
    order by tp.paid_at desc
  `;
}

/** رفض تسوية لسبب يخص المالك، والإجراء يحوّله إلى رسالة مفهومة */
export class PayoutRefused extends Error {
  constructor(
    public readonly reason: "over_balance" | "bank_details" | "already_voided" | "void_reason" | "request_mismatch",
    public readonly payableFils = 0,
  ) {
    super(`PAYOUT_REFUSED_${reason}`);
    this.name = "PayoutRefused";
  }
}

/**
 * تسجيل تسوية يدوية (تحويل بنكي/نقدي تم خارج المنصة) — للمالك فقط.
 * المبلغ فوق الرصيد المستحق الآن يُرفض ما لم يؤكده المالك صراحة، والفحص تحت قفل صف المعلم حتى لا تمر تسويتان معًا.
 * requestId يصدر مرة واحدة مع النموذج: نقرتان أو إعادة إرسال بعد انقطاع تصل إلى التسوية الأولى ولا تكتب ثانية.
 */
export async function recordPayout(input: {
  requestId: string;
  teacherId: string;
  amountFils: number;
  method: "bank_transfer" | "cash" | "other";
  reference: string;
  note: string;
  paidAt?: Date;
  ownerId: string;
  ip?: string;
  confirmOverBalance?: boolean;
}): Promise<{ id: string; repeated: boolean }> {
  if (!Number.isInteger(input.amountFils) || input.amountFils <= 0) throw new Error("INVALID_AMOUNT");
  if (looksLikeBankDetails(input.reference) || looksLikeBankDetails(input.note)) throw new PayoutRefused("bank_details");
  return sql.begin(async (tx) => {
    const [t] = await tx<{ id: string; display_name: string }[]>`select id, display_name from teachers where id = ${input.teacherId} for update`;
    if (!t) throw new Error("TEACHER_NOT_FOUND");
    const [earlier] = await tx<{ id: string; teacher_id: string; amount_fils: number }[]>`select id, teacher_id, amount_fils from teacher_payouts where request_id = ${input.requestId}`;
    if (earlier) {
      if (earlier.teacher_id !== input.teacherId || earlier.amount_fils !== input.amountFils) throw new PayoutRefused("request_mismatch");
      return { id: earlier.id, repeated: true };
    }
    const { balanceFils } = await teacherBalance(input.teacherId, {}, tx);
    const overByFils = Math.max(0, input.amountFils - Math.max(balanceFils, 0));
    if (overByFils > 0 && !input.confirmOverBalance) throw new PayoutRefused("over_balance", balanceFils);
    const [row] = await tx<{ id: string }[]>`
      insert into teacher_payouts (teacher_id, amount_fils, method, reference, note, paid_at, created_by, request_id)
      values (${input.teacherId}, ${input.amountFils}, ${input.method}, ${input.reference}, ${input.note}, ${input.paidAt ?? new Date()}, ${input.ownerId}, ${input.requestId})
      returning id
    `;
    await audit(
      {
        actorId: input.ownerId,
        action: "teacher.payout",
        entityType: "teacher",
        entityId: input.teacherId,
        reason: input.note || null,
        metadata: { payoutId: row.id, amountFils: input.amountFils, method: input.method, reference: input.reference, payableFils: balanceFils, overByFils },
        ip: input.ip,
      },
      tx,
    );
    return { id: row.id, repeated: false };
  });
}

/**
 * إلغاء تسوية سُجلت بالخطأ: السطر يبقى في السجل، ويعود مبلغه للرصيد مرة واحدة.
 * شرط voided_at is null داخل التحديث نفسه هو ما يمنع الإلغاء مرتين مهما تزامن الطلبان.
 */
export async function voidPayout(input: { payoutId: string; reason: string; ownerId: string; ip?: string }) {
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new PayoutRefused("void_reason");
  if (looksLikeBankDetails(reason)) throw new PayoutRefused("bank_details");
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; teacher_id: string; amount_fils: number; method: string; reference: string }[]>`
      update teacher_payouts set voided_at = now(), voided_by = ${input.ownerId}, void_reason = ${reason}
      where id = ${input.payoutId} and voided_at is null
      returning id, teacher_id, amount_fils, method, reference
    `;
    if (!row) throw new PayoutRefused("already_voided");
    await audit(
      {
        actorId: input.ownerId,
        action: "teacher.payout_void",
        entityType: "teacher",
        entityId: row.teacher_id,
        reason,
        metadata: { payoutId: row.id, amountFils: row.amount_fils, method: row.method, reference: row.reference },
        ip: input.ip,
      },
      tx,
    );
    return row.teacher_id;
  });
}

/**
 * أسطر البيع المنسوبة للمعلمين: البند المباشر، أو أجزاؤه إن كان باقة توزعت.
 * كل تقرير مبيعات يمر من هنا حتى لا تُنسب الباقة كاملة لمعلم واحد أو تضيع مبيعات من بداخلها.
 */
export const saleLines = (db: Db = sql) => db`(
  select oi.order_id, oi.id as line_id, oi.product_id, oi.title, oi.teacher_id, oi.teacher_name, oi.unit_price_fils as gross_fils
  from order_items oi
  where not exists (select 1 from order_item_parts part where part.order_item_id = oi.id)
  union all
  select part.order_id, part.id, part.product_id, part.title, part.teacher_id, part.teacher_name, part.gross_fils
  from order_item_parts part
)`;

/** ملخص مبيعات معلم (للمالك وللمعلم نفسه) — من طلبات مدفوعة حقيقية فقط */
export async function teacherSalesSummary(teacherId: string, opts: { includeTest?: boolean; from?: Date; to?: Date } = {}, db: Db = sql) {
  const [r] = await db<{ orders: number; items: number; gross: string }[]>`
    select count(distinct o.id)::int as orders, count(l.line_id)::int as items, coalesce(sum(l.gross_fils), 0)::bigint as gross
    from ${saleLines(db)} l join orders o on o.id = l.order_id
    where l.teacher_id = ${teacherId} and o.status = 'paid'
      and (${opts.includeTest ?? false} or not o.is_test)
      ${opts.from ? db`and o.paid_at >= ${opts.from}` : db``}
      ${opts.to ? db`and o.paid_at < ${opts.to}` : db``}
  `;
  return { orders: r.orders, items: r.items, grossFils: Number(r.gross) };
}
