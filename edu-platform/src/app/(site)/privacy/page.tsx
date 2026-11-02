import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { getSettings } from "@/server/platform/settings";

export const metadata: Metadata = { title: "سياسة الخصوصية", alternates: { canonical: "/privacy" } };

export default async function PrivacyPage() {
  const s = await getSettings();
  return (
    <LegalPage title="سياسة الخصوصية">
      <p>نحترم خصوصيتك في {s.site_name}، ونجمع أقل قدر ممكن من البيانات اللازمة لتقديم الخدمة.</p>
      <h2>البيانات التي نجمعها</h2>
      <ul>
        <li>الاسم والبريد الإلكتروني ورقم الهاتف (اختياري) والصف الدراسي (اختياري).</li>
        <li>سجل الطلبات والمدفوعات (دون بيانات البطاقة البنكية).</li>
        <li>سجلات الوصول إلى الملفات المدفوعة لحماية المحتوى ومنع إساءة الاستخدام.</li>
      </ul>
      <h2>كيف نستخدم البيانات</h2>
      <ul>
        <li>لإنشاء حسابك وتقديم المحتوى الذي اشتريته.</li>
        <li>لإرسال رسائل ضرورية مثل استعادة كلمة المرور.</li>
        <li>لا نبيع بياناتك ولا نشاركها مع أطراف خارجية إلا بوابة الدفع بالقدر اللازم لإتمام العملية.</li>
      </ul>
      <h2>حقوقك</h2>
      <p>يمكنك تعديل بياناتك من صفحة «حسابي»، أو طلب حذف حسابك بالتواصل معنا.</p>
    </LegalPage>
  );
}
