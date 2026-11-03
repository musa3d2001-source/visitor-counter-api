import type * as React from "react";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, ClipboardList, FileCheck2, FileText, Layers, Moon, MonitorPlay, Package, PlayCircle, Sun, Timer } from "lucide-react";
import type { ProductCard as ProductCardData, TeacherCard } from "@/server/catalog/queries";
import { GradeArt, NightSky, Sparkle, SubjectArt, SubjectIcon, Sunrise } from "@/components/art";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ExamTicket } from "@/components/site/exam-ticket";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { ar, count, countParts, shortName, toneClass, type CountWord, type Tone, W } from "@/lib/design";
import { isPdfType, PRODUCT_TYPE_SECTION_LABELS, type ProductType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import s from "./browse.module.css";

export { s as browseStyles };

/* ───────────── المعدودات الخاصة بأنواع المحتوى ───────────── */

export const WORDS = {
  video: { one: "شرح مرئي", two: "شرحان مرئيان", plural: "شروح مرئية", acc: "شرحًا مرئيًا" },
  pdf: { one: "ملف PDF", two: "ملفّا PDF", plural: "ملفات PDF", acc: "ملفًا PDF", single: "ملف PDF واحد" },
  unit: { one: "وحدة", two: "وحدتان", plural: "وحدات", acc: "وحدة", oneSuffix: "واحدة" },
  course: { one: "دورة", two: "دورتان", plural: "دورات", acc: "دورة", oneSuffix: "واحدة" },
  review: { one: "مراجعة", two: "مراجعتان", plural: "مراجعات", acc: "مراجعة", oneSuffix: "واحدة" },
  model: { one: "نموذج", two: "نموذجان", plural: "نماذج", acc: "نموذجًا" },
  bundle: { one: "باقة", two: "باقتان", plural: "باقات", acc: "باقة", oneSuffix: "واحدة" },
} as const satisfies Record<string, CountWord>;

const TYPE_WORD: Record<ProductType, CountWord> = {
  unit: WORDS.unit,
  video_course: WORDS.course,
  video_lesson: W.lesson,
  quiz_review: WORDS.review,
  exam_review: WORDS.review,
  final_notes: W.note,
  review_notes: W.note,
  exam_night: W.note,
  exam_model: WORDS.model,
  answer_key: WORDS.model,
  bundle: WORDS.bundle,
};

/** نغمة رأس القسم حسب النوع: الفيديو بلون المادة، المذكرات ذهبي، المراجعات بنفسجي، الباقات مرجاني */
const TYPE_TONE: Record<"video" | "pdf" | "review" | "bundle", Tone> = {
  video: { from: "#2DC2B3", to: "#0A6B66", deep: "#08534F", soft: "#DDF6F2", ink: "#08565A" },
  pdf: { from: "#FFD25E", to: "#EB9B00", deep: "#A86A00", soft: "#FFF2D6", ink: "#7A4C00" },
  review: { from: "#B28CFF", to: "#6A3FE0", deep: "#5230B8", soft: "#F0EAFF", ink: "#5A34C9" },
  bundle: { from: "#FFA07A", to: "#E8483F", deep: "#B4322A", soft: "#FFE7DF", ink: "#9E3520" },
};

export function typeFamily(t: ProductType): "video" | "pdf" | "review" | "bundle" {
  if (t === "bundle") return "bundle";
  if (t === "quiz_review" || t === "exam_review") return "review";
  if (isPdfType(t)) return "pdf";
  return "video";
}

const TYPE_ICON: Record<ProductType, React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  unit: MonitorPlay,
  video_course: PlayCircle,
  video_lesson: MonitorPlay,
  quiz_review: Sun,
  exam_review: Moon,
  final_notes: BookOpenCheck,
  review_notes: FileText,
  exam_night: Timer,
  exam_model: ClipboardList,
  answer_key: FileCheck2,
  bundle: Package,
};

/**
 * الرقم والمعدود لكبسولات الأرقام (StatPill) بصيغة عربية صحيحة:
 * ١ ← «معلم واحد»، ٢ ← «معلمان»، وإلا ← «٦ مواد» / «٢٦ منتجًا».
 */
export function pillCount(n: number, w: CountWord): { num: string; label: string } {
  if (n === 1) return { num: w.one, label: w.oneSuffix ?? "واحد" };
  if (n === 2) return { num: w.two, label: "" };
  return countParts(n, w);
}

export function typeCount(t: ProductType, n: number) {
  return count(n, TYPE_WORD[t]);
}

function hexVars(t: Tone): React.CSSProperties {
  return { "--a": t.from, "--b": t.to, "--d": t.deep, "--soft": t.soft, "--tink": t.ink } as React.CSSProperties;
}

/** أيقونة نوع المحتوى في مربع متدرج بلون عائلته */
export function TypeIcon({ type, className }: { type: ProductType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className={cn("icon-tile", className)} style={hexVars(TYPE_TONE[typeFamily(type)])} aria-hidden>
      <Icon aria-hidden />
    </span>
  );
}

/** رأس قسم نوع: مربع أيقونة + عنوان + عدد حقيقي */
export function TypeHead({
  type,
  id,
  title,
  n,
  as: H = "h2",
  light,
  extra,
  compact,
}: {
  type: ProductType;
  id?: string;
  title: React.ReactNode;
  n: number;
  as?: "h2" | "h3";
  light?: boolean;
  extra?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn(s.typeHead, compact && s.compactHead)}>
      <TypeIcon type={type} className={s.typeIcon} />
      <div className="min-w-0 flex-1">
        <H id={id} className={cn(s.typeTitle, light && s.typeTitleLight)}>
          {title}
        </H>
        <p className={s.typeCount}>{typeCount(type, n)}</p>
      </div>
      {extra}
    </div>
  );
}

/**
 * أقسام الأنواع كخانات متجاورة: كل نوع يأخذ أعمدة بعدد عناصره (حتى عرض الشبكة)، بعنوانه وعدده فوقه.
 * يمنع ذلك أقسامًا ضخمة فيها بطاقة واحدة وفراغ كبير. ‎notes‎: شبكة أوراق أضيق.
 */
export function TypeSlots({
  groups,
  notes,
  renderItem,
  headingAs = "h3",
  idPrefix = "",
  testId,
}: {
  groups: { type: ProductType; items: ProductCardData[] }[];
  notes?: boolean;
  renderItem: (p: ProductCardData) => React.ReactNode;
  headingAs?: "h2" | "h3";
  /** بادئة المعرّفات حين تتكرر الأنواع في الصفحة (صفحة المعلم) */
  idPrefix?: string;
  testId?: string;
}) {
  const span = (n: number) => [s.n1, s.n2, s.n3, s.n4, s.n5][Math.min(Math.max(n, 1), 5) - 1];
  return (
    <div className={cn(s.slots, notes && s.slotsNotes)}>
      {groups.map((g) => (
        <section
          key={g.type}
          id={`${idPrefix}sec-${g.type}`}
          data-testid={testId}
          className={cn(s.slot, span(g.items.length), "scroll-mt-28")}
          aria-labelledby={`${idPrefix}type-${g.type}`}
        >
          <TypeHead compact type={g.type} id={`${idPrefix}type-${g.type}`} as={headingAs} title={PRODUCT_TYPE_SECTION_LABELS[g.type]} n={g.items.length} />
          <ul className={s.slotList}>
            {g.items.map((p) => (
              <li key={p.id}>{renderItem(p)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** شريحة القفز إلى قسم نوع (مع العدد) */
export function JumpChip({ type, href, label, n }: { type: ProductType; href: string; label: string; n: number }) {
  const Icon = TYPE_ICON[type];
  return (
    <a href={href} className={s.jumpChip} style={hexVars(TYPE_TONE[typeFamily(type)])}>
      <span aria-hidden>
        <Icon aria-hidden />
      </span>
      {label}
      <b>{ar(n)}</b>
    </a>
  );
}

/* ───────────── البطل الملوّن ───────────── */

/**
 * شريط بطل بلون الصف أو المادة: جانب النص على الدرجة الداكنة للنغمة (نص أبيض AA)،
 * ونافذة مضيئة بالتدرج الكامل فيها الرقم البارز أو رسم المادة. ‎toneClassName‎: ‎grade-8‎ أو ‎tone-math‎.
 */
export function ToneHero({
  toneClassName,
  breadcrumbs,
  eyebrow,
  title,
  titleId,
  sub,
  stats,
  actions,
  extra,
  window,
}: {
  toneClassName: string;
  breadcrumbs: { label: string; href?: string }[];
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleId: string;
  sub?: React.ReactNode;
  stats?: React.ReactNode;
  actions?: React.ReactNode;
  extra?: React.ReactNode;
  window: React.ReactNode;
}) {
  return (
    <section className={cn(s.heroWrap, toneClassName)} aria-labelledby={titleId}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Breadcrumbs items={breadcrumbs} className={s.crumbs} />
        <div className={cn(s.band, "on-dark")}>
          <Sparkle className={cn(s.spark1, "animate-twinkle")} />
          <Sparkle className={cn(s.spark2, "animate-twinkle [animation-delay:1.2s]")} color="#fff" />
          <div className={s.bandText}>
            {eyebrow}
            <h1 id={titleId} className={s.title}>
              {title}
            </h1>
            {sub ? <p className={s.sub}>{sub}</p> : null}
            {stats ? <div className={s.stats}>{stats}</div> : null}
            {actions ? <div className={s.actions}>{actions}</div> : null}
            {extra ? <div className={s.bandExtra}>{extra}</div> : null}
          </div>
          {window}
        </div>
      </div>
    </section>
  );
}

/** نافذة الصف: رقم عربي بارز ثلاثي الأبعاد + رسم الصف */
export function GradeWindow({ level }: { level: number }) {
  return (
    <div className={s.window} aria-hidden>
      <span className={s.numeral}>{ar(level)}</span>
      <span className={s.windowArt}>
        <GradeArt level={level} />
      </span>
      <Sparkle className={cn(s.windowSpark, "animate-twinkle")} color="#fff" />
    </div>
  );
}

/** نافذة المادة: رسم المادة الكبير + أيقونتها + ملصق الصف */
export function SubjectWindow({ slug, icon, gradeLevel, gradeName, gradeToneClass }: { slug: string; icon?: string | null; gradeLevel: number | null; gradeName: string; gradeToneClass: string }) {
  return (
    <div className={s.window} aria-hidden>
      <span className={s.windowIcon}>
        <SubjectIcon slug={slug} name={icon} size={32} strokeWidth={2.2} />
      </span>
      <span className={cn(s.windowArt, s.windowArtCenter)}>
        <SubjectArt slug={slug} />
      </span>
      <span className={s.windowSticker}>
        {gradeLevel ? <span className={cn("num-tile", gradeToneClass)}>{ar(gradeLevel)}</span> : null}
        {gradeName}
      </span>
      <Sparkle className={cn(s.windowSpark, "animate-twinkle")} color="#fff" />
    </div>
  );
}

/** كبسولات المعلمين البيضاء داخل البطل (روابط إلى صفحاتهم) */
export function HeroTeachers({ label, teachers, anchor }: { label: string; teachers: TeacherCard[]; anchor?: string }) {
  if (!teachers.length) return null;
  return (
    <div aria-labelledby="subject-teachers">
      <h2 id="subject-teachers" className={s.teachLabel}>
        {label}
      </h2>
      <div className={s.teachRow}>
        {teachers.map((t) => (
          <Link key={t.id} href={`/teachers/${t.slug}${anchor ? `#${anchor}` : ""}`} data-testid="subject-teacher" className={s.teachChip}>
            <TeacherAvatar name={t.name} photoUrl={t.photoUrl} size={40} subjectSlug={t.subjects[0]?.slug ?? null} decorative />
            <span className="whitespace-nowrap">{t.name}</span>
            <ArrowLeft aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ───────────── بطاقة المادة (صفحة الصف) ───────────── */

export function SubjectCard({
  subject: x,
  href,
  videos,
  pdfs,
  total,
  teachers,
}: {
  subject: { slug: string; name: string; icon?: string | null };
  href: string;
  videos: number;
  pdfs: number;
  total: number;
  teachers: TeacherCard[];
}) {
  const names = teachers.slice(0, 2).map((t) => shortName(t.name));
  return (
    <Link href={href} className={cn("tile-3d", s.scard, toneClass(x.slug))}>
      <span className={cn("poster", s.scover)} aria-hidden>
        <span className={s.sicon}>
          <SubjectIcon slug={x.slug} name={x.icon} size={26} strokeWidth={2.3} />
        </span>
        <span className={s.scoverArt}>
          <SubjectArt slug={x.slug} />
        </span>
      </span>
      <span className={s.sbody}>
        <span className={s.sname}>{x.name}</span>
        <span className={s.schips}>
          {videos > 0 ? (
            <span className="chip">
              <MonitorPlay aria-hidden />
              {count(videos, WORDS.video)}
            </span>
          ) : null}
          {pdfs > 0 ? (
            <span className="chip">
              <FileText aria-hidden />
              {count(pdfs, WORDS.pdf)}
            </span>
          ) : null}
          {videos === 0 && pdfs === 0 && total > 0 ? (
            <span className="chip">
              <Layers aria-hidden />
              {count(total, W.product)}
            </span>
          ) : null}
        </span>
        {teachers.length ? (
          <span className={s.steach}>
            <span aria-hidden>
              {teachers.slice(0, 3).map((t) => (
                <TeacherAvatar key={t.id} name={t.name} photoUrl={t.photoUrl} size={30} ring decorative inheritTone />
              ))}
            </span>
            <span className={s.steachName}>مع {names.join(" و")}</span>
          </span>
        ) : null}
        <span className={s.sgo}>
          ادخل المادة
          <ArrowLeft aria-hidden />
        </span>
      </span>
    </Link>
  );
}

/* ───────────── لوحة «قبل الاختبار» ───────────── */

/**
 * لوحة ليلية متدرجة (v2-c) بعمودين: مراجعات ليلة الاختبار والاختبارات القصيرة، بتذاكر مثقوبة.
 * ‎titleAs‎ يحدد مستوى العنوان الرئيسي؛ عناوين الأعمدة أدنى منه بدرجة.
 */
export function NightPanel({
  id,
  title,
  sub,
  night,
  quiz,
  owned,
  nightLabel = "مراجعات ليلة الاختبار",
  quizLabel = "مراجعات الاختبارات القصيرة",
  colIds,
}: {
  id: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  night: ProductCardData[];
  quiz: ProductCardData[];
  owned?: Set<string>;
  nightLabel?: string;
  quizLabel?: string;
  colIds?: { night?: string; quiz?: string };
}) {
  const cols = [night.length ? "night" : null, quiz.length ? "quiz" : null].filter(Boolean) as ("night" | "quiz")[];
  const one = cols.length === 1;
  return (
    <section className={cn(s.night, "on-dark")} aria-labelledby={id}>
      <NightSky className={s.nightSky} />
      <Sunrise className={s.nightSun} />
      <div className={s.nightHead}>
        <span className="eyebrow-pill eyebrow-light">
          <span className="eyebrow-icon">
            <Timer aria-hidden />
          </span>
          موسم الاختبارات
        </span>
        <h2 id={id} className="h-section mt-3 text-white">
          {title}
        </h2>
        {sub ? <p className={s.nightSub}>{sub}</p> : null}
      </div>
      <div className={cn(s.nightCols, one && s.nightOne)}>
        {cols.map((c) => {
          const items = c === "night" ? night : quiz;
          return (
            <div key={c}>
              <h3 id={c === "night" ? colIds?.night : colIds?.quiz} className={cn(s.nightColTitle, "scroll-mt-28")}>
                <span className={cn(s.nightColIcon, c === "quiz" && s.nightColIconSun)} aria-hidden>
                  {c === "night" ? <Moon /> : <Sun />}
                </span>
                {c === "night" ? nightLabel : quizLabel}
              </h3>
              <ul className={cn(s.ticketList, one && items.length > 1 && s.ticketList2)}>
                {items.map((p) => (
                  <li key={p.id}>
                    <ExamTicket product={p} owned={owned?.has(p.id)} headingLevel={4} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** ما يتوفر فعلًا من أنواع المحتوى، كعبارة عربية: «شرح الوحدات بالفيديو، ومراجعات قبل الاختبار، ومذكرات جاهزة للطباعة» */
export function offerPhrase(products: Pick<ProductCardData, "type">[]): string {
  const fams = new Set(products.map((p) => typeFamily(p.type)));
  const parts = [
    fams.has("video") ? "شرح الوحدات بالفيديو" : null,
    fams.has("review") ? "مراجعات قبل الاختبار" : null,
    fams.has("pdf") ? "مذكرات جاهزة للطباعة" : null,
    fams.has("bundle") ? "باقات تجمع المواد" : null,
  ].filter(Boolean) as string[];
  return parts.map((x, i) => (i === 0 ? x : `و${x}`)).join("، ");
}

/** تجميع منتجات حسب العائلة (الترتيب كما جاء من الاستعلام) */
export function splitByFamily(products: ProductCardData[]) {
  return {
    videos: products.filter((p) => typeFamily(p.type) === "video"),
    night: products.filter((p) => p.type === "exam_review"),
    quiz: products.filter((p) => p.type === "quiz_review"),
    notes: products.filter((p) => typeFamily(p.type) === "pdf"),
  };
}
