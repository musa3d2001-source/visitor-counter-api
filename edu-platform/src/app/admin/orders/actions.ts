"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { sql } from "@/server/db";
import { ExtraPaymentRefundError, checkOrderInvoices, recheckExtraPayment, recheckOrderRefund, refundExtraPayment, requestOrderRefund } from "@/server/payments/service";
import { dismissExtraPayment } from "@/server/payments/extras";
import { RefundError, dismissRefund, recordMoneyReturned, type RefundOutcome } from "@/server/payments/refunds";
import { releaseOrderHold } from "@/server/payments/holds";
import { assertFreshProof, assertRefundStepUp } from "@/server/auth/step-up";
import { resolvePaymentAlert } from "@/server/payments/monitoring";
import { audit } from "@/server/platform/audit";
import { AdminError, adminAction, isUuid, str } from "@/server/admin/common";

const REFUND_ACCEPTED_MESSAGE = "قبلت البوابة طلب الاسترداد، فأُغلق وصول الطالب وعُكست الأرباح. يبقى بانتظار التنفيذ: يراجعه فريق مالية MyFatoorah إلا إن كان الاسترداد التلقائي مفعلًا في حسابك، وستتحدث الحالة عند وصول إشعارها.";
const REFUND_COMPLETED_MESSAGE = "البوابة تؤكد تنفيذ الاسترداد، وأُغلق وصول الطالب وعُكست الأرباح.";
const REFUND_UNKNOWN_MESSAGE = "لم يصل رد واضح من البوابة، فلم يتغير الطلب. لا تعد الإرسال قبل «إعادة التحقق»، وقد يكون الطلب وصلها.";

function refusalMessage(error: string | undefined): string {
  return `رفضت البوابة طلب الاسترداد ولم يتغير الطلب. السبب: ${error ?? "غير معروف"}. إن كان السبب الرصيد: الاسترداد يحتاج رصيدًا متاحًا في حساب البوابة، والمبالغ المقبوضة اليوم قد لا تدخل فيه، فأعد المحاولة لاحقًا.`;
}

function refundActionResult(out: RefundOutcome): ActionState {
  if (out.state === "requested") return { ok: true, message: REFUND_ACCEPTED_MESSAGE };
  if (out.state === "completed") return { ok: true, message: REFUND_COMPLETED_MESSAGE };
  if (out.state === "unknown") return { error: out.error === undefined || out.wait ? REFUND_UNKNOWN_MESSAGE : `${REFUND_UNKNOWN_MESSAGE} (${out.error})` };
  if (out.state === "not_sent") return { error: `لم يُرسل طلب الاسترداد: ${out.error ?? "لم تجده البوابة"}. يمكنك إعادة الإرسال.` };
  if (out.state === "held_back") return { error: `لم يُرسل طلب الاسترداد ولم يتغير الطلب. السبب: ${out.error ?? "غير معروف"}` };
  return { error: refusalMessage(out.error) };
}

function revalidateRefund(orderId: string | null) {
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

async function refundCommand(work: () => Promise<RefundOutcome>): Promise<RefundOutcome> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof RefundError) throw new AdminError(err.userMessage);
    throw err;
  }
}

/** أمر الاسترداد الوحيد: كامل قيمة الطلب، عبر البوابة أولًا. لا حقل مبلغ: الجزئي يتم من لوحة البوابة ويصلنا تنبيهًا */
export async function refundOrderAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const orderId = str(fd, "orderId");
    const reason = str(fd, "reason");
    if (!isUuid(orderId)) throw new AdminError("طلب غير صالح");
    if (reason.length < 3) throw new AdminError("اكتب سبب الاسترداد (٣ أحرف على الأقل)");
    await assertRefundStepUp({ adminId, fd, ip });
    const out = await refundCommand(() => requestOrderRefund({ orderId, adminId, reason, ip }));
    revalidateRefund(orderId);
    return refundActionResult(out);
  });
}

function holdInput(fd: FormData) {
  const holdId = str(fd, "holdId");
  const orderId = str(fd, "orderId");
  const reason = str(fd, "reason");
  if (!isUuid(holdId) || !isUuid(orderId)) throw new AdminError("طلب غير صالح");
  if (reason.length < 3) throw new AdminError("اكتب سبب القرار (٣ أحرف على الأقل)");
  return { holdId, orderId, reason };
}

/** المال لم يخرج أو قرر المالك إبقاء الوصول: يعود بالضبط ما أوقفه التعليق */
export async function releaseOrderHoldAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const { holdId, orderId, reason } = holdInput(fd);
    await assertRefundStepUp({ adminId, fd, ip });
    const out = await releaseOrderHold({ holdId, adminId, reason, ip });
    revalidateRefund(orderId);
    if (out === "released") return { ok: true, message: "عاد وصول الطالب وأرباح المعلم لهذا الطلب." };
    return { error: "حُسم هذا الأمر من قبل. حدّث الصفحة." };
  });
}

/** المال عاد كاملًا عبر البوابة: أثر الاسترداد الكامل، دون أي طلب جديد إلى البوابة */
export async function recordMoneyReturnedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const { holdId, orderId, reason } = holdInput(fd);
    await assertRefundStepUp({ adminId, fd, ip });
    const out = await recordMoneyReturned({ holdId, adminId, reason, ip });
    revalidateRefund(orderId);
    if (out === "recorded") return { ok: true, message: "سُجل الطلب مستردًا، وعُكست الأرباح وأُغلق الوصول نهائيًا. لم نرسل شيئًا إلى البوابة." };
    if (out === "conflict") return { error: "يوجد استرداد آخر جارٍ على هذا الطلب. أكمله أو أغلقه أولًا." };
    return { error: "حُسم هذا الأمر من قبل. حدّث الصفحة." };
  });
}

/** إعادة إرسال سجل رُفض أو تأكدنا أنه لم يصل. يسأل البوابة أولًا، والخادم يرفض السجل غير المؤكد */
export async function resendRefundAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const orderId = str(fd, "orderId");
    if (!isUuid(orderId)) throw new AdminError("طلب غير صالح");
    await assertRefundStepUp({ adminId, fd, ip });
    const out = await refundCommand(() => requestOrderRefund({ orderId, adminId, ip }));
    revalidateRefund(orderId);
    return refundActionResult(out);
  });
}

/** سؤال البوابة عن سجل غير مؤكد. لا يرسل شيئًا، فلا يحتاج خطوة تحقق إضافية */
export async function recheckRefundAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const refundId = str(fd, "refundId");
    const orderId = str(fd, "orderId");
    if (!isUuid(refundId)) throw new AdminError("طلب غير صالح");
    const out = await refundCommand(() => recheckOrderRefund({ refundId, adminId, ip }));
    revalidateRefund(isUuid(orderId) ? orderId : null);
    if (out.state === "requested") return { ok: true, message: REFUND_ACCEPTED_MESSAGE };
    if (out.state === "completed") return { ok: true, message: REFUND_COMPLETED_MESSAGE };
    if (out.state === "not_sent") return { ok: true, message: "تأكدنا أن الطلب لم يصل البوابة، ولم يتغير الطلب. يمكنك إعادة الإرسال الآن." };
    if (out.state === "failed") return { error: refusalMessage(out.error) };
    if (out.wait) return { error: "لم تظهر العملية لدى البوابة بعد. أعد التحقق بعد دقيقتين." };
    return { error: out.error ?? REFUND_UNKNOWN_MESSAGE };
  });
}

/** إغلاق سجل استرداد بلا إرسال (مثل التسوية خارج البوابة). لا يغيّر الطلب */
export async function dismissRefundAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const refundId = str(fd, "refundId");
    const orderId = str(fd, "orderId");
    const reason = str(fd, "reason");
    if (!isUuid(refundId)) throw new AdminError("طلب غير صالح");
    if (reason.length < 3) throw new AdminError("اكتب سبب الإغلاق (٣ أحرف على الأقل)");
    await assertFreshProof({ adminId, ip, command: "refund.dismiss" });
    const done = await dismissRefund({ refundId, adminId, reason, ip });
    if (!done) throw new AdminError("لا يمكن إغلاق هذا السجل في حالته الحالية");
    revalidateRefund(isUuid(orderId) ? orderId : null);
    return { ok: true, message: "أُغلق سجل الاسترداد ولم يتغير الطلب" };
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
    await assertRefundStepUp({ adminId, fd, ip });
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

/** سؤال البوابة عن استرداد دفعة زائدة لم يُحسم. لا يرسل شيئًا، فلا يحتاج خطوة تحقق إضافية */
export async function recheckExtraPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const extraId = str(fd, "extraId");
    if (!isUuid(extraId)) throw new AdminError("طلب غير صالح");
    let out;
    try {
      out = await recheckExtraPayment({ extraId, adminId, ip });
    } catch (err) {
      if (err instanceof ExtraPaymentRefundError) throw new AdminError(err.userMessage);
      throw err;
    }
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    if (out.state === "refunded") return { ok: true, message: "البوابة تؤكد تنفيذ استرداد هذه الدفعة." };
    if (out.state === "refund_failed") return { error: "ألغت البوابة طلب الاسترداد ولم يخرج المال. يمكنك إعادة المحاولة." };
    return { ok: true, message: "ما زال الطلب بانتظار التنفيذ لدى البوابة." };
  });
}

/** إغلاق سجل دفعة زائدة بلا استرداد، مثل التسوية خارج البوابة */
export async function dismissExtraPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const extraId = str(fd, "extraId");
    const reason = str(fd, "reason");
    if (!isUuid(extraId)) throw new AdminError("طلب غير صالح");
    if (reason.length < 3) throw new AdminError("اكتب سبب الإغلاق (٣ أحرف على الأقل)");
    await assertFreshProof({ adminId, ip, command: "extra_payment.dismiss" });
    const done = await dismissExtraPayment({ extraId, adminId, reason, ip });
    if (!done) throw new AdminError("لا يمكن إغلاق هذه الدفعة في حالتها الحالية");
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    return { ok: true, message: "أُغلق سجل الدفعة" };
  });
}
