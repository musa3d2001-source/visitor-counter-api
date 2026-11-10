import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/form";
import { GUARDIAN_DECLARATION_HINT, GUARDIAN_DECLARATION_TEXT } from "@/lib/consent";

/**
 * خانات الموافقة قبل الشراء، ولا تكون مؤشرة مسبقًا أبدًا. بلا hooks فتعمل في صفحات الخادم والعميل.
 * الصياغة مسودة بانتظار المحامي، والفرض الحقيقي في الخادم: createOrder و startPayment.
 */
export function PurchaseConsentFields({ guardian, terms, errors }: { guardian: boolean; terms: boolean; errors?: Record<string, string> }) {
  if (!guardian && !terms) return null;
  return (
    <div className="mt-6 rounded-[1.25rem] border-2 border-dashed border-[#F0C766] bg-[linear-gradient(160deg,#fffaf0,#fff1cf)] p-4" data-testid="purchase-consent">
      {guardian ? (
        <>
          <p className="flex items-center gap-2 font-display text-[1rem] font-extrabold text-[#6e4700]">
            <ShieldCheck className="size-5 shrink-0" aria-hidden /> قبل الدفع
          </p>
          <Checkbox name="guardianDeclaration" required data-testid="guardian-declaration" className="mt-2 text-ink" label={GUARDIAN_DECLARATION_TEXT} aria-describedby="guardian-hint" />
          <p id="guardian-hint" className="text-[0.88rem] leading-7 text-[#6e4700]">
            {GUARDIAN_DECLARATION_HINT}
          </p>
          {errors?.guardianDeclaration ? (
            <p className="mt-1 text-sm font-medium text-danger" role="alert" data-testid="guardian-declaration-error">
              {errors.guardianDeclaration}
            </p>
          ) : null}
        </>
      ) : null}
      {terms ? (
        <div className={guardian ? "mt-3 border-t border-dashed border-[#F0C766] pt-2" : undefined}>
          <Checkbox
            name="termsAccepted"
            required
            data-testid="terms-accepted"
            className="text-ink"
            label={
              <>
                أوافق على{" "}
                <Link prefetch={false} href="/terms" target="_blank" className="font-bold text-brand-700 underline underline-offset-4">
                  الشروط والأحكام
                </Link>{" "}
                و
                <Link prefetch={false} href="/privacy" target="_blank" className="font-bold text-brand-700 underline underline-offset-4">
                  سياسة الخصوصية
                </Link>
              </>
            }
          />
          {errors?.termsAccepted ? (
            <p className="mt-1 text-sm font-medium text-danger" role="alert" data-testid="terms-accepted-error">
              {errors.termsAccepted}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
