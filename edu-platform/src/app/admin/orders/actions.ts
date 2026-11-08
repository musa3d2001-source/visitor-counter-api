"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { parseKwdToFils } from "@/lib/money";
import { sql } from "@/server/db";
import { OrderError, refundOrder } from "@/server/commerce/orders";
import { ExtraPaymentRefundError, checkOrderInvoices, paymentsConfig, refundExtraPayment, requestGatewayRefund } from "@/server/payments/service";
import { dismissExtraPayment } from "@/server/payments/extras";
import { resolvePaymentAlert } from "@/server/payments/monitoring";
import { audit } from "@/server/platform/audit";
import { AdminError, adminAction, isUuid, str } from "@/server/admin/common";

export async function refundOrderAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const orderId = str(fd, "orderId");
    const reason = str(fd, "reason");
    if (!isUuid(orderId)) throw new AdminError("طلب غير صالح");
    if (reason.length < 3) throw new AdminError("اكتب سبب الاسترداد (٣ أحرف على الأقل)");
    const amountRaw = str(fd, "amount");
    let amountFils: number | undefined;
    if (amountRaw) {
      const f = parseKwdToFils(amountRaw);
      if (f === null || f <= 0) throw new AdminError("مبلغ الاسترداد غير صحيح");
      amountFils = f;
    }
    try {
      const r = await refundOrder({ orderId, adminId, reason, amountFils, ip });
      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath("/admin/orders");
      return { ok: true, message: `تم تسجيل الاسترداد وسحب ${r.revoked} صلاحية مرتبطة بالطلب` };
    } catch (err) {
      if (err instanceof OrderError) throw new AdminError(err.userMessage);
      throw err;
    }
  });
}

export async function gatewayRefundAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const refundId = str(fd, "refundId");
    const orderId = str(fd, "orderId");
    if (!isUuid(refundId) || !isUuid(orderId)) throw new AdminError("طلب غير صالح");
    const cfg = paymentsConfig();
    if (!cfg.enabled) throw new AdminError(`بوابة الدفع غير مفعلة: ${cfg.reason}`);
    const [r] = await sql<{ payment_id: string | null; amount_fils: number; reason: string; status: string; provider: string | null }[]>`
      select r.payment_id, r.amount_fils, r.reason, r.status, p.provider
      from refunds r left join payments p on p.id = r.payment_id where r.id = ${refundId} and r.order_id = ${orderId}
    `;
    if (!r || !r.payment_id) throw new AdminError("لا يوجد دفع إلكتروني مرتبط بهذا الاسترداد");
    if (r.provider !== "myfatoorah") throw new AdminError("هذا الدفع لم يتم عبر MyFatoorah");
    if (r.status !== "recorded" && r.status !== "failed") throw new AdminError("تم إرسال طلب الاسترداد للبوابة مسبقًا");
    try {
      const res = await requestGatewayRefund({ refundId, paymentRowId: r.payment_id, amountFils: r.amount_fils, comment: r.reason });
      await audit({ actorId: adminId, action: "order.gateway_refund", entityType: "order", entityId: orderId, metadata: { refundId, gatewayRefundId: res.RefundId } });
    } catch (err) {
      await sql`update refunds set status = 'failed' where id = ${refundId}`;
      throw new AdminError(`رفضت البوابة طلب الاسترداد: ${err instanceof Error ? err.message : String(err)}`);
    }
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true, message: "تم إرسال طلب الاسترداد إلى MyFatoorah. ستتحدث الحالة عند وصول إشعار البوابة." };
  });
}

export async function resolvePaymentAlertAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const alertId = str(fd, "alertId");
    if (!isUuid(alertId)) throw new AdminError("تنبيه غير صالح");
    const done = await resolvePaymentAlert({ alertId, adminId, ip });
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    return done ? { ok: true, message: "أُغلق التنبيه" } : { ok: true, message: "هذا التنبيه مغلق مسبقًا" };
  });
}

/** إعادة التحقق من كل فواتير الطلب غير المؤكدة، لا من آخرها فقط: الدفعة قد تكون على فاتورة أقدم */
export async function reverifyPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const orderId = str(fd, "orderId");
    if (!isUuid(orderId)) throw new AdminError("طلب غير صالح");
    const [order] = await sql`select 1 from orders where id = ${orderId}`;
    if (!order) throw new AdminError("الطلب غير موجود");
    const walk = await checkOrderInvoices(orderId);
    await audit({
      actorId: adminId,
      action: "order.reverify",
      entityType: "order",
      entityId: orderId,
      metadata: { total: walk.total, checked: walk.checked, allChecked: walk.allChecked, anyPaid: walk.anyPaid, anyFlagged: walk.anyFlagged },
      ip,
    });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    if (!walk.allChecked) return { error: `تعذر التحقق من كل الفواتير (تم فحص ${walk.checked} من ${walk.total}): ${walk.error}` };
    if (walk.anyFlagged) return { ok: true, message: "وصلت دفعة زائدة على هذا الطلب وسُجلت في قائمة الدفعات الزائدة" };
    if (walk.anyPaid) return { ok: true, message: "الدفع مؤكد لدى البوابة وتم منح الصلاحيات" };
    if (walk.total === 0) return { ok: true, message: "لا توجد فواتير غير مؤكدة على هذا الطلب" };
    return { ok: true, message: `تم فحص كل الفواتير (${walk.checked}): لا توجد دفعة مؤكدة لدى البوابة` };
  });
}

/** استرداد دفعة زائدة واحدة لدى البوابة. الطلب والوصول والأرباح لا تتغير */
export async function refundExtraPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const extraId = str(fd, "extraId");
    const reason = str(fd, "reason");
    if (!isUuid(extraId)) throw new AdminError("طلب غير صالح");
    if (reason.length < 3) throw new AdminError("اكتب سبب الاسترداد (٣ أحرف على الأقل)");
    let out;
    try {
      out = await refundExtraPayment({ extraId, adminId, reason, ip });
    } catch (err) {
      if (err instanceof ExtraPaymentRefundError) throw new AdminError(err.userMessage);
      throw err;
    }
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    if (out.state === "refund_requested") return { ok: true, message: "تم إرسال طلب الاسترداد إلى البوابة. ستتحدث الحالة عند وصول إشعارها." };
    if (out.state === "refunded") return { ok: true, message: "البوابة تؤكد أن هذه الدفعة مستردة" };
    if (out.state === "refund_unknown") return { error: "لم نتأكد من نتيجة الطلب لدى البوابة. أعد المحاولة، وسنتحقق أولًا حتى لا يتكرر الاسترداد." };
    return { error: `رفضت البوابة طلب الاسترداد: ${out.error ?? ""}` };
  });
}

/** إغلاق سجل دفعة زائدة بلا استرداد، مثل التسوية خارج البوابة */
export async function dismissExtraPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const extraId = str(fd, "extraId");
    const reason = str(fd, "reason");
    if (!isUuid(extraId)) throw new AdminError("طلب غير صالح");
    if (reason.length < 3) throw new AdminError("اكتب سبب الإغلاق (٣ أحرف على الأقل)");
    const done = await dismissExtraPayment({ extraId, adminId, reason, ip });
    if (!done) throw new AdminError("لا يمكن إغلاق هذه الدفعة في حالتها الحالية");
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    return { ok: true, message: "أُغلق سجل الدفعة" };
  });
}
