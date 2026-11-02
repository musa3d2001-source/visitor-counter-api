import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = { title: "سياسة الاسترجاع", alternates: { canonical: "/refund-policy" } };

export default function RefundPolicyPage() {
  return (
    <LegalPage title="سياسة الاسترجاع">
      <p>لأن المنتجات رقمية وتصل فور الدفع، ننصحك باستخدام المعاينة المجانية قبل الشراء.</p>
      <h2>حالات الاسترجاع</h2>
      <ul>
        <li>إذا تم خصم المبلغ ولم يظهر المنتج في مكتبتك بعد التحقق.</li>
        <li>إذا تكرر الدفع لنفس الطلب بالخطأ.</li>
        <li>إذا كان الملف تالفًا أو لا يطابق الوصف ولم نتمكن من إصلاحه.</li>
      </ul>
      <h2>آلية الطلب</h2>
      <p>تواصل معنا خلال 7 أيام من الشراء مع رقم الطلب، وسنراجع الطلب ونرد عليك. عند الموافقة يُعاد المبلغ لنفس وسيلة الدفع ويُسحب الوصول إلى المنتج.</p>
    </LegalPage>
  );
}
