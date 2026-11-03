import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ClipboardList } from "lucide-react";
import { LegalDoc } from "../terms/_components/legal-doc";

export const metadata: Metadata = { title: "سياسة الاسترجاع", alternates: { canonical: "/refund-policy" } };

export default function RefundPolicyPage() {
  return (
    <LegalDoc
      page="refund"
      sub="متى يحق لك استرجاع المبلغ، وكيف تقدّم الطلب خطوة بخطوة."
      intro={<p>لأن المنتجات رقمية وتصل فور الدفع، ننصحك باستخدام المعاينة المجانية قبل الشراء.</p>}
      sections={[
        {
          id: "cases",
          title: "حالات الاسترجاع",
          Icon: BadgeCheck,
          body: (
            <ul>
              <li>إذا تم خصم المبلغ ولم يظهر المنتج في مكتبتك بعد التحقق.</li>
              <li>إذا تكرر الدفع لنفس الطلب بالخطأ.</li>
              <li>إذا كان الملف تالفًا أو لا يطابق الوصف ولم نتمكن من إصلاحه.</li>
            </ul>
          ),
        },
        {
          id: "how",
          title: "آلية الطلب",
          Icon: ClipboardList,
          body: (
            <p>
              <Link href="/contact">تواصل معنا</Link> خلال ٧ أيام من الشراء مع رقم الطلب، وسنراجع الطلب ونرد عليك. عند الموافقة يُعاد المبلغ لنفس وسيلة الدفع ويُسحب الوصول إلى المنتج.
            </p>
          ),
        },
      ]}
    />
  );
}
