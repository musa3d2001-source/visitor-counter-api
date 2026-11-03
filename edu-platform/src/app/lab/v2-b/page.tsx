/*
 * ───────────────────────────────────────────────────────────────────────────
 * منصة درب: نموذج v2-b «ليلة الاختبار» (Cinematic Night)
 * ───────────────────────────────────────────────────────────────────────────
 * الفكرة: سماء الكويت ليلة الاختبار. ليل عميق بلون النيلي لا أسود، يضيئه ذهب
 * «مصباح المذاكرة»، وكل مادة وكل صف لها تدرّج لوني ثابت يتكرر في الصفحة كلها.
 *
 * الألوان
 *   Midnight     #070B22  أساس الأقسام الداكنة (نيلي عميق، ليس أسود)
 *   Night Indigo #141B4D  الأسطح الداكنة، ووهج #6157F5 / #8B5CF6
 *   Exam Gold    #FFDC70 → #FFB423  لون الفعل الأساسي (الأزرار، الأسعار المميزة، التركيز)
 *   Aurora Mint  #2EE6C5  لون ثانوي للعلامات والتوهج
 *   Dawn         #F4F5FB  الأقسام الفاتحة / Ink #0D1230 / Slate #555C80
 *   المواد: رياضيات كهرماني→مرجاني، علوم نعناعي→فيروزي، إنجليزي ليلكي→نيلي،
 *           عربي وردي→برقوقي، إسلامية أخضر، اجتماعيات سماوي→أزرق
 *   الصفوف: ٦ نعناعي، ٧ أزرق، ٨ بنفسجي→وردي، ٩ ذهبي→برتقالي
 *
 * الخطوط
 *   Alexandria (عرض، أرقام كبيرة، عناوين ٦٠٠–٨٠٠)
 *   IBM Plex Sans Arabic (النصوص، ٤٠٠–٧٠٠، ارتفاع سطر ١٫٨–٢)
 *
 * التخطيط (يمين ← يسار)
 *   [رأس زجاجي داكن ثابت]
 *   [البطل: نص + زران | لوحة «يُعرض الآن» من منتج حقيقي + بطاقتان مائلتان خلفها
 *    + شارات زجاجية عائمة؛ نجوم، هلال، أفق الكويت وأبراجها]
 *   [اختر صفك: ٤ بطاقات داكنة بإطار متدرج وأرقام عملاقة، تتراكب على حافة البطل]
 *   [الدروس المرئية: شبكة متفاوتة على خلفية الفجر، بطاقة كبيرة + ٦ + بلاطة تصفح]
 *   [ليلة الاختبار: قسم ليلي، ساعة قبل منتصف الليل، بطاقات «رقم جلوس» مثقوبة]
 *   [المعلمون: بطاقات بمسرح متدرج وضوء مسلط وميدالية الحرف الأول]
 *   [الباقات: شفق نيلي وردي، شريط «وفّر X د.ك»، كتب مكدسة بلون الصف]
 *   [المذكرات: أوراق مرسومة بلون المادة]
 *   [كيف تبدأ: «الدرب» خط متعرج يصل ٤ محطات حقيقية]
 *   [الأسئلة الشائعة + بطاقة مساعدة] [دعوة أخيرة + تذييل ليلي]
 *
 * المبادئ: الجرأة في البطل وبطاقات الصفوف، وما حولها منضبط. أرقام حقيقية فقط.
 * الحركة: دخول واحد للبطل + نبض زر التشغيل + تلألؤ النجوم، وكلها تتوقف مع
 * prefers-reduced-motion.
 */
import "@fontsource-variable/alexandria";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Calculator,
  CirclePlay,
  Clock,
  CreditCard,
  FileText,
  FlaskConical,
  Gift,
  Globe,
  GraduationCap,
  Languages,
  Layers,
  Library,
  LogIn,
  Mail,
  Menu,
  MessageCircle,
  MoonStar,
  Package,
  Play,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { labData } from "../data";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import type { Grade, ProductCard, TeacherCard } from "@/server/catalog/queries";
import { Crescent, EqBars, ExamClock, LogoMark, PathLine, Skyline, Starfield, SubjectArt } from "./art";
import {
  CONTENT,
  GRADES,
  ITEMS,
  LESSONS,
  ORDINALS,
  PAGES,
  SUBJECTS,
  TEACHERS,
  VIDEO_LESSONS,
  ar,
  count,
  duration,
  gradeVars,
  initial,
  kwd,
  percentOff,
  previewHref,
  saving,
  subjectKey,
  themeVars,
  type SubjectKey,
} from "./lib";
import s from "./v2b.module.css";

export const dynamic = "force-dynamic";

type Data = Awaited<ReturnType<typeof labData>>;

const SUBJECT_ICON: Record<SubjectKey, LucideIcon> = {
  math: Calculator,
  science: FlaskConical,
  english: Languages,
  arabic: BookOpen,
  islamic: MoonStar,
  social: Globe,
  other: BookOpen,
};

const HOME = "/lab/v2-b";

export default async function V2BHome() {
  const d = await labData();
  const levelOf = new Map(d.grades.map((g) => [g.name, g.level]));

  const hero = d.videos.find((v) => v.previewLessonId && v.type === "video_course") ?? d.videos.find((v) => v.previewLessonId) ?? d.videos[0];
  const rest = d.videos.filter((v) => v.id !== hero?.id);
  const heroKey = subjectKey(hero?.subjectName ?? null);
  const backCards: ProductCard[] = [];
  for (const v of rest) {
    const k = subjectKey(v.subjectName);
    if (k !== heroKey && !backCards.some((b) => subjectKey(b.subjectName) === k)) backCards.push(v);
    if (backCards.length === 2) break;
  }
  const feature = rest.find((v) => v.type === "video_course") ?? rest[0];
  const small = rest.filter((v) => v.id !== feature?.id).slice(0, 6);

  const totalItems = [...d.stats.values()].reduce((a, x) => a + x.products, 0);
  const reviews = [...d.reviews].sort((a, b) => (a.type === b.type ? 0 : a.type === "exam_review" ? -1 : 1));
  const bundles = [...d.bundles].sort((a, b) => (levelOf.get(a.gradeName) ?? 0) - (levelOf.get(b.gradeName) ?? 0));

  return (
    <div className={s.page}>
      <SiteHeader grades={d.grades} />
      <main id="main">
        <Hero d={d} hero={hero} backCards={backCards}>
          <GradePicker d={d} totalItems={totalItems} />
        </Hero>
        <Videos feature={feature} small={small} grades={d.grades} />
        <ExamNight reviews={reviews} grades={d.grades} />
        <Teachers teachers={d.teachers} />
        <Bundles bundles={bundles} levelOf={levelOf} />
        <Notes notes={d.notes} />
        <Steps />
        <Faq faq={d.settings.faq} />
      </main>
      <SiteFooter d={d} />
    </div>
  );
}

/* ─────────────────────────── الرأس ─────────────────────────── */

function SiteHeader({ grades }: { grades: Grade[] }) {
  const nav = [
    { href: "#grades", label: "الصفوف" },
    { href: "/teachers", label: "المعلمون" },
    { href: "/bundles", label: "الباقات" },
    { href: "/library", label: "مكتبتي" },
  ];
  return (
    <header className={`${s.header} ${s.dark}`}>
      <div className={`${s.wrap} flex h-full items-center gap-3`}>
        <Link href={HOME} className="flex min-h-11 items-center gap-2.5 rounded-xl" aria-label="منصة درب، الصفحة الرئيسية">
          <LogoMark />
          <span className={`${s.wordmark} whitespace-nowrap`}>منصة درب</span>
        </Link>
        <nav aria-label="التنقل الرئيسي" className="ms-6 hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className={s.navLink}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <Link href="/cart" className={s.iconBtn} aria-label="السلة">
            <ShoppingCart className="size-5" aria-hidden />
          </Link>
          <Link href="/login" className={s.loginBtn}>
            <LogIn className="hidden size-4 sm:block" aria-hidden />
            دخول
          </Link>
          <details className={`${s.menu} relative lg:hidden`}>
            <summary className={s.iconBtn} aria-label="القائمة">
              <Menu className="size-5" aria-hidden />
            </summary>
            <div className={s.menuPanel}>
              {nav.map((n) => (
                <a key={n.href} href={n.href}>
                  {n.label}
                </a>
              ))}
              <div className="my-2 h-px bg-white/10" />
              {grades.map((g) => (
                <Link key={g.id} href={`/grades/${g.slug}`} style={gradeVars(g.level)}>
                  <span className="size-2.5 rounded-full" style={{ background: "linear-gradient(140deg,var(--g1),var(--g2))" }} />
                  {g.name}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────── البطل ─────────────────────────── */

function Hero({ d, hero, backCards, children }: { d: Data; hero: ProductCard | undefined; backCards: ProductCard[]; children: React.ReactNode }) {
  const firstStage = d.grades[0]?.stageName ?? "المرحلة المتوسطة";
  const first = d.grades[0]?.name;
  const last = d.grades.at(-1)?.name.replace(/^الصف\s+/, "");
  const range = first && last && d.grades.length > 1 ? `من ${first} إلى ${last}` : (first ?? "");
  return (
    <section className={`${s.hero} ${s.dark}`} aria-labelledby="hero-title">
      <Starfield className={s.heroStars} />
      <Crescent className={`${s.moon} hidden sm:block`} />
      <div className={`${s.wrap} grid grid-cols-[minmax(0,1fr)] items-center gap-14 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:gap-10 lg:pt-20`}>
        <div className={s.rise}>
          <p className={s.pill}>
            <b>
              <Sparkles className="size-3.5" aria-hidden />
              {firstStage}
            </b>
            {range}
          </p>
          <h1 id="hero-title" className={`${s.h1} mt-6`}>
            من أول درس
            <br />
            إلى ليلة الاختبار.
          </h1>
          <p className={`${s.lede} mt-5`}>{d.settings.hero_subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#grades" className={`${s.btnGold} w-full sm:w-auto`}>
              <GraduationCap className="size-5" aria-hidden />
              اختر صفك وابدأ
            </a>
            {hero ? (
              <Link href={previewHref(hero)} className={`${s.btnGlass} w-full sm:w-auto`}>
                <span className={s.btnGlassPlay}>
                  <Play className="size-3.5 translate-x-px fill-current" aria-hidden />
                </span>
                {hero.previewLessonId ? "شاهد درسًا مجانًا" : "شاهد شرحًا"}
              </Link>
            ) : null}
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3">
            <li className={s.trust}>
              <CirclePlay className="size-4.5" aria-hidden />
              معاينة مجانية قبل الشراء
            </li>
            <li className={s.trust}>
              <CreditCard className="size-4.5" aria-hidden />
              الدفع بكي نت والبطاقات
            </li>
            <li className={s.trust}>
              <Library className="size-4.5" aria-hidden />
              يظهر في مكتبتك فور الدفع
            </li>
          </ul>
        </div>

        {hero ? <NowPlaying p={hero} backCards={backCards} /> : null}
      </div>
      {children}
    </section>
  );
}

function NowPlaying({ p, backCards }: { p: ProductCard; backCards: ProductCard[] }) {
  const key = subjectKey(p.subjectName);
  const shown = Math.min(3, p.lessonCount);
  const more = p.lessonCount - shown;
  return (
    <div className={`${s.stage} ${s.rise3} mt-6 lg:mt-0`}>
      {backCards.map((b, i) => {
        const Icon = SUBJECT_ICON[subjectKey(b.subjectName)];
        return (
          <div key={b.id} aria-hidden className={`${s.backCard} ${i === 0 ? s.backCardA : s.backCardB} hidden sm:block`} style={themeVars(b.subjectName)}>
            <SubjectArt kind={subjectKey(b.subjectName)} className={s.art} />
            <span className={s.backIcon}>
              <Icon className="size-5" />
            </span>
          </div>
        );
      })}

      <div className={s.panel}>
        <div className={s.panelBar}>
          <span className={s.live}>
            <span className={s.liveDot} aria-hidden />
            يُعرض الآن
          </span>
          <span>{p.gradeName}</span>
        </div>

        <Link href={previewHref(p)} className={`${s.cover} ${s.poster}`} style={themeVars(p.subjectName)} aria-label={`شاهد المعاينة: ${p.title}`}>
          <SubjectArt kind={key} className={s.art} />
          <span className="absolute start-3 top-3 flex flex-wrap gap-2">
            <span className={s.glassTag}>{PRODUCT_TYPE_LABELS[p.type]}</span>
            {p.previewLessonId ? (
              <span className={s.goldTag}>
                <Gift className="size-3.5" aria-hidden />
                معاينة مجانية
              </span>
            ) : null}
          </span>
          <span className={s.play}>
            <Play className="size-7 translate-x-0.5 fill-current" aria-hidden />
          </span>
          <span className="absolute inset-x-4 bottom-3.5 flex flex-col gap-2.5">
            <span className="flex items-end justify-between gap-3">
              <span className={`${s.coverSubject} text-xl sm:text-3xl`}>{p.subjectName}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-white/85">
                <Clock className="size-3.5" aria-hidden />
                {duration(p.totalDurationSeconds)}
              </span>
            </span>
            <span className={s.scrub} aria-hidden>
              {Array.from({ length: Math.min(Math.max(p.lessonCount, 1), 10) }, (_, i) => (
                <i key={i} />
              ))}
            </span>
          </span>
        </Link>

        <div className="px-1 pt-3">
          <div className="flex items-start justify-between gap-3 px-2 pb-2">
            <div className="min-w-0">
              <p className={`${s.display} line-clamp-2 text-[0.98rem] font-semibold leading-7`}>{p.title}</p>
              <p className="text-sm text-white/65">{p.teacherName}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/8 px-3 py-1 text-xs font-medium text-white/80">{count(p.lessonCount, LESSONS)}</span>
          </div>
          <ol className="hidden flex-col gap-1 sm:flex">
            {Array.from({ length: shown }, (_, i) => (
              <li key={i} className={`${s.lessonRow} ${i === 0 ? s.lessonRowOn : ""}`}>
                <span className={s.lessonNum}>{ar(i + 1)}</span>
                <span>الدرس {ORDINALS[i]}</span>
                {i === 0 ? <EqBars /> : null}
              </li>
            ))}
          </ol>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/10 px-2 pt-3 pb-1">
            <span className="flex items-baseline gap-2">
              <span className={`${s.display} text-xl font-extrabold`}>
                {kwd(p.priceFils)} <small className="text-xs font-semibold text-white/70">د.ك</small>
              </span>
              {saving(p) ? <del className="text-sm text-white/55">{kwd(p.compareAtPriceFils!)}</del> : null}
            </span>
            <Link href={`/products/${p.slug}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[#FFD76A] hover:text-white">
              {more > 0 ? (
                <>
                  <span className="sm:hidden">تفاصيل الشرح</span>
                  <span className="hidden sm:inline">و{count(more, LESSONS)} أخرى</span>
                </>
              ) : (
                "تفاصيل الشرح"
              )}
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      <div className={`${s.chip} -top-12 -end-2 hidden sm:flex xl:-end-8`} style={{ animationDelay: "-2s" }}>
        <span className={s.chipIcon} style={{ "--a": "#FFDC70", "--b": "#FFB423" } as React.CSSProperties}>
          <MoonStar className="size-5" aria-hidden />
        </span>
        <span>
          مراجعة ليلة الاختبار
          <small>أسئلة متوقعة في دروس قصيرة</small>
        </span>
      </div>
      <div className={`${s.chip} -bottom-10 -start-3 hidden sm:flex lg:-start-8`}>
        <span className={s.chipIcon} style={{ "--a": "#E596FF", "--b": "#EE4C93" } as React.CSSProperties}>
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <span>
          دفع آمن بكي نت
          <small>ويظهر في مكتبتك فورًا</small>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────── اختيار الصف ─────────────────────────── */

function GradePicker({ d, totalItems }: { d: Data; totalItems: number }) {
  return (
    <section id="grades" className={`${s.gradeBand} scroll-mt-20 pt-20 sm:pt-24 lg:pt-32`} aria-labelledby="grades-title">
      <div className={s.wrap}>
        <div className={`${s.dark} relative z-10 mb-8 max-w-xl`}>
          <h2 id="grades-title" className={s.h2}>
            اختر صفك
          </h2>
          <p className="mt-1 leading-8 text-white/75">كل مواد صفك مرتبة في صفحة واحدة: شروح، ومراجعات، ومذكرات.</p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="المنصة بالأرقام">
            <li className={s.statChip}>
              <Layers className="size-4" aria-hidden />
              {count(d.grades.length, GRADES)}
            </li>
            <li className={s.statChip}>
              <Users className="size-4" aria-hidden />
              {count(d.teachers.length, TEACHERS)}
            </li>
            <li className={s.statChip}>
              <BookOpen className="size-4" aria-hidden />
              {count(totalItems, ITEMS)}
            </li>
          </ul>
        </div>
        <div className="relative">
          <Skyline className={s.skyline} />
        <ul className="relative grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:gap-5">
          {d.grades.map((g) => {
            const st = d.stats.get(g.id);
            return (
              <li key={g.id}>
                <Link href={`/grades/${g.slug}`} className={`${s.gradeCard} h-full`} style={gradeVars(g.level)}>
                  <span className={s.gradeNum} aria-hidden>
                    {ar(g.level)}
                  </span>
                  <span className="mt-auto pt-16 sm:pt-20">
                    <span className={`${s.gradeName} block`}>{g.name}</span>
                    {st ? (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        <span className={s.gradeMeta}>{count(st.subjects, SUBJECTS)}</span>
                        <span className={s.gradeMeta}>{count(st.products, ITEMS)}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className={s.gradeGo}>
                    <span>ابدأ من هنا</span>
                    <span className={s.gradeArrow}>
                      <ArrowLeft className="size-4.5" aria-hidden />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── عناوين الأقسام ─────────────────────────── */

function SectionHead({
  id,
  kicker,
  icon: Icon,
  title,
  sub,
  action,
}: {
  id: string;
  kicker: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className={s.kicker}>
          <Icon className="size-4.5" aria-hidden />
          {kicker}
        </p>
        <h2 id={id} className={`${s.h2} mt-2`}>
          {title}
        </h2>
        <p className={`${s.sub} mt-2`}>{sub}</p>
      </div>
      {action}
    </div>
  );
}

function Price({ p, size = "md" }: { p: ProductCard; size?: "md" | "lg" }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className={s.price} style={size === "lg" ? { fontSize: "1.6rem" } : undefined}>
        {kwd(p.priceFils)} <small>د.ك</small>
      </span>
      {saving(p) ? (
        <del className={s.was}>
          <span className="sr-only">بدلًا من </span>
          {kwd(p.compareAtPriceFils!)}
        </del>
      ) : null}
    </span>
  );
}

function TeacherLine({ p }: { p: ProductCard }) {
  if (!p.teacherName) return null;
  const inner = (
    <>
      <span className={s.mini} style={themeVars(p.subjectName)} aria-hidden>
        {initial(p.teacherName)}
      </span>
      <span>{p.teacherName}</span>
    </>
  );
  return p.teacherSlug ? (
    <Link href={`/teachers/${p.teacherSlug}`} className={`${s.teacherLink} ${s.lift} self-start`}>
      {inner}
    </Link>
  ) : (
    <span className={s.teacherLink}>{inner}</span>
  );
}

/* ─────────────────────────── الدروس المرئية ─────────────────────────── */

function Videos({ feature, small, grades }: { feature: ProductCard | undefined; small: ProductCard[]; grades: Grade[] }) {
  if (!feature) return null;
  return (
    <section className="pt-24 pb-24 sm:pt-28" aria-labelledby="videos-title">
      <div className={s.wrap}>
        <SectionHead
          id="videos-title"
          kicker="شروح بالفيديو"
          icon={CirclePlay}
          title="دروس يشرحها معلمك خطوة بخطوة"
          sub="أحدث الشروحات المضافة للمنصة. أغلبها يبدأ بدرس مجاني تشاهده قبل أن تشتري."
          action={
            <a href="#grades" className={s.moreLink}>
              تصفح حسب الصف
              <ArrowLeft className="size-4" aria-hidden />
            </a>
          }
        />
        <ul className={s.bento}>
          <li className={s.bentoFeature}>
            <VideoCard p={feature} featured />
          </li>
          {small.map((p) => (
            <li key={p.id}>
              <VideoCard p={p} />
            </li>
          ))}
          <li className={s.bentoWide}>
            <div className={`${s.browseTile} ${s.dark} h-full`}>
              <span className={`${s.cluster} hidden sm:flex`} aria-hidden>
                {(["math", "science", "english", "arabic"] as SubjectKey[]).map((k) => {
                  const Icon = SUBJECT_ICON[k];
                  return (
                    <span key={k} style={themeVars(k === "math" ? "الرياضيات" : k === "science" ? "العلوم" : k === "english" ? "الإنجليزية" : "العربية")}>
                      <Icon className="size-5" />
                    </span>
                  );
                })}
              </span>
              <div className="sm:pe-40">
                <p className={`${s.display} text-xl leading-9 font-bold sm:text-2xl`}>كل الشروحات مرتبة حسب صفك ومادتك</p>
                <p className="mt-1 text-white/75">اختر صفك وستجد الوحدات والمراجعات والمذكرات في مكان واحد.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {grades.map((g) => (
                  <Link key={g.id} href={`/grades/${g.slug}`} className={s.gradePill} style={gradeVars(g.level)}>
                    <i aria-hidden />
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}

function VideoCard({ p, featured }: { p: ProductCard; featured?: boolean }) {
  const key = subjectKey(p.subjectName);
  return (
    <article className={`${s.card} h-full`}>
      <div className={`${s.cover} ${featured ? s.featureCover : s.vcover}`} style={themeVars(p.subjectName)}>
        <SubjectArt kind={key} className={s.art} />
        <span className="absolute start-3 top-3 flex flex-wrap gap-1.5">
          <span className={s.glassTag}>{PRODUCT_TYPE_LABELS[p.type]}</span>
          {p.previewLessonId ? (
            <span className={s.goldTag}>
              <Gift className="size-3.5" aria-hidden />
              معاينة مجانية
            </span>
          ) : null}
        </span>
        <span className={`${s.play} ${featured ? "" : s.playSm}`} aria-hidden>
          <Play className={`${featured ? "size-7" : "size-5"} translate-x-0.5 fill-current`} />
        </span>
        <span className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3">
          <span className={`${s.coverSubject} ${featured ? "text-3xl sm:text-4xl" : "text-xl"}`}>{p.subjectName}</span>
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-medium text-white/90">
            {p.lessonCount ? (
              <span className="flex items-center gap-1">
                <CirclePlay className="size-3.5" aria-hidden />
                {count(p.lessonCount, LESSONS)}
              </span>
            ) : null}
            {p.totalDurationSeconds ? (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {duration(p.totalDurationSeconds)}
              </span>
            ) : null}
          </span>
        </span>
      </div>
      <div className={`flex flex-col gap-2 ${featured ? "p-6" : "flex-1 p-5"}`}>
        <p className={s.typeLabel}>{p.gradeName}</p>
        <h3 className={s.cardTitle} style={featured ? { fontSize: "1.3rem" } : undefined}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h3>
        <TeacherLine p={p} />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          <Price p={p} size={featured ? "lg" : "md"} />
          {featured && p.previewLessonId ? (
            <Link href={previewHref(p)} className={`${s.ctaInk} ${s.lift}`}>
              <Play className="size-4 translate-x-px fill-current" aria-hidden />
              شاهد المعاينة
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────── ليلة الاختبار ─────────────────────────── */

const REVIEW_TONE: Record<string, React.CSSProperties> = {
  exam_review: { "--a": "#FFDC70", "--b": "#FFB423" } as React.CSSProperties,
  quiz_review: { "--a": "#7CF5DC", "--b": "#2EE6C5" } as React.CSSProperties,
};

function ExamNight({ reviews, grades }: { reviews: ProductCard[]; grades: Grade[] }) {
  if (!reviews.length) return null;
  return (
    <section className={`${s.night} ${s.dark} py-24 sm:py-28`} aria-labelledby="exam-title">
      <Starfield className={s.stars} seed={19} density={60} />
      <div className={s.wrap}>
        <div className="mb-12 grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className={s.kicker}>
              <MoonStar className="size-4.5" aria-hidden />
              قبل الاختبار
            </p>
            <h2 id="exam-title" className={`${s.h2} mt-2`} style={{ fontSize: "clamp(2rem, 1.3rem + 3vw, 3.4rem)" }}>
              ليلة الاختبار؟ راجع مع معلمك.
            </h2>
            <p className={`${s.sub} mt-3`}>دروس قصيرة مركزة على الأسئلة المتوقعة، قبل الاختبار القصير وقبل الاختبار النهائي. شاهدها الليلة، وادخل الاختبار وأنت مرتاح.</p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
              <li className="flex items-center gap-2">
                <span className={s.legendDot} style={REVIEW_TONE.exam_review} aria-hidden />
                {PRODUCT_TYPE_LABELS.exam_review}
              </li>
              <li className="flex items-center gap-2">
                <span className={s.legendDot} style={REVIEW_TONE.quiz_review} aria-hidden />
                {PRODUCT_TYPE_LABELS.quiz_review}
              </li>
            </ul>
          </div>
          <ExamClock className={`${s.clock} mx-auto hidden md:block`} />
        </div>

        <ul className={`${s.rail} grid gap-6 lg:grid-cols-2`}>
          {reviews.map((p) => (
            <li key={p.id} className={s.ticketShadow}>
              <ExamTicket p={p} />
            </li>
          ))}
          <li>
            <div className={`${s.ticketCta} h-full`}>
              <p className={`${s.display} text-xl leading-9 font-bold`}>مراجعات مادتك كلها في صفحة صفك</p>
              <div className="flex flex-wrap gap-2">
                {grades.map((g) => (
                  <Link key={g.id} href={`/grades/${g.slug}`} className={s.gradePill} style={gradeVars(g.level)}>
                    <i aria-hidden />
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}

function ExamTicket({ p }: { p: ProductCard }) {
  const key = subjectKey(p.subjectName);
  const digits = ar(String(Math.min(p.lessonCount, 99)).padStart(2, "0")).split("");
  return (
    <article className={`${s.ticket} relative`} style={{ ...themeVars(p.subjectName), ...REVIEW_TONE[p.type] }}>
      <div className={s.stub}>
        <SubjectArt kind={key} className={s.art} />
        <span className={s.stubType}>
          {p.type === "exam_review" ? <MoonStar className="size-3.5" aria-hidden /> : <Ticket className="size-3.5" aria-hidden />}
          {PRODUCT_TYPE_LABELS[p.type]}
        </span>
        <span className="relative">
          <span className={`${s.coverSubject} block text-2xl`}>{p.subjectName}</span>
          <span className="mt-0.5 block text-sm text-white/85">{p.gradeName}</span>
        </span>
      </div>
      <span className={s.perf} aria-hidden />
      <div className={s.ticketBody}>
        <h3 className={s.ticketTitle}>
          <Link href={`/products/${p.slug}`} className={s.stretch}>
            {p.title}
          </Link>
        </h3>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="flex items-center gap-2.5">
            <span className={s.flip} dir="ltr" aria-hidden>
              {digits.map((c, i) => (
                <b key={i}>{c}</b>
              ))}
            </span>
            <span className="text-sm leading-6 text-white/80">
              {count(p.lessonCount, LESSONS)}
              <span className="block text-white/60">{duration(p.totalDurationSeconds)}</span>
            </span>
          </span>
          {p.teacherName ? <span className="text-sm text-white/75">{p.teacherName}</span> : null}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <Price p={p} />
          {p.previewLessonId ? (
            <Link href={previewHref(p)} className={`${s.ticketBtn} ${s.lift}`}>
              <Play className="size-3.5 translate-x-px fill-current" aria-hidden />
              معاينة مجانية
            </Link>
          ) : (
            <span className={`${s.ticketBtn} pointer-events-none`} aria-hidden>
              التفاصيل
              <ArrowLeft className="size-4" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────── المعلمون ─────────────────────────── */

function Teachers({ teachers }: { teachers: TeacherCard[] }) {
  if (!teachers.length) return null;
  return (
    <section className="py-24 sm:py-28" aria-labelledby="teachers-title">
      <div className={s.wrap}>
        <SectionHead
          id="teachers-title"
          kicker="المعلمون"
          icon={Users}
          title="تعلّم مع معلم تفهم منه"
          sub="لكل معلم صفحة فيها كل شروحاته ومراجعاته، مرتبة حسب الصف والمادة."
          action={
            <Link href="/teachers" className={s.moreLink}>
              كل المعلمين
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          }
        />
        <ul className={`${s.rail} grid gap-5 sm:grid-cols-2 lg:grid-cols-4`}>
          {teachers.map((t) => {
            const first = t.subjects[0]?.name ?? null;
            const Icon = SUBJECT_ICON[subjectKey(first)];
            return (
              <li key={t.id}>
                <article className={`${s.tcard} h-full`} style={themeVars(first)}>
                  <div className={s.tstage}>
                    <span className={s.ring} style={{ width: 170, height: 170 }} aria-hidden />
                    <span className={s.ring} style={{ width: 240, height: 240, opacity: 0.6 }} aria-hidden />
                    <span className={s.ring} style={{ width: 320, height: 320, opacity: 0.35 }} aria-hidden />
                    <span className={s.medal} aria-hidden>
                      {initial(t.name)}
                      <span className={s.medalBadge}>
                        <Icon className="size-5" />
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div>
                      <h3 className={`${s.display} text-lg leading-8 font-bold`}>
                        <Link href={`/teachers/${t.slug}`} className={s.stretch}>
                          {t.name}
                        </Link>
                      </h3>
                      {t.headline ? <p className="mt-0.5 line-clamp-2 text-sm leading-7 text-[color:var(--muted)]">{t.headline}</p> : null}
                    </div>
                    {t.subjects.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {t.subjects.slice(0, 3).map((sub) => (
                          <li key={sub.id} className={s.subjectChip}>
                            <b>{sub.name}</b>
                            {sub.gradeName}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className={`${s.metaRow} mt-auto border-t border-[color:var(--line)] pt-3`}>
                      {t.videoCount ? (
                        <span>
                          <CirclePlay className="size-4 text-[#4338CA]" aria-hidden />
                          {count(t.videoCount, VIDEO_LESSONS)}
                        </span>
                      ) : null}
                      {t.productCount ? (
                        <span>
                          <Layers className="size-4 text-[#4338CA]" aria-hidden />
                          {count(t.productCount, CONTENT)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────── الباقات ─────────────────────────── */

function Bundles({ bundles, levelOf }: { bundles: ProductCard[]; levelOf: Map<string, number> }) {
  if (!bundles.length) return null;
  return (
    <section className={`${s.aurora} ${s.dark} py-24 sm:py-28`} aria-labelledby="bundles-title">
      <Starfield className={s.stars} seed={3} density={40} />
      <div className={s.wrap}>
        <SectionHead
          id="bundles-title"
          kicker="الباقات"
          icon={Package}
          title="باقة صفك كاملة، بسعر أقل"
          sub="كل المذكرات النهائية لصفك في باقة واحدة، أرخص من شرائها مذكرةً مذكرة."
          action={
            <Link href="/bundles" className={s.moreLink}>
              كل الباقات
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          }
        />
        <ul className={`${s.rail} grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4`}>
          {bundles.map((b) => {
            const level = levelOf.get(b.gradeName);
            const save = saving(b);
            return (
              <li key={b.id}>
                <article className={`${s.bcard} h-full`} style={gradeVars(level)}>
                  {save ? (
                    <span className={s.ribbon}>
                      <Sparkles className="size-3.5" aria-hidden />
                      وفّر {kwd(save)} د.ك
                    </span>
                  ) : null}
                  <div className={s.bvisual} aria-hidden>
                    {level ? <span className={s.bnum}>{ar(level)}</span> : null}
                    {[-16, 16, 0].map((r) => (
                      <span key={r} className={s.fanCard} style={{ "--r": `${r}deg` } as React.CSSProperties}>
                        <FileText className="size-5" />
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 px-2">
                    <h3 className={`${s.display} text-[1.08rem] leading-8 font-semibold`}>
                      <Link href={`/products/${b.slug}`} className={s.stretch}>
                        {b.title}
                      </Link>
                    </h3>
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      <Price p={b} size="lg" />
                      {percentOff(b) ? <span className={s.offBadge}>خصم {ar(percentOff(b))}٪</span> : null}
                    </div>
                    <span className={s.btnLine} aria-hidden>
                      اعرض محتوى الباقة
                      <ArrowLeft className="size-4" />
                    </span>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────── المذكرات ─────────────────────────── */

function Notes({ notes }: { notes: ProductCard[] }) {
  if (!notes.length) return null;
  return (
    <section className="pt-24 pb-16 sm:pt-28" aria-labelledby="notes-title">
      <div className={s.wrap}>
        <SectionHead
          id="notes-title"
          kicker="المذكرات"
          icon={FileText}
          title="المذكرات النهائية"
          sub="خلاصة المنهج في صفحات قليلة. تقرأها داخل المنصة، وتطبعها إذا كانت متاحة للتنزيل."
        />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => {
            const Icon = SUBJECT_ICON[subjectKey(n.subjectName)];
            return (
              <li key={n.id}>
                <article className={`${s.note} h-full`} style={themeVars(n.subjectName)}>
                  <div className={s.paperWrap} aria-hidden>
                    <span className={s.paperBack} />
                    <span className={s.paper}>
                      <span className={s.paperHead}>
                        <Icon className="size-7" />
                      </span>
                      <span className={s.paperLines} />
                    </span>
                    <span className={s.pdfTag}>
                      <FileText className="size-4" />
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className={s.typeLabel}>
                      {PRODUCT_TYPE_LABELS[n.type]}، {n.gradeName}
                    </p>
                    <h3 className={`${s.display} text-lg leading-8 font-bold`}>
                      <Link href={`/products/${n.slug}`} className={s.stretch}>
                        {n.subjectName ?? n.title}
                      </Link>
                    </h3>
                    {n.pageCount ? (
                      <p className="flex items-center gap-1.5 text-sm text-[color:var(--muted)]">
                        <FileText className="size-4" aria-hidden />
                        {count(n.pageCount, PAGES)}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Price p={n} />
                      {percentOff(n) ? <span className={s.offBadge}>خصم {ar(percentOff(n))}٪</span> : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────── كيف تبدأ ─────────────────────────── */

const STEPS: { title: string; body: string; icon: LucideIcon; a: string; b: string }[] = [
  { title: "اختر صفك ومادتك", body: "كل صف مرتب حسب المادة ونوع الشرح، فتصل لما تحتاجه بنفسك.", icon: GraduationCap, a: "#7CF5DC", b: "#2EE6C5" },
  { title: "شاهد المعاينة المجانية", body: "أغلب الشروحات فيها درس مجاني، بدون حساب وبدون دفع.", icon: CirclePlay, a: "#9FC7FF", b: "#6E86FF" },
  { title: "ادفع بكي نت أو البطاقة", body: "دفع إلكتروني آمن عبر بوابة ماي فاتورة، ولا نحتفظ ببيانات بطاقتك.", icon: ShieldCheck, a: "#FFDC70", b: "#FFB423" },
  { title: "تجده في مكتبتك", body: "يظهر فور تأكيد الدفع، وتكمل الفيديو من حيث توقفت على أي جهاز.", icon: Library, a: "#F3A6FF", b: "#EE4C93" },
];

function Steps() {
  return (
    <section className="py-16" aria-labelledby="steps-title">
      <div className={s.wrap}>
        <div className={`${s.stepsPanel} ${s.dark} px-5 py-12 sm:px-10 sm:py-16 lg:px-14`}>
          <Starfield className={s.stars} seed={11} density={36} />
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className={`${s.kicker} justify-center`}>
              <Sparkles className="size-4.5" aria-hidden />
              كيف تبدأ
            </p>
            <h2 id="steps-title" className={`${s.h2} mt-2`}>
              أربع خطوات، وتبدأ المذاكرة
            </h2>
          </div>
          <div className="relative">
            <PathLine className={`${s.pathLine} hidden lg:block`} />
            <ol className={`${s.stepsList} grid gap-8 lg:grid-cols-4 lg:gap-6`}>
              {STEPS.map((st, i) => (
                <li key={st.title} className="relative flex gap-5 lg:flex-col lg:items-center lg:text-center">
                  <span className={s.node} style={{ "--a": st.a, "--b": st.b } as React.CSSProperties}>
                    <st.icon className="size-7" aria-hidden />
                    <span className={s.nodeNum}>{ar(i + 1)}</span>
                  </span>
                  <div className="pt-1 lg:pt-3">
                    <h3 className={s.stepTitle}>{st.title}</h3>
                    <p className="mt-1 max-w-xs text-[0.95rem] leading-7 text-white/72 lg:mx-auto">{st.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── الأسئلة الشائعة ─────────────────────────── */

function Faq({ faq }: { faq: { q: string; a: string }[] }) {
  if (!faq.length) return null;
  return (
    <section id="faq" className="pt-12 pb-28" aria-labelledby="faq-title">
      <div className={`${s.wrap} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className={s.kicker}>
            <MessageCircle className="size-4.5" aria-hidden />
            الأسئلة الشائعة
          </p>
          <h2 id="faq-title" className={`${s.h2} mt-2`}>
            قبل أن تسأل
          </h2>
          <p className={`${s.sub} mt-2`}>إجابات قصيرة عن الشراء والمشاهدة والمذكرات، للطالب ولولي الأمر.</p>
          <div className={`${s.helpCard} ${s.dark} mt-8`}>
            <p className={`${s.display} text-lg leading-8 font-bold`}>ما وجدت جوابك؟</p>
            <p className="mt-1 text-sm leading-7 text-white/75">راسلنا وسنرد عليك في أقرب وقت.</p>
            <Link href="/contact" className={`${s.btnGold} mt-5 min-h-12! text-[0.95rem]!`}>
              <Mail className="size-4.5" aria-hidden />
              تواصل معنا
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {faq.map((f, i) => (
            <details key={f.q} className={s.faqItem} open={i === 0}>
              <summary>
                {f.q}
                <span className={s.faqIcon} aria-hidden>
                  <Plus className="size-4.5" />
                </span>
              </summary>
              <p className="px-5 pb-5 leading-8 text-[color:var(--ink-2)]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── التذييل ─────────────────────────── */

function SiteFooter({ d }: { d: Data }) {
  return (
    <footer className={`${s.footer} ${s.dark}`}>
      <Starfield className={s.stars} seed={23} density={50} />
      <div className={`${s.wrap} pt-20`}>
        <div className={`${s.ctaBand} px-6 py-10 sm:px-12 sm:py-14`}>
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className={s.h2}>جاهز تبدأ الليلة؟</h2>
              <p className="mt-2 max-w-xl leading-8 text-white/80">اختر صفك، وشاهد أول درس مجانًا قبل أن تقرر.</p>
            </div>
            <ul className="flex flex-wrap gap-2.5">
              {d.grades.map((g) => (
                <li key={g.id}>
                  <Link href={`/grades/${g.slug}`} className={`${s.gradePill} ${s.gradePillLg}`} style={gradeVars(g.level)}>
                    <i aria-hidden />
                    {g.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href={HOME} className="inline-flex min-h-11 items-center gap-2.5 text-white">
              <LogoMark />
              <span className={s.wordmark}>{d.settings.site_name}</span>
            </Link>
            <p className="mt-3 max-w-xs leading-8">{d.settings.tagline}</p>
          </div>
          <nav aria-label="الصفوف">
            <p className={s.footHead}>الصفوف</p>
            <ul className="mt-3">
              {d.grades.map((g) => (
                <li key={g.id}>
                  <Link href={`/grades/${g.slug}`} className={s.footLink}>
                    {g.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="روابط المنصة">
            <p className={s.footHead}>المنصة</p>
            <ul className="mt-3">
              <li>
                <Link href="/teachers" className={s.footLink}>
                  المعلمون
                </Link>
              </li>
              <li>
                <Link href="/bundles" className={s.footLink}>
                  الباقات
                </Link>
              </li>
              <li>
                <Link href="/library" className={s.footLink}>
                  مكتبتي
                </Link>
              </li>
              <li>
                <a href="#faq" className={s.footLink}>
                  الأسئلة الشائعة
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label="السياسات والتواصل">
            <p className={s.footHead}>المساعدة</p>
            <ul className="mt-3">
              <li>
                <Link href="/contact" className={s.footLink}>
                  تواصل معنا
                </Link>
              </li>
              <li>
                <Link href="/terms" className={s.footLink}>
                  الشروط والأحكام
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={s.footLink}>
                  سياسة الخصوصية
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className={s.footLink}>
                  سياسة الاسترجاع
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-7 text-sm text-white/60">
          <p>
            © {ar(new Date().getFullYear())} {d.settings.site_name}. {d.settings.footer_note}
          </p>
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#2EE6C5]" aria-hidden />
            دفع إلكتروني آمن عبر ماي فاتورة
          </p>
        </div>
      </div>
    </footer>
  );
}
