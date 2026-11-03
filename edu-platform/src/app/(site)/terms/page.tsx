import type { Metadata } from "next";
import { Ban, CreditCard, MonitorPlay, UserRound } from "lucide-react";
import { getSettings } from "@/server/platform/settings";
import { LegalDoc } from "./_components/legal-doc";

export const metadata: Metadata = { title: "الشروط والأحكام", alternates: { canonical: "/terms" } };

export default async function TermsPage() {
  const s = await getSettings();
  return (
    <LegalDoc
      page="terms"
      updated="2026-11-02"
      sub="القواعد التي تحفظ حقك وحق المعلمين: كيف تستخدم حسابك، وما المسموح في المحتوى الرقمي، وكيف يتم الدفع."
      intro={<p>باستخدامك {s.site_name} فإنك توافق على الشروط التالية. يرجى قراءتها بعناية.</p>}
      sections={[
        {
          id: "account",
          title: "الحساب",
          Icon: UserRound,
          body: (
            <ul>
              <li>الحساب شخصي ولا يجوز مشاركته مع الآخرين.</li>
              <li>أنت مسؤول عن سرية كلمة المرور وعن أي نشاط يتم عبر حسابك.</li>
            </ul>
          ),
        },
        {
          id: "content",
          title: "المحتوى الرقمي",
          Icon: MonitorPlay,
          body: (
            <ul>
              <li>المذكرات والنماذج والفيديوهات مرخصة للاستخدام الشخصي للطالب فقط.</li>
              <li>يُمنع نسخ المحتوى أو إعادة نشره أو بيعه أو مشاركته بأي وسيلة، وتحمل الملفات علامة مائية تحدد هوية المشتري.</li>
              <li>بعض المذكرات متاحة للقراءة داخل المنصة فقط، وبعضها قابل للتنزيل والطباعة كما هو موضح في صفحة كل منتج.</li>
              <li>يستمر وصولك إلى المنتجات التي اشتريتها، بما في ذلك تحديثاتها، ما دامت المنصة تقدم الخدمة.</li>
            </ul>
          ),
        },
        {
          id: "payment",
          title: "الأسعار والدفع",
          Icon: CreditCard,
          body: (
            <ul>
              <li>جميع الأسعار بالدينار الكويتي وتشمل أي رسوم معلنة.</li>
              <li>يتم الدفع عبر بوابة دفع إلكترونية معتمدة، ولا تحتفظ المنصة ببيانات البطاقات البنكية.</li>
              <li>لا يُضاف المنتج إلى المكتبة إلا بعد تأكيد عملية الدفع من بوابة الدفع.</li>
            </ul>
          ),
        },
        {
          id: "suspension",
          title: "إيقاف الحساب",
          Icon: Ban,
          body: <p>يحق للمنصة إيقاف أي حساب يخالف هذه الشروط، خصوصًا في حالات مشاركة المحتوى أو إعادة نشره.</p>,
        },
      ]}
    />
  );
}
