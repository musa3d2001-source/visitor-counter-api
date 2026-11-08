"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { parseKwdToFils } from "@/lib/money";
import { sql } from "@/server/db";
import { OrderError, refundOrder } from "@/server/commerce/orders";
import { paymentsConfig, requestGatewayRefund, verifyAndApplyPayment } from "@/server/payments/service";
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

export async function reverifyPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const orderId = str(fd, "orderId");
    const invoiceId = str(fd, "invoiceId");
    if (!isUuid(orderId) || !/^\d{1,20}$/.test(invoiceId)) throw new AdminError("طلب غير صالح");
    const [p] = await sql`select 1 from payments where order_id = ${orderId} and gateway_invoice_id = ${invoiceId}`;
    if (!p) throw new AdminError("الفاتورة لا تخص هذا الطلب");
    let result;
    try {
      result = await verifyAndApplyPayment({ invoiceId });
    } catch (err) {
      throw new AdminError(`تعذر الاستعلام من البوابة: ${err instanceof Error ? err.message : String(err)}`);
    }
    await audit({ actorId: adminId, action: "order.reverify", entityType: "order", entityId: orderId, metadata: { invoiceId, state: result.state } });
    revalidatePath(`/admin/orders/${orderId}`);
    const msg = {
      paid: "الدفع مؤكد لدى البوابة وتم منح الصلاحيات",
      failed: "البوابة تفيد بفشل الدفع",
      pending: "الدفع ما زال معلقًا لدى البوابة",
      invalid: `نتيجة غير صالحة: ${"error" in result ? result.error : ""}`,
    }[result.state];
    return result.state === "invalid" ? { error: msg } : { ok: true, message: msg };
  });
}
