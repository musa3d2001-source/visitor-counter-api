import type { Metadata } from "next";
import Link from "next/link";
import { Database, Hand, Workflow } from "lucide-react";
import { getSettings } from "@/server/platform/settings";
import { LegalDoc } from "../terms/_components/legal-doc";

export const metadata: Metadata = { title: "سياسة الخصوصية", alternates: { canonical: "/privacy" } };

export default async function PrivacyPage() {
  const s = await getSettings();
  return (
    <LegalDoc
      page="privacy"
      sub="بياناتك أمانة عندنا: هذه الصفحة توضح ما نجمعه، ولماذا نحتاجه، وما حقوقك عليه."
      intro={<p>نحترم خصوصيتك في {s.site_name}، ونجمع أقل قدر ممكن من البيانات اللازمة لتقديم الخدمة.</p>}
      sections={[
        {
          id: "data",
          title: "البيانات التي نجمعها",
          Icon: Database,
          body: (
            <ul>
              <li>الاسم والبريد الإلكتروني ورقم الهاتف (اختياري) والصف الدراسي (اختياري).</li>
              <li>سجل الطلبات والمدفوعات (دون بيانات البطاقة البنكية).</li>
              <li>سجلات الوصول إلى الملفات المدفوعة لحماية المحتوى ومنع إساءة الاستخدام.</li>
            </ul>
          ),
        },
        {
          id: "use",
          title: "كيف نستخدم البيانات",
          Icon: Workflow,
          body: (
            <ul>
              <li>لإنشاء حسابك وتقديم المحتوى الذي اشتريته.</li>
              <li>لإرسال رسائل ضرورية مثل استعادة كلمة المرور.</li>
              <li>لا نبيع بياناتك ولا نشاركها مع أطراف خارجية إلا بوابة الدفع بالقدر اللازم لإتمام العملية.</li>
            </ul>
          ),
        },
        {
          id: "rights",
          title: "حقوقك",
          Icon: Hand,
          body: (
            <p>
              يمكنك تعديل بياناتك من صفحة <Link href="/account">«حسابي»</Link>، أو طلب حذف حسابك <Link href="/contact">بالتواصل معنا</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
