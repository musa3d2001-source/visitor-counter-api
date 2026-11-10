import "server-only";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";

/**
 * تعليق طلب مدفوع (K003): نزاع على دفعة، أو استرداد جزئي نُفذ من لوحة البوابة.
 * المال ربما خرج، والبوابة لا تقول لنا كيف انتهى الأمر بكلمة يمكن الاعتماد عليها، فالأثر التلقائي الآمن هو الوسط:
 * لا يُلغى الطلب ولا تُعكس الأرباح، ولا يبقى كل شيء كأنه لم يحدث. يُوقف وصول هذا الطلب وأرباحه، ويصل المالك تنبيه بقرار واحد.
 * القرار يعيد بالضبط ما أوقفه التعليق، أو يسجل أن المال عاد فيعمل عمل الاسترداد (refunds.ts: recordMoneyReturned).
 * الإيقاف يمر بجدول الصلاحيات نفسه، فكل فحص وصول قائم يحترمه دون تعديل.
 */
export const HOLD_REVOKE_REASON = "تعليق: مراجعة دفعة";

export type OrderHoldKind = "dispute" | "partial_refund";

/**
 * على المستدعي أن يكون قد قفل صف الطلب. الناتج: هل بدأ تعليق جديد الآن.
 * تكرار الحدث لا يعيد التعليق بعد أن أنهاه المالك، إلا إذا صار النزاع نفسه LOST بعد قرار سابق بإعادة الوصول.
 */
export async function placeOrderHold(db: Db, input: { orderId: string; paymentId: string | null; kind: OrderHoldKind; sourceKey: string; status: string | null; amountFils: number | null }): Promise<boolean> {
  const sourceKey = input.sourceKey.slice(0, 128);
  const status = input.status?.slice(0, 32) ?? null;
  const [order] = await db<{ status: string }[]>`select status from orders where id = ${input.orderId}`;
  if (order?.status !== "paid") return false;

  const [existing] = await db<{ id: string; released_at: Date | null; resolution: string | null; gateway_status: string | null }[]>`
    select id, released_at, resolution, gateway_status from order_holds where source_key = ${sourceKey} for update
  `;
  let holdId: string | null = null;
  if (existing) {
    if (existing.released_at === null) {
      await db`update order_holds set gateway_status = ${status} where id = ${existing.id}`;
      return false;
    }
    if (status !== "LOST" || existing.gateway_status === "LOST" || existing.resolution !== "released") return false;
    const [revived] = await db<{ id: string }[]>`
      update order_holds set held_at = now(), released_at = null, released_by = null, resolution = null, gateway_status = ${status}
      where id = ${existing.id} and not exists (select 1 from order_holds other where other.order_id = ${input.orderId} and other.released_at is null)
      returning id
    `;
    holdId = revived?.id ?? null;
  } else {
    const [created] = await db<{ id: string }[]>`
      insert into order_holds (order_id, payment_id, kind, source_key, gateway_status, amount_fils)
      values (${input.orderId}, ${input.paymentId}, ${input.kind}, ${sourceKey}, ${status}, ${input.amountFils})
      on conflict do nothing
      returning id
    `;
    holdId = created?.id ?? null;
  }
  if (!holdId) return false;

  // الوقت من صف التعليق داخل قاعدة البيانات: Date في JavaScript يفقد الميكروثانية، والإعادة تطابق بها بالضبط
  const revoked = await db<{ id: string }[]>`
    update entitlements e set revoked_at = h.held_at, revoked_by = null, revoke_reason = ${HOLD_REVOKE_REASON}
    from order_holds h
    where h.id = ${holdId} and e.order_id = h.order_id and e.revoked_at is null
    returning e.id
  `;
  const earnings = await db<{ id: string }[]>`
    update teacher_earnings te set held_at = h.held_at from order_holds h
    where h.id = ${holdId} and te.order_id = h.order_id and te.status = 'active'
    returning te.id
  `;
  await audit({ actorId: null, action: "order.held", entityType: "order", entityId: input.orderId, metadata: { kind: input.kind, sourceKey, status, revoked: revoked.length, earningsHeld: earnings.length } }, db);
  return true;
}

type LockedHold = { id: string; order_id: string; payment_id: string | null; kind: OrderHoldKind };

/** قفل الطلب ثم التعليق، بترتيب أقفال مسارات الدفع كلها. null: التعليق انتهى أو غير موجود */
export async function lockActiveHold(db: Db, holdId: string): Promise<LockedHold | null> {
  const [peek] = await db<{ order_id: string }[]>`select order_id from order_holds where id = ${holdId}`;
  if (!peek) return null;
  await db`select id from orders where id = ${peek.order_id} for update`;
  const [hold] = await db<LockedHold[]>`select id, order_id, payment_id, kind from order_holds where id = ${holdId} and released_at is null for update`;
  return hold ?? null;
}

/** ينهي التعليق ويغلق تنبيهات الطلب: قرار المالك هو ما طلبته منه */
export async function closeHold(db: Db, hold: LockedHold, input: { adminId: string; resolution: "released" | "money_returned" }): Promise<void> {
  await db`update order_holds set released_at = now(), released_by = ${input.adminId}, resolution = ${input.resolution} where id = ${hold.id}`;
  await db`update payment_alerts set resolved_at = now(), resolved_by = ${input.adminId}, updated_at = now() where order_id = ${hold.order_id} and resolved_at is null`;
}

export type ReleaseOutcome = "released" | "gone" | "not_paid";

/** المال لم يخرج أو قرر المالك إبقاء الوصول: يعود بالضبط ما أوقفه التعليق، ولا يُمس ما جُدد بعده */
export async function releaseOrderHold(input: { holdId: string; adminId: string; reason: string; ip?: string }): Promise<ReleaseOutcome> {
  return sql.begin(async (db): Promise<ReleaseOutcome> => {
    const hold = await lockActiveHold(db, input.holdId);
    if (!hold) return "gone";
    const [order] = await db<{ status: string }[]>`select status from orders where id = ${hold.order_id}`;
    if (order.status !== "paid") return "not_paid";
    const restored = await db<{ id: string }[]>`
      update entitlements e set revoked_at = null, revoked_by = null, revoke_reason = null
      from order_holds h
      where h.id = ${hold.id} and e.order_id = h.order_id and e.revoked_at = h.held_at and e.revoke_reason = ${HOLD_REVOKE_REASON}
      returning e.id
    `;
    const earnings = await db<{ id: string }[]>`
      update teacher_earnings te set held_at = null from order_holds h
      where h.id = ${hold.id} and te.order_id = h.order_id and te.held_at = h.held_at
      returning te.id
    `;
    await closeHold(db, hold, { adminId: input.adminId, resolution: "released" });
    await audit({ actorId: input.adminId, action: "order.hold_released", entityType: "order", entityId: hold.order_id, reason: input.reason, metadata: { holdId: hold.id, kind: hold.kind, restored: restored.length, earningsRestored: earnings.length }, ip: input.ip ?? null }, db);
    return "released";
  });
}

export type OrderHoldRow = { id: string; order_id: string; order_number: string; is_test: boolean; total_fils: number; kind: OrderHoldKind; gateway_status: string | null; amount_fils: number | null; held_at: Date };

/** التعليقات التي تنتظر قرارًا. طلب استُرد بعد تعليقه لم يعد يحتاج قرارًا، ويعود إلى القائمة إن ألغت البوابة الاسترداد */
export async function openOrderHolds(opts: { orderId?: string; limit?: number } = {}): Promise<OrderHoldRow[]> {
  const orderId = opts.orderId ?? null;
  return sql<OrderHoldRow[]>`
    select h.id, h.order_id, o.number as order_number, o.is_test, o.total_fils, h.kind, h.gateway_status, h.amount_fils, h.held_at
    from order_holds h join orders o on o.id = h.order_id
    where h.released_at is null and o.status = 'paid' and (${orderId}::uuid is null or h.order_id = ${orderId}::uuid)
    order by h.held_at asc limit ${opts.limit ?? 50}
  `;
}
