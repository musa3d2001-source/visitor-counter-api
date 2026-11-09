import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { SoftNote } from "../../_components/people/bits";

/** قول الحقيقة للمالك: أمر الاسترداد هنا يخرج بلا رمز تحقق، لأن التحقق بخطوتين غير مفعّل وغير إلزامي في هذا النشر */
export function StepUpOffNote() {
  return (
    <SoftNote icon={<ShieldAlert aria-hidden />} className="mb-4" data-testid="step-up-off-note">
      لا يُطلب رمز تحقق عند الاسترداد، لأن التحقق بخطوتين غير مفعّل على حسابك وغير إلزامي في هذا النشر.{" "}
      <Link href="/admin/security" className="text-brand-700 underline underline-offset-4">
        تفعيله
      </Link>
    </SoftNote>
  );
}
