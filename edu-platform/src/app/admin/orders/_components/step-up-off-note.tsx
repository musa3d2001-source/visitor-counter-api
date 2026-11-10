import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { SoftNote } from "../../_components/people/bits";

/** قول الحقيقة للمالك: بلا عامل ثانٍ مسجَّل لا يخرج أي استرداد، في كل إعداد */
export function StepUpOffNote() {
  return (
    <SoftNote icon={<ShieldAlert aria-hidden />} className="mb-4" data-testid="step-up-off-note">
      لن يُرسل أي استرداد قبل تفعيل التحقق بخطوتين على حسابك.{" "}
      <Link href="/admin/security" className="text-brand-700 underline underline-offset-4">
        تفعيله
      </Link>
    </SoftNote>
  );
}
