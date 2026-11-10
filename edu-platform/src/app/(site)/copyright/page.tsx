import type { Metadata } from "next";
import { ClipboardList, Hourglass, Send, UserRoundCheck } from "lucide-react";
import { getPublicSettings } from "@/server/platform/public-settings";
import { ContactLinks, realContactLinks } from "@/components/site/payment-unavailable-notice";
import { sellerIdentity } from "@/lib/site-truth";
import { LEGAL_PAGE_VERSIONS } from "@/lib/consent";
import { LegalDoc } from "../terms/_components/legal-doc";

export const metadata: Metadata = {
  title: "بلاغات حقوق المحتوى",
  description: "كيف يبلغ صاحب الحق عن محتوى نُشر على المنصة دون إذنه، وماذا يحدث بعد البلاغ.",
  alternates: { canonical: "/copyright" },
};

/** مسودة لمراجعة المحامي. البلاغات تُستقبل عبر قنوات التواصل الحقيقية ويراجعها المالك يدويًا، فلا تعد هذه الصفحة بغير ذلك */
export default async function CopyrightPage() {
  const s = await getPublicSettings();
  const hasChannel = realContactLinks(s).length > 0;
  return (
    <LegalDoc
      page="copyright"
      version={LEGAL_PAGE_VERSIONS.copyright}
      updated="2026-11-09"
      seller={sellerIdentity(s)}
      sub="إن نُشر عملك هنا دون إذنك: ما الذي نحتاجه منك، وأين ترسله، وماذا يحدث بعده."
      intro={<p>نحترم حقوق المؤلفين والمعلمين. إن رأيت أن محتوى منشورًا على {s.site_name} يعتدي على حقك، فهذه هي الطريق.</p>}
      sections={[
        {
          id: "who",
          title: "من يقدم البلاغ",
          Icon: UserRoundCheck,
          body: <p>صاحب الحق في العمل أو من يمثله: مؤلف، أو ناشر، أو معلم يرى أن عمله نُشر هنا دون إذنه.</p>,
        },
        {
          id: "what",
          title: "ما الذي نحتاجه في البلاغ",
          Icon: ClipboardList,
          body: (
            <ul>
              <li>اسمك ووسيلة نتواصل بها معك.</li>
              <li>رابط صفحة المنتج على المنصة، واسم الملف أو الدرس إن أمكن.</li>
              <li>ما يثبت حقك في العمل، مثل نسخة منه أو ما يدل على نشره باسمك.</li>
              <li>ما تطلبه: إخفاء المحتوى أو إزالته.</li>
            </ul>
          ),
        },
        {
          id: "where",
          title: "أين ترسل البلاغ",
          Icon: Send,
          body: hasChannel ? (
            <>
              <p>أرسله عبر إحدى هذه الوسائل، واكتب في أوله «بلاغ حقوق».</p>
              <ContactLinks settings={s} testId="copyright-contacts" />
            </>
          ) : (
            <p data-testid="copyright-no-channel">لم تُضبط بعد وسيلة تواصل عامة للمنصة. ستظهر هنا فور اعتمادها.</p>
          ),
        },
        {
          id: "after",
          title: "ماذا يحدث بعد البلاغ",
          Icon: Hourglass,
          body: (
            <ul>
              <li>يراجع مالك المنصة البلاغ يدويًا. لا يوجد نموذج آلي للبلاغات، ولا تحدد هذه المسودة مدة للرد.</li>
              <li>يمكن للمالك إخفاء المحتوى إلى أن يتم بحث البلاغ، فيتوقف ظهوره وبيعه الجديد.</li>
              <li>من اشتراه قبل الإخفاء يبقى وصوله كما هو ما لم يُسترد مبلغه.</li>
              <li>إن كان العمل منشورًا عبر معلم على المنصة، يُبحث الأمر معه وفق اتفاقية المعلم.</li>
              <li>هذه الصفحة طريق للإبلاغ فقط، ولا تغني عن أي حق لك أمام الجهات المختصة.</li>
            </ul>
          ),
        },
      ]}
    />
  );
}
