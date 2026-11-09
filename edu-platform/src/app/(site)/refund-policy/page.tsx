import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ClipboardList, Layers, Scale, Undo2 } from "lucide-react";
import { getSettings } from "@/server/platform/settings";
import { count, W } from "@/lib/design";
import { sellerIdentity } from "@/lib/site-truth";
import { REFUND_HOLD_DAYS } from "@/lib/teacher-terms";
import { LegalDoc } from "../terms/_components/legal-doc";

export const metadata: Metadata = { title: "سياسة الاسترجاع", alternates: { canonical: "/refund-policy" } };

/** مسودة لمراجعة المحامي. لا تُذكر هنا إلا ما تفعله خدمة الاسترداد فعلًا: طلب كامل فقط، والبوابة أولًا ثم سحب الوصول */
export default async function RefundPolicyPage() {
  const s = await getSettings();
  return (
    <LegalDoc
      page="refund"
      updated="2026-11-09"
      seller={sellerIdentity(s)}
      sub="متى يحق لك استرجاع المبلغ، وكيف تقدّم الطلب، وماذا يحدث بعده."
      intro={<p>لأن المنتجات رقمية وتصل بعد تأكيد الدفع، ننصحك باستخدام المعاينة المجانية حيث تتوفر قبل الشراء.</p>}
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
              <Link href="/contact">تواصل معنا</Link> خلال {count(REFUND_HOLD_DAYS, W.day)} من الشراء مع رقم الطلب، وسنراجع الطلب ونرد عليك.
            </p>
          ),
        },
        {
          id: "whole-order",
          title: "الطلب كاملًا",
          Icon: Layers,
          body: (
            <ul>
              <li>يُسترد الطلب كاملًا فقط، ولا يمكن استرداد منتج واحد من طلب فيه عدة منتجات.</li>
              <li>الدفع المكرر لنفس الطلب يُرد وحده، ويبقى طلبك ووصولك كما هما.</li>
            </ul>
          ),
        },
        {
          id: "after",
          title: "بعد الموافقة",
          Icon: Undo2,
          body: (
            <ul>
              <li>نطلب من بوابة الدفع إرجاع المبلغ إلى وسيلة الدفع نفسها.</li>
              <li>حين تقبل البوابة الطلب يُغلق وصولك إلى كل منتجات الطلب.</li>
              <li>قد تحتاج العملية إلى مراجعة لدى بوابة الدفع، ويعتمد وقت ظهور المبلغ في حسابك على البوابة والبنك، فلا نستطيع تحديد موعد دقيق له.</li>
            </ul>
          ),
        },
        {
          id: "law",
          title: "ملاحظة قانونية لم تُحسم بعد",
          Icon: Scale,
          body: (
            <>
              <p>صدر في الكويت المرسوم بقانون رقم ١٠ لسنة ٢٠٢٦ بشأن التجارة الرقمية. تذكر مادته ١٧ حقًا في الانسحاب خلال ١٤ يومًا من الاستلام مع رد المبلغ، وتستثني حالات منها المنتجات الرقمية التي اكتمل تنزيلها.</p>
              <ul>
                <li>لم يُحسم بعد كيف ينطبق ذلك على هذه المنصة، ولا موعد بدء العمل به، ولا كيف تُعامل القراءة والمشاهدة داخل المنصة، فهما ليستا تنزيلًا.</li>
                <li>مدة {count(REFUND_HOLD_DAYS, W.day)} أعلاه هي ما تطبقه المنصة الآن، وقد تتغير بعد مراجعة المحامي.</li>
                <li>هذه الملاحظة ليست رأيًا قانونيًا، ولا تنتقص من أي حق يقرره القانون.</li>
              </ul>
            </>
          ),
        },
      ]}
    />
  );
}
