import { Percent } from "lucide-react";
import { Section } from "@/components/admin/panel";
import { count, ar, W } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { REFUND_HOLD_DAYS } from "@/lib/teacher-terms";
import { computeEarningLines, computeOrderFee } from "@/server/commerce/earnings";

const EXAMPLE_PRICE_FILS = 10000;
const EXAMPLE_SHARE_BPS = 5000;

const pct = (bps: number) => `${ar(String(bps / 100))}٪`;

/**
 * كيف تُحسب حصة المعلم. كل جملة هنا تطابق computeOrderFee وcomputeEarningLines،
 * والمثال يُحسب بالدالتين نفسيهما، فإن تغير الحساب تغير المثال معه.
 *  - shareBps: نسبة هذا المعلم، null إن لم تُحدد، وبدونها (صفحة الإعدادات) يظهر مثال بنسبة افتراضية.
 */
export function TeacherMoneyRules({
  audience,
  shareBps,
  feePercentBps,
  feeFixedFils,
}: {
  audience: "teacher" | "owner";
  shareBps?: number | null;
  feePercentBps: number;
  feeFixedFils: number;
}) {
  const mine = audience === "teacher";
  const noFee = feePercentBps === 0 && feeFixedFils === 0;
  const exampleShare = typeof shareBps === "number" ? shareBps : EXAMPLE_SHARE_BPS;
  const fee = computeOrderFee(EXAMPLE_PRICE_FILS, feePercentBps, feeFixedFils);
  const [line] = computeEarningLines([{ orderItemId: "example", grossFils: EXAMPLE_PRICE_FILS, shareBps: exampleShare }], 0, fee);
  const feeParts = [feePercentBps > 0 ? `${pct(feePercentBps)} من المبلغ المدفوع بعد الخصم، مقربة لأقرب فلس` : null, feeFixedFils > 0 ? `${filsToKwdString(feeFixedFils)} د.ك ثابتة لكل طلب` : null].filter(Boolean);
  const rules = [
    shareBps === undefined
      ? null
      : shareBps === null
        ? mine
          ? "لم تُحدد نسبتك بعد، ولا يُباع محتواك قبل تحديدها."
          : "لم تُحدد نسبة هذا المعلم بعد، ولا يُباع محتواه قبل تحديدها."
        : `${mine ? "نسبتك" : "نسبة المعلم"} ${pct(shareBps)} من صافي كل بيع.`,
    "الصافي = قيمة البيع ناقص حصته من خصم القسيمة ناقص حصته من رسوم الدفع.",
    noFee
      ? "رسوم الدفع (ماي فاتورة): المعدل المعتمد الآن صفر، فلا يُخصم منها شيء قبل حساب الحصة، وما تقتطعه ماي فاتورة فعليًا تتحمله المنصة."
      : `رسوم الدفع (ماي فاتورة): يُخصم من كل طلب مدفوع ${feeParts.join(" و")}، وبحد أقصى قيمة الطلب، قبل حساب الحصة.`,
    noFee ? null : "هذا معدل يحدده المالك في الإعدادات، وليس ما تقتطعه ماي فاتورة فعليًا من كل عملية. إن اختلف المبلغان فالفرق للمنصة أو عليها، ولا يغيّر حصة المعلم.",
    "إذا ضم الطلب أكثر من محتوى، توزعت عليها الرسوم والخصم بنسبة قيمة كل محتوى. والباقة تتوزع قيمتها أولًا على محتوياتها بحسب سعر كل محتوى.",
    "الحصة تُقرَّب لأسفل إلى الفلس، والباقي للمنصة. الطلب المجاني بالكامل لا رسوم عليه ولا حصة منه.",
    `تبقى أرباح كل بيع قيد فترة الاسترداد ${count(REFUND_HOLD_DAYS, W.day)} من تأكيد الدفع، ثم تدخل الرصيد المستحق.`,
    "عند استرداد طلب تُعكس حصته كاملة، ولو كانت قد سُددت، فيظهر الفرق في الرصيد.",
    "تغيير النسبة أو الرسوم يسري على الدفعات القادمة فقط، ولا يغيّر الأرباح المسجلة.",
  ].filter((r): r is string => Boolean(r));
  const example = [
    { label: "قيمة البيع", fils: line.grossFils },
    { label: "رسوم الدفع", fils: line.feeFils },
    { label: "الصافي", fils: line.netFils },
    { label: mine ? "حصتك" : "حصة المعلم", fils: line.teacherFils },
  ];
  return (
    <Section title="كيف تُحسب الحصة والرسوم" icon={<Percent />} tone="gold">
      <div data-testid="money-rules">
        <ul className="space-y-2 text-[0.92rem] leading-7 text-ink-soft">
          {rules.map((r) => (
            <li key={r} className="flex items-start gap-2.5">
              <span className="mt-2.5 size-2 shrink-0 rounded-full bg-[#F0A500]" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-[1.4rem] border-2 border-dashed border-[#F0C766] bg-[linear-gradient(160deg,#fffaf0,#fff1cf)] p-3.5" data-testid="money-rules-example">
          <p className="font-display text-[0.92rem] font-extrabold text-ink">مثال لبيع واحد بلا خصم{typeof shareBps === "number" ? "" : ` بنسبة ${pct(exampleShare)}`}</p>
          <dl className="mt-2.5 grid grid-cols-2 gap-1.5">
            {example.map((it) => (
              <div key={it.label} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-1.5 text-[0.8rem]">
                <dt className="font-bold text-muted">{it.label}</dt>
                <dd className="whitespace-nowrap font-display font-extrabold text-ink">
                  <span className="num">{filsToKwdString(it.fils)}</span> د.ك
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}
