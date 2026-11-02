import { paymentsConfig } from "@/server/payments/service";

/** شريط تنبيه واضح عند تشغيل الدفع في بيئة الاختبار — حتى لا تُعرض مدفوعات تجريبية كأنها حقيقية */
export function SandboxBanner() {
  const cfg = paymentsConfig();
  if (!cfg.enabled || cfg.environment !== "sandbox") return null;
  return (
    <div className="bg-warning-50 px-4 py-2 text-center text-xs font-semibold text-warning no-print" role="note">
      وضع تجريبي: الدفع يتم عبر بيئة اختبار MyFatoorah ولن يتم خصم أي مبلغ حقيقي.
    </div>
  );
}
