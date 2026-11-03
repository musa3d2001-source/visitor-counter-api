import { Moon, Sun, Timer } from "lucide-react";
import type { ProductCard } from "@/server/catalog/queries";
import { NightSky, Sunrise } from "@/components/art";
import { ExamTicket } from "@/components/site/exam-ticket";
import { Eyebrow } from "@/components/ui/section-head";
import { cn } from "@/lib/utils";
import s from "./home.module.css";

/** مبانٍ منخفضة بين المعالم: [x, عرض, ارتفاع] على أرضية y=140 */
const BLOCKS: [number, number, number][] = [
  [0, 46, 34], [44, 30, 52], [72, 40, 28], [110, 22, 62], [130, 50, 40], [178, 34, 70], [210, 44, 30],
  [252, 26, 84], [276, 48, 46], [322, 30, 58], [350, 40, 36], [388, 28, 50], [470, 36, 44], [504, 26, 64],
  [528, 52, 34], [578, 30, 54], [606, 44, 28], [648, 30, 42], [820, 40, 36], [858, 28, 58], [884, 50, 30],
  [932, 26, 72], [956, 44, 40], [998, 32, 56], [1028, 48, 32], [1074, 26, 66], [1098, 46, 38], [1142, 30, 54], [1170, 30, 30],
];

/**
 * أفق الكويت (رسم أصلي، زخرفي): أبراج الكويت الثلاثة بكراتها، وبرج الحمراء بانحنائه، ومبانٍ منخفضة.
 * يتلوّن بـ currentColor ويُقص من الوسط على الشاشات الضيقة فتبقى الأبراج ظاهرة.
 */
export function KuwaitSkyline({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 140" preserveAspectRatio="xMidYMax slice" aria-hidden focusable="false">
      <g fill="currentColor">
        {BLOCKS.map(([x, w, h]) => (
          <rect key={x} x={x} y={140 - h} width={w} height={h + 1} rx="2" />
        ))}
        {/* برج الحمراء: جسم طويل بواجهة منحنية ملتوية */}
        <path d="M424 141 L424 14 Q427 5 437 3 L446 3 C455 38 460 92 454 141 Z" />
        <rect x="435" y="0" width="2.5" height="6" />
        {/* برج التحرير (برج اتصالات بإبرة) */}
        <path d="M236 141 L238 64 L232 60 L236 50 L240 50 L240 18 L242 18 L242 50 L246 50 L250 60 L244 64 L246 141 Z" />
        {/* أبراج الكويت */}
        <g>
          {/* البرج الرئيسي: إبرة بكرتين */}
          <path d="M733 141 L736 40 L738 4 L740 40 L743 141 Z" />
          <circle cx="738" cy="74" r="17" />
          <circle cx="738" cy="44" r="9.5" />
          {/* البرج الثاني: كرة واحدة */}
          <path d="M770 141 L772.5 60 L774 34 L775.5 60 L778 141 Z" />
          <circle cx="774" cy="92" r="13" />
          {/* البرج الثالث: إبرة رفيعة بلا كرة */}
          <path d="M707 141 L709 76 L710 58 L711 76 L713 141 Z" />
          {/* القاعدة على الساحل */}
          <path d="M690 141 C700 134 720 132 740 132 C760 132 784 134 796 141 Z" />
        </g>
      </g>
    </svg>
  );
}

/**
 * «قبل الاختبار»: لوح من الليل (هلال ونجوم) إلى الشروق (شمس)، وعمودان من تذاكر المقاعد:
 * كعب ذهبي لمراجعات ليلة الاختبار ونعناعي لمراجعات الاختبارات القصيرة، وأفق الكويت أسفل اللوح.
 */
export function ExamBand({ examNight, quizzes, ownedIds }: { examNight: ProductCard[]; quizzes: ProductCard[]; ownedIds?: Set<string> }) {
  if (!examNight.length && !quizzes.length) return null;
  return (
    <section className={s.section} aria-labelledby="exam-title" id="exams">
      <div className={s.wrap}>
        <div className={cn(s.exam, "on-dark")}>
          <span className={s.examStars} aria-hidden />
          <NightSky className={s.examSky} />
          <Sunrise className={s.examSun} />
          <KuwaitSkyline className={s.skyline} />
          <div className={s.examHead}>
            <Eyebrow tone="light" icon={<Timer size={16} />}>
              موسم الاختبارات
            </Eyebrow>
            <h2 id="exam-title" className="h-section mt-3 text-white">
              قبل الاختبار؟ <span className="text-gold">راجع بتركيز</span>
            </h2>
            <p className="mt-2 max-w-2xl text-[1.05rem] leading-8 text-white/90">دروس مركزة على الأسئلة المتوقعة، للاختبار القصير وليلة الاختبار. شاهد المعاينة المجانية حيث تتوفر.</p>
          </div>
          <div className={s.examCols}>
            {examNight.length ? (
              <div className={s.examCol}>
                <h3 className={s.examColTitle}>
                  <span className={s.examColIcon} aria-hidden>
                    <Moon size={18} />
                  </span>
                  مراجعات ليلة الاختبار
                </h3>
                <ul className={cn(s.ticketList, s.goldTix)}>
                  {examNight.map((p) => (
                    <li key={p.id}>
                      <ExamTicket product={p} owned={ownedIds?.has(p.id)} tag={null} headingLevel={4} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {quizzes.length ? (
              <div className={s.examCol}>
                <h3 className={cn(s.examColTitle, s.examColTitleSun)}>
                  <span className={cn(s.examColIcon, s.examColIconSun)} aria-hidden>
                    <Sun size={18} />
                  </span>
                  مراجعات الاختبارات القصيرة
                </h3>
                <ul className={cn(s.ticketList, s.mintTix)}>
                  {quizzes.map((p) => (
                    <li key={p.id}>
                      <ExamTicket product={p} owned={ownedIds?.has(p.id)} tag={null} headingLevel={4} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
