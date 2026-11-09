import { FlaskConical } from "lucide-react";
import { paymentPublicState } from "@/server/payments/public-state";
import { paymentClaims } from "@/lib/site-truth";

/** شريط تنبيه واضح عند تشغيل الدفع في بيئة الاختبار — حتى لا تُعرض مدفوعات تجريبية كأنها حقيقية */
export function SandboxBanner() {
  const text = paymentClaims(paymentPublicState()).banner;
  if (!text) return null;
  return (
    <div
      className="relative border-b border-accent-300 bg-warning-50 bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgb(255_197_49/0.16)_14px_28px)] px-4 py-2 text-center font-display text-[0.82rem] leading-6 font-bold text-warning no-print"
      role="note"
    >
      <span className="inline-flex items-center gap-2">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        <span>{text}</span>
      </span>
    </div>
  );
}
