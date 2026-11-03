/**
 * دليل الأسلوب الحي لنظام «الفصل المشمس» (v2-c) — للتطوير فقط (مجلد lab يعيد 404 في الإنتاج).
 * يعرض الرموز، سلم الخطوط، كل متغيرات الأزرار والكبسولات والأسعار والتنبيهات والنماذج والجداول
 * والحالات الفارغة، والرسومات، ورأس الموقع وتذييله. ارجع إليه لضبط الاتساق قبل بناء أي صفحة.
 */
import type { Metadata } from "next";
import Link from "next/link";
import type * as React from "react";
import {
  ArrowLeft,
  BadgePercent,
  Brush,
  CircleCheck,
  Component,
  FileText,
  GraduationCap,
  Heart,
  LayoutGrid,
  MonitorPlay,
  Palette,
  Play,
  PlayCircle,
  ShoppingCart,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Users,
} from "lucide-react";
import {
  BundleStack,
  GradeArt,
  LogoMark,
  NightSky,
  Sparkle,
  SpotArt,
  StepArt,
  SubjectArt,
  SubjectIcon,
  Sunrise,
  Swash,
} from "@/components/art";
import { SiteFooter } from "@/components/site/footer";
import { CatalogShowcase } from "./catalog-showcase";
import { SiteHeader } from "@/components/site/header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader, StatPill } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import {
  GRADE_TONES,
  SUBJECT_ORDER,
  SUBJECT_TONES,
  ar,
  count,
  countParts,
  duration,
  gradeClass,
  savings,
  toneClass,
  W,
} from "@/lib/design";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "دليل الأسلوب · الفصل المشمس" };

const SUBJECT_NAMES: Record<string, string> = {
  arabic: "اللغة العربية",
  english: "اللغة الإنجليزية",
  math: "الرياضيات",
  science: "العلوم",
  islamic: "التربية الإسلامية",
  social: "الاجتماعيات",
};
const GRADE_NAMES: Record<number, string> = { 6: "الصف السادس", 7: "الصف السابع", 8: "الصف الثامن", 9: "الصف التاسع" };

/* أسماء أصناف حرفية حتى يولّدها Tailwind */
const BRAND_SWATCHES = ["bg-brand-50", "bg-brand-100", "bg-brand-200", "bg-brand-300", "bg-brand-400", "bg-brand-500", "bg-brand-600", "bg-brand-700", "bg-brand-800", "bg-brand-900"];
const ACCENT_SWATCHES = ["bg-accent-50", "bg-accent-100", "bg-accent-200", "bg-accent-300", "bg-accent-400", "bg-accent-500", "bg-accent-600", "bg-accent-700", "bg-accent-800", "bg-accent-900"];

const TOC = [
  { id: "tokens", label: "الألوان" },
  { id: "type", label: "الخطوط" },
  { id: "buttons", label: "الأزرار" },
  { id: "badges", label: "الكبسولات" },
  { id: "prices", label: "الأسعار" },
  { id: "alerts", label: "التنبيهات" },
  { id: "forms", label: "النماذج" },
  { id: "tables", label: "الجداول" },
  { id: "cards", label: "البطاقات" },
  { id: "patterns", label: "رؤوس الصفحات" },
  { id: "empty", label: "الحالات الفارغة" },
  { id: "art", label: "الرسومات" },
  { id: "helpers", label: "العدّ والمدد" },
];

function Section({
  id,
  icon,
  eyebrow,
  title,
  sub,
  tone = "",
  children,
}: {
  id: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  sub?: string;
  tone?: "" | "eyebrow-gold" | "eyebrow-coral" | "eyebrow-violet";
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-28 py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <span className={cn("eyebrow-pill", tone)}>
          <span className="eyebrow-icon">{icon}</span>
          {eyebrow}
        </span>
        <h2 id={`${id}-t`} className="h-section mt-3">
          {title}
        </h2>
        {sub ? <p className="lead mt-2 max-w-3xl">{sub}</p> : null}
        <div className="mt-9">{children}</div>
      </div>
    </section>
  );
}

function Swatch({ name, cls, hex, dark }: { name: string; cls: string; hex?: string; dark?: boolean }) {
  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className={cn("h-16 border-b border-black/5", cls)} />
      <div className="px-3 py-2">
        <p className={cn("font-display text-[0.82rem] font-extrabold", dark && "text-ink")}>{name}</p>
        {hex ? <p className="num text-start text-[0.72rem] text-muted">{hex}</p> : null}
      </div>
    </li>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 font-display text-[0.85rem] font-extrabold text-muted">{children}</p>;
}

export default function SystemPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* ═════ المقدمة ═════ */}
        <section className="page-hero pb-16 sm:pb-20">
          <Sparkle className="animate-twinkle absolute end-[10%] top-12 size-7" />
          <Sparkle className="animate-twinkle absolute start-[8%] bottom-16 size-4 [animation-delay:1.4s]" color="#17A398" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "المختبر" }, { label: "دليل الأسلوب" }]} />
            <span className="glass-pill mt-7">
              <span className="grid size-7 place-items-center rounded-full bg-linear-to-br from-[#ffd25e] to-[#ff9f43] text-[#6b3600]">
                <Sun className="size-3.5" aria-hidden />
              </span>
              نظام التصميم «الفصل المشمس»
            </span>
            <h1 className="h-display mt-5 max-w-4xl">
              كل قطعة في المنصة،{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span className="text-hl relative z-10 px-0.5">في مكان واحد</span>
                <Swash className="absolute inset-x-[-6%] bottom-[0.04em] z-0 h-[0.32em] w-[112%]" />
              </span>
            </h1>
            <p className="lead mt-5 max-w-2xl">
              الرموز والأصناف والمكوّنات المعتمدة. ابنِ أي صفحة جديدة من هذه القطع فقط، وارجع إلى هنا للتأكد من الاتساق.
            </p>
            <nav aria-label="أقسام الدليل" className="mt-8 flex flex-wrap gap-2">
              {TOC.map((t) => (
                <a key={t.id} href={`#${t.id}`} className="chip chip-white min-h-10 px-4 text-[0.9rem] hover:text-brand-700">
                  {t.label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        {/* ═════ الألوان ═════ */}
        <Section
          id="tokens"
          icon={<Palette aria-hidden />}
          eyebrow="الرموز"
          title="ألوان دافئة وهوية قابلة للتغيير"
          sub="‏brand و accent مشتقان من إعدادات المنصة؛ كل الدرجات تتبعهما تلقائيًا. الخلفيات كريمية، والحبر أزرق داكن دافئ."
        >
          <Label>الهوية (brand-*) من ‎--brand‎</Label>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
            {BRAND_SWATCHES.map((cls) => (
              <Swatch key={cls} name={cls.slice(3)} cls={cls} />
            ))}
          </ul>
          <Label>
            <span className="mt-8 block">الإبراز (accent-*) من ‎--accent‎</span>
          </Label>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
            {ACCENT_SWATCHES.map((cls) => (
              <Swatch key={cls} name={cls.slice(3)} cls={cls} />
            ))}
          </ul>
          <Label>
            <span className="mt-8 block">المحايدات الدافئة والحالات</span>
          </Label>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            <Swatch name="canvas" cls="bg-canvas" hex="#FFF8EC" />
            <Swatch name="mist" cls="bg-mist" hex="#FFF1DC" />
            <Swatch name="sand" cls="bg-sand" hex="#F6EFE2" />
            <Swatch name="field" cls="bg-field" hex="#FFFCF6" />
            <Swatch name="surface" cls="bg-surface" hex="#FFFFFF" />
            <Swatch name="line" cls="bg-line" hex="#EFE6D6" />
            <Swatch name="line-strong" cls="bg-line-strong" hex="#E0D2BA" />
            <Swatch name="ink" cls="bg-ink" hex="#172026" />
            <Swatch name="ink-soft" cls="bg-ink-soft" hex="#3C4A52" />
            <Swatch name="muted" cls="bg-muted" hex="#5A6670" />
            <Swatch name="coral" cls="bg-coral" hex="#FF6F59" />
            <Swatch name="peach" cls="bg-peach" hex="#FFAD8A" />
            <Swatch name="violet" cls="bg-violet" hex="#6A3FE0" />
            <Swatch name="sky" cls="bg-sky" hex="#4D8DFF" />
            <Swatch name="success" cls="bg-success" hex="#157A4C" />
            <Swatch name="danger" cls="bg-danger" hex="#B4342C" />
            <Swatch name="warning" cls="bg-warning" hex="#8A5A00" />
          </ul>

          <Label>
            <span className="mt-10 block">ألوان المواد (‎.tone-*‎ أو ‎subjectVars(slug)‎)</span>
          </Label>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {SUBJECT_ORDER.map((slug) => (
              <li key={slug} className={cn(toneClass(slug), "card-soft overflow-hidden p-2")}>
                <div className="poster aspect-[16/11]">
                  <div className="absolute inset-y-[12%] end-[6%] aspect-square -rotate-6">
                    <SubjectArt slug={slug} />
                  </div>
                </div>
                <div className="flex items-center gap-2 px-1.5 pt-3 pb-1.5">
                  <span className="icon-tile size-9 rounded-xl">
                    <SubjectIcon slug={slug} size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-[0.9rem] font-extrabold">{SUBJECT_NAMES[slug]}</p>
                    <p className="num text-start text-[0.7rem] text-muted">
                      {SUBJECT_TONES[slug].from} → {SUBJECT_TONES[slug].to}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Label>
            <span className="mt-10 block">ألوان الصفوف (‎.grade-6…9‎ أو ‎gradeVars(level)‎)</span>
          </Label>
          <ul className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {[6, 7, 8, 9].map((lv) => (
              <li key={lv} className={gradeClass(lv)}>
                <Link href={`/grades/grade-${lv}`} className="tile-3d flex flex-col overflow-hidden">
                  <span className="poster poster-grade relative block h-40 rounded-none">
                    <span className="absolute start-5 -top-1 font-display text-[7rem] leading-[1.2] font-black text-white [text-shadow:0_5px_0_color-mix(in_oklab,var(--d)_45%,transparent)]">
                      {ar(lv)}
                    </span>
                    <span className="absolute end-2 bottom-1 size-28">
                      <GradeArt level={lv} />
                    </span>
                  </span>
                  <span className="flex flex-col gap-1 p-4">
                    <span className="font-display text-xl font-black">{GRADE_NAMES[lv]}</span>
                    <span className="text-sm text-muted">
                      «{GRADE_TONES[lv].name}» · <span className="num">{GRADE_TONES[lv].from}</span>
                    </span>
                    <span className="mt-2 inline-flex min-h-11 items-center justify-between rounded-[0.9rem] bg-[var(--soft)] px-4 font-display font-extrabold text-[var(--tink)]">
                      ادخل صفك
                      <ArrowLeft className="size-4.5" aria-hidden />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Label>
            <span className="mt-10 block">الظلال والزوايا</span>
          </Label>
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-5">
            {[
              ["shadow-xs", "rounded-md"],
              ["shadow-card", "rounded-lg"],
              ["shadow-lift", "rounded-2xl"],
              ["shadow-pop", "rounded-3xl"],
              ["shadow-dock", "rounded-4xl"],
            ].map(([sh, r]) => (
              <li key={sh} className={cn("grid h-28 place-items-center bg-white text-center font-display text-sm font-bold", sh, r)}>
                <span>
                  {sh}
                  <br />
                  <span className="text-muted">{r}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="bg-sunny grid h-32 place-items-center rounded-3xl font-display font-extrabold shadow-card">.bg-sunny</div>
            <div className="bg-teal-night on-dark grid h-32 place-items-center rounded-3xl font-display font-extrabold shadow-card">.bg-teal-night</div>
            <div className="dot-grid grid h-32 place-items-center rounded-3xl bg-white font-display font-extrabold shadow-card">.dot-grid</div>
          </div>
          <span className="rainbow-rule mt-8" />
        </Section>

        {/* ═════ الخطوط ═════ */}
        <section className="bg-white">
          <Section
            id="type"
            icon={<Type aria-hidden />}
            eyebrow="الخطوط"
            tone="eyebrow-violet"
            title="Cairo للعناوين، Tajawal للقراءة"
            sub="العناوين والأرقام والأزرار والأسعار بخط Cairo الثقيل؛ النصوص بخط Tajawal بارتفاع سطر ١٫٨ تقريبًا."
          >
            <div className="grid gap-7">
              <div>
                <Label>‎.h-display‎ — عنوان البطل</Label>
                <p className="h-display">افهم درسك وادخل اختبارك</p>
              </div>
              <div>
                <Label>‎.h-page‎ — عنوان الصفحة (h1)</Label>
                <p className="h-page">الصف التاسع</p>
              </div>
              <div>
                <Label>‎.h-section‎ — عنوان القسم (h2)</Label>
                <p className="h-section">
                  في أي صف أنت؟ <span className="text-hl">كل شيء جاهز لك</span>
                </p>
              </div>
              <div>
                <Label>h3 الأساسي — عنوان البطاقة</Label>
                <h3 className="text-xl">الدورة الكاملة في الرياضيات للصف التاسع</h3>
              </div>
              <div>
                <Label>‎.lead‎ ثم النص العادي ثم الصغير</Label>
                <p className="lead">شرح بالفيديو لكل وحدة، ومراجعات قبل الاختبارات القصيرة وليلة الاختبار.</p>
                <p className="mt-2">نص الفقرة العادي بخط Tajawal، مريح للقراءة الطويلة على الجوال والحاسوب.</p>
                <p className="mt-1 text-sm text-muted">نص ثانوي صغير بلون muted (تباين AA فوق الكريمي).</p>
              </div>
              <div>
                <Label>الأرقام: هندية عربية للأعداد، لاتينية للأسعار</Label>
                <p className="font-display text-3xl font-black">
                  {ar(24)} درسًا · <span className="num">7.000</span> د.ك
                </p>
              </div>
            </div>
          </Section>
        </section>

        {/* ═════ الأزرار ═════ */}
        <Section
          id="buttons"
          icon={<Component aria-hidden />}
          eyebrow="الأزرار"
          tone="eyebrow-gold"
          title="أزرار ثلاثية الأبعاد ملموسة"
          sub="‏variant: primary · accent · secondary/soft · outline · light · ghost · danger · danger-outline · link — ‏size: sm · md · lg · xl · icon"
        >
          <div className="grid gap-8">
            {(["sm", "md", "lg", "xl"] as const).map((size) => (
              <div key={size}>
                <Label>size=&quot;{size}&quot;</Label>
                <div className="flex flex-wrap items-center gap-3.5">
                  <Button size={size}>
                    اختر صفك وابدأ
                    <ArrowLeft aria-hidden />
                  </Button>
                  <Button size={size} variant="accent">
                    <ShoppingCart aria-hidden />
                    أضف إلى السلة
                  </Button>
                  <Button size={size} variant="secondary">
                    التفاصيل
                  </Button>
                  <Button size={size} variant="outline">
                    كل المعلمين
                  </Button>
                  <Button size={size} variant="ghost">
                    إلغاء
                  </Button>
                  <Button size={size} variant="danger">
                    <Trash2 aria-hidden />
                    حذف
                  </Button>
                  <Button size={size} variant="danger-outline">
                    إزالة
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Label>icon · link · disabled · asChild (رابط)</Label>
              <div className="flex flex-wrap items-center gap-3.5">
                <Button size="icon" aria-label="تشغيل">
                  <Play aria-hidden />
                </Button>
                <Button size="icon" variant="outline" aria-label="المفضلة">
                  <Heart aria-hidden />
                </Button>
                <Button variant="link">نسيت كلمة المرور؟</Button>
                <Button disabled>زر معطّل</Button>
                <Button asChild variant="outline">
                  <Link href="/teachers">
                    تصفح المعلمين
                    <ArrowLeft aria-hidden />
                  </Link>
                </Button>
                <form>
                  <SubmitButton variant="accent">زر إرسال</SubmitButton>
                </form>
              </div>
            </div>
            <div className="bg-teal-night on-dark rounded-3xl p-6 sm:p-8">
              <Label>
                <span className="text-white/80">على الأسطح الداكنة: light و accent</span>
              </Label>
              <div className="flex flex-wrap gap-3.5">
                <Button variant="light" size="lg">
                  <span className="num-tile grade-6 size-9 rounded-xl text-lg">{ar(6)}</span>
                  الصف السادس
                </Button>
                <Button variant="accent" size="lg">
                  تواصل معنا
                  <ArrowLeft aria-hidden />
                </Button>
              </div>
            </div>
          </div>
        </Section>

        {/* ═════ الكبسولات ═════ */}
        <section className="bg-white">
          <Section
            id="badges"
            icon={<BadgePercent aria-hidden />}
            eyebrow="الكبسولات"
            tone="eyebrow-coral"
            title="كبسولات وتسميات ملونة"
            sub="‏<Badge tone=…> للحالات والأنواع، ‏<Badge subject=…> لألوان المواد، وأصناف ‎.chip و ‎.eyebrow-pill للأغلفة ورؤوس الأقسام."
          >
            <Label>Badge tone</Label>
            <div className="flex flex-wrap gap-2.5">
              {(["brand", "accent", "neutral", "success", "danger", "warning", "info", "solid", "gold", "coral", "violet", "sky", "white"] as const).map((t) => (
                <Badge key={t} tone={t}>
                  {t}
                </Badge>
              ))}
              <span className="rounded-full bg-ink p-1">
                <Badge tone="glass">glass</Badge>
              </span>
            </div>
            <Label>
              <span className="mt-7 block">Badge subject + أحجام sm/md/lg</span>
            </Label>
            <div className="flex flex-wrap items-center gap-2.5">
              {SUBJECT_ORDER.map((s) => (
                <Badge key={s} subject={s}>
                  <SubjectIcon slug={s} />
                  {SUBJECT_NAMES[s]}
                </Badge>
              ))}
              <Badge size="sm" tone="success">
                <CircleCheck aria-hidden />
                مدفوع
              </Badge>
              <Badge size="lg" tone="gold">
                <Sparkles aria-hidden />
                معاينة مجانية
              </Badge>
            </div>
            <Label>
              <span className="mt-7 block">‎.chip‎ (‎chip-glass · chip-gold · chip-white · chip-mint · chip-coral‎ أو بلون المادة)</span>
            </Label>
            <div className="tone-english poster flex flex-wrap items-center gap-2.5 p-5">
              <span className="chip chip-glass">دورة كاملة</span>
              <span className="chip chip-gold">
                <Sparkles aria-hidden />
                معاينة مجانية
              </span>
              <span className="chip chip-white">
                <PlayCircle aria-hidden />
                {count(7, W.lesson)}
              </span>
              <span className="chip chip-mint">مكتملة</span>
              <span className="chip chip-coral">خصم {ar(20)}٪</span>
              <span className="chip">بلون المادة</span>
            </div>
            <Label>
              <span className="mt-7 block">‎.eyebrow-pill‎ + ‎.eyebrow-icon‎ (teal افتراضي · gold · coral · violet · light)</span>
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              <span className="eyebrow-pill">
                <span className="eyebrow-icon">
                  <MonitorPlay aria-hidden />
                </span>
                شروحات بالفيديو
              </span>
              <span className="eyebrow-pill eyebrow-gold">
                <span className="eyebrow-icon">
                  <BadgePercent aria-hidden />
                </span>
                وفّر أكثر
              </span>
              <span className="eyebrow-pill eyebrow-coral">
                <span className="eyebrow-icon">
                  <Users aria-hidden />
                </span>
                معلمو درب
              </span>
              <span className="eyebrow-pill eyebrow-violet">
                <span className="eyebrow-icon">
                  <FileText aria-hidden />
                </span>
                مذكرات مرتبة
              </span>
              <span className="bg-teal-night rounded-full p-1.5">
                <span className="eyebrow-pill eyebrow-light">
                  <span className="eyebrow-icon">
                    <Sun aria-hidden />
                  </span>
                  موسم الاختبارات
                </span>
              </span>
              <span className="glass-pill">
                <span className="grid size-7 place-items-center rounded-full bg-linear-to-br from-[#ffd25e] to-[#ff9f43] text-[#6b3600]">
                  <Sun className="size-3.5" aria-hidden />
                </span>
                ‎.glass-pill‎ للبطل
              </span>
            </div>
          </Section>
        </section>

        {/* ═════ الأسعار ═════ */}
        <Section id="prices" icon={<BadgePercent aria-hidden />} eyebrow="الأسعار" tone="eyebrow-gold" title="السعر بوضوح، والخصم الحقيقي فقط">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <Label>بدون خصم (md)</Label>
              <Price fils={7000} />
            </Card>
            <Card className="p-5">
              <Label>بخصم حقيقي (lg)</Label>
              <Price fils={6000} compareAt={7500} size="lg" />
            </Card>
            <Card className="p-5">
              <Label>مجانًا (sm) · خصم بلا نسبة</Label>
              <Price fils={0} size="sm" />
              <Price fils={2500} compareAt={3000} size="sm" showPercent={false} className="mt-2" />
            </Card>
            <div className="bg-teal-night on-dark rounded-2xl p-5 shadow-card">
              <Label>
                <span className="text-white/80">tone=&quot;light&quot; (xl)</span>
              </Label>
              <Price fils={12000} compareAt={15000} size="xl" tone="light" />
            </div>
          </div>
        </Section>

        {/* ═════ التنبيهات ═════ */}
        <section className="bg-white">
          <Section id="alerts" icon={<Sparkles aria-hidden />} eyebrow="التنبيهات" title="رسائل واضحة ودودة">
            <div className="grid gap-4 md:grid-cols-2">
              <Alert tone="info" title="معلومة">
                سجّل دخولك أو أنشئ حسابًا لإتمام الشراء. سلتك محفوظة.
              </Alert>
              <Alert tone="success" title="تم الدفع بنجاح">
                أضفنا المحتوى إلى <Link href="/library">مكتبتك</Link>.
              </Alert>
              <Alert tone="warning">هذه المذكرة للقراءة داخل المنصة فقط.</Alert>
              <Alert tone="danger" title="تعذّر الدفع">
                لم يتم خصم أي مبلغ. يمكنك إعادة المحاولة.
              </Alert>
            </div>
          </Section>
        </section>

        {/* ═════ النماذج ═════ */}
        <Section id="forms" icon={<Brush aria-hidden />} eyebrow="النماذج" tone="eyebrow-violet" title="حقول مريحة باللمس">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <form className="panel grid gap-5 p-6 sm:p-8">
              <Field label="البريد الإلكتروني" htmlFor="sys-email" hint="نرسل إليه تأكيد الطلب" required>
                <Input id="sys-email" type="email" dir="ltr" placeholder="name@example.com" />
              </Field>
              <Field label="كلمة المرور" htmlFor="sys-pass" error="كلمة المرور قصيرة جدًا">
                <Input id="sys-pass" type="password" aria-invalid aria-describedby="sys-pass-error" />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="الصف" htmlFor="sys-grade">
                  <Select id="sys-grade" defaultValue="9">
                    {[6, 7, 8, 9].map((g) => (
                      <option key={g} value={g}>
                        {GRADE_NAMES[g]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="معطّل" htmlFor="sys-dis">
                  <Input id="sys-dis" disabled defaultValue="لا يمكن التعديل" />
                </Field>
              </div>
              <Field label="رسالتك" htmlFor="sys-msg">
                <Textarea id="sys-msg" placeholder="اكتب سؤالك هنا" />
              </Field>
              <Checkbox label="أوافق على الشروط والأحكام" defaultChecked />
              <Button size="lg" type="button">
                إرسال
              </Button>
            </form>
            <div className="grid content-start gap-5">
              <Card>
                <CardHeader>
                  <CardTitle>Card + Header/Content/Footer</CardTitle>
                  <CardDescription>بطاقة بيضاء بزوايا ٢٤ وظل دافئ</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-ink-soft">المحتوى داخل البطاقة بخط Tajawal.</p>
                </CardContent>
                <CardFooter>
                  <Button size="sm">حفظ</Button>
                  <Button size="sm" variant="ghost">
                    إلغاء
                  </Button>
                </CardFooter>
              </Card>
              <Card variant="lift" className="p-5">
                <p className="font-display font-extrabold">variant=&quot;lift&quot;</p>
                <p className="text-sm text-muted">ترتفع عند المرور</p>
              </Card>
              <Card variant="tinted" className="p-5">
                <p className="font-display font-extrabold">variant=&quot;tinted&quot;</p>
              </Card>
              <Card variant="flat" className="p-5">
                <p className="font-display font-extrabold">variant=&quot;flat&quot;</p>
              </Card>
            </div>
          </div>
        </Section>

        {/* ═════ الجداول ═════ */}
        <section className="bg-white">
          <Section id="tables" icon={<LayoutGrid aria-hidden />} eyebrow="الجداول" title="جداول نظيفة بزوايا ناعمة">
            <Table>
              <THead>
                <tr>
                  <TH>الطلب</TH>
                  <TH>المنتج</TH>
                  <TH>الحالة</TH>
                  <TH>المبلغ</TH>
                </tr>
              </THead>
              <tbody>
                {[
                  { id: "A-1042", p: "المذكرة النهائية لمادة العلوم", s: <Badge tone="success">مدفوع</Badge>, f: 3000 },
                  { id: "A-1041", p: "الدورة الكاملة في الرياضيات", s: <Badge tone="warning">بانتظار الدفع</Badge>, f: 7000 },
                  { id: "A-1040", p: "مراجعة ليلة الاختبار", s: <Badge tone="danger">فشل الدفع</Badge>, f: 2500 },
                ].map((r) => (
                  <TR key={r.id}>
                    <TD className="num text-start font-display font-bold">{r.id}</TD>
                    <TD>{r.p}</TD>
                    <TD>{r.s}</TD>
                    <TD>
                      <Price fils={r.f} size="sm" />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <p className="mt-3 text-sm text-muted">بيانات توضيحية للمعاينة فقط.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          </Section>
        </section>

        {/* ═════ البطاقات والأسطح ═════ */}
        <Section
          id="cards"
          icon={<LayoutGrid aria-hidden />}
          eyebrow="الأسطح"
          tone="eyebrow-coral"
          title="ألواح وبطاقات وأغلفة"
          sub="‏.panel (لوح ٣٢) · .panel-rainbow · .card-soft (بطاقة ٢٤) · .lift · .tile-3d (بلون الصف/المادة) · .poster (غلاف متدرج) · .icon-tile · .num-tile · .play-dot · .edge-3d · .stretched"
        >
          <div className="panel panel-rainbow p-6 pt-10 sm:p-10">
            <p className="font-display text-xl font-black">‎.panel.panel-rainbow‎</p>
            <p className="mt-1 text-ink-soft">اللوح الأبيض الكبير الذي «يرسو» فوق البطل، بشريط قوس قزح المواد.</p>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(["math", "science", "arabic"] as const).map((slug) => (
                <li key={slug}>
                  <article className={cn(toneClass(slug), "card-soft lift flex h-full flex-col p-2")}>
                    <div className="poster aspect-[16/11]">
                      <span className="chip chip-glass absolute start-3 top-3">دورة كاملة</span>
                      <span className="chip chip-gold absolute start-3 bottom-3">
                        <Sparkles aria-hidden />
                        معاينة مجانية
                      </span>
                      <div className="absolute end-[3%] top-1/2 aspect-square w-[42%] -translate-y-1/2 -rotate-6">
                        <SubjectArt slug={slug} />
                      </div>
                      <span className="play-dot absolute start-1/2 top-1/2 -ms-[1.8rem] -mt-[1.8rem]" aria-hidden>
                        <Play className="size-5.5 -ms-0.5" fill="currentColor" />
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-1 px-3 pt-4 pb-2">
                      <p className="flex items-center gap-1.5 font-display text-[0.85rem] font-extrabold text-[var(--tink)]">
                        <span className="size-2 rounded-full bg-[var(--b)]" aria-hidden />
                        {SUBJECT_NAMES[slug]} · الصف التاسع
                      </p>
                      <h3 className="text-[1.1rem]">
                        <Link href="#cards" className="stretched">
                          مثال لبطاقة درس مرئي
                        </Link>
                      </h3>
                      <p className="flex gap-3 text-sm text-muted">
                        <span>{count(12, W.lesson)}</span>
                        <span>{duration(5400)}</span>
                      </p>
                      <div className="mt-auto flex items-center justify-between border-t border-dashed border-line pt-3">
                        <Price fils={7000} compareAt={8500} />
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-5">
            {SUBJECT_ORDER.map((s) => (
              <span key={s} className={cn(toneClass(s), "icon-tile")}>
                <SubjectIcon slug={s} />
              </span>
            ))}
            {[6, 7, 8, 9].map((lv) => (
              <span key={lv} className={cn(gradeClass(lv), "num-tile")}>
                {ar(lv)}
              </span>
            ))}
            <a href="#cards" className="edge-3d inline-flex min-h-12 items-center rounded-2xl bg-white px-5 font-display font-extrabold [--edge:#e0d2ba]">
              ‎.edge-3d‎ بحافة ‎--edge‎
            </a>
          </div>
        </Section>

        {/* ═════ رؤوس الصفحات والأقسام ═════ */}
        <section id="patterns" aria-label="رؤوس الصفحات والأقسام" className="scroll-mt-28 py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHead
              icon={<LayoutGrid aria-hidden />}
              eyebrow="أنماط جاهزة"
              tone="coral"
              title={
                <>
                  ‏SectionHead و <span className="text-hl">PageHeader</span>
                </>
              }
              sub="من ‎@/components/ui/section-head‎ و ‎@/components/ui/page-header‎: رأس القسم برابط «المزيد»، ورأس الصفحة الداخلية بمسار التنقل والأرقام."
              more={{ href: "/teachers", label: "كل المعلمين" }}
            />
          </div>
          <div className="mx-4 overflow-hidden rounded-[2.25rem] shadow-card sm:mx-6 xl:mx-auto xl:max-w-7xl">
            <PageHeader
              title="الصف التاسع"
              sub="شروحات الفيديو والمراجعات والمذكرات مرتبة حسب المادة."
              breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "المرحلة المتوسطة" }, { label: "الصف التاسع" }]}
              eyebrow={{ icon: <GraduationCap aria-hidden />, label: "المرحلة المتوسطة" }}
              actions={
                <>
                  <Button size="lg">
                    ابدأ بالمادة
                    <ArrowLeft aria-hidden />
                  </Button>
                  <Button size="lg" variant="outline">
                    الباقات
                  </Button>
                </>
              }
              aside={
                <div className="grade-9 tile-3d mx-auto w-80 overflow-hidden">
                  <span className="poster poster-grade relative block h-56 rounded-none">
                    <span className="absolute start-6 -top-2 font-display text-[9rem] leading-[1.2] font-black text-white [text-shadow:0_6px_0_color-mix(in_oklab,var(--d)_45%,transparent)]">
                      {ar(9)}
                    </span>
                    <span className="absolute end-3 bottom-2 size-36">
                      <GradeArt level={9} />
                    </span>
                  </span>
                </div>
              }
            >
              <div className="flex flex-wrap gap-3">
                <StatPill icon={<MonitorPlay aria-hidden />} {...countParts(24, W.videoLesson)} />
                <StatPill icon={<Users aria-hidden />} tone="coral" {...countParts(4, W.teacher)} />
                <StatPill icon={<FileText aria-hidden />} tone="gold" {...countParts(6, W.subject)} />
              </div>
            </PageHeader>
          </div>
          <p className="mx-auto mt-3 max-w-7xl px-4 text-sm text-muted sm:px-6">أرقام توضيحية للمعاينة فقط؛ في الصفحات الحقيقية تأتي من قاعدة البيانات.</p>
        </section>

        {/* ═════ الحالات الفارغة ═════ */}
        <section className="bg-white">
          <Section id="empty" icon={<Heart aria-hidden />} eyebrow="الحالات الفارغة" tone="eyebrow-violet" title="فارغ، لكن ودود">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <EmptyState
                art="cart"
                title="سلتك فارغة"
                description="تصفح الصفوف واختر الشروحات والمذكرات التي تحتاجها."
                action={
                  <Button asChild>
                    <Link href="/#grades">تصفح الصفوف</Link>
                  </Button>
                }
              />
              <EmptyState
                art="library"
                title="مكتبتك فارغة حاليًا"
                description="ما تشتريه يظهر هنا فور تأكيد الدفع."
                action={
                  <Button asChild variant="outline">
                    <Link href="/teachers">تعرّف على المعلمين</Link>
                  </Button>
                }
              />
              <EmptyState icon={<GraduationCap aria-hidden />} title="لا توجد منتجات بعد" description="نضيف محتوى هذا الصف قريبًا." compact />
              <EmptyState art="search" title="لا نتائج" compact />
              <EmptyState art="video" title="لا دروس مرئية" compact />
              <EmptyState art="lock" title="المحتوى مقفل" description="اشترِ المنتج لفتح هذا الدرس." compact />
            </div>
          </Section>
        </section>

        {/* ═════ الرسومات ═════ */}
        <Section
          id="art"
          icon={<Brush aria-hidden />}
          eyebrow="الرسومات"
          tone="eyebrow-gold"
          title="رسومات SVG مرسومة يدويًا"
          sub="‏من ‎@/components/art‎: LogoMark · SubjectArt · GradeArt · StepArt · SpotArt · Sparkle · Swash · NightSky · Sunrise · BundleStack · SubjectIcon"
        >
          <div className="flex flex-wrap items-end gap-6">
            <LogoMark size={88} />
            <LogoMark size={56} />
            <LogoMark size={40} />
            <LogoMark size={28} />
            <span className="relative inline-block font-display text-4xl font-black">
              <span className="text-hl relative z-10">واثق</span>
              <Swash className="absolute inset-x-[-8%] bottom-0 z-0 h-[0.34em] w-[116%]" />
            </span>
            <Sparkle className="size-10" />
            <Sparkle className="size-7" color="#FF8A65" />
            <Sparkle className="size-5" color="#17A398" />
          </div>
          <ul className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[1, 2, 3, 4].map((n, i) => (
              <li key={n} className="card-soft flex flex-col items-center p-5 text-center">
                <span
                  className={cn(
                    "relative grid size-28 place-items-center rounded-[1.75rem] p-3 shadow-card",
                    ["tone-science", "tone-english", "tone-math", "tone-social"][i],
                  )}
                  style={{ background: "linear-gradient(145deg, var(--a), var(--b))", color: "var(--d)" }}
                >
                  <StepArt n={n} />
                  <span className="absolute -end-2 -top-2 grid size-9 place-items-center rounded-full bg-accent font-display font-black text-accent-900 shadow-card">
                    {ar(n)}
                  </span>
                </span>
                <p className="mt-4 font-display font-extrabold">StepArt n={ar(n)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            <div className="relative h-56 overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#1b1f5c,#4b2a86_60%,#c8547a)] shadow-card">
              <NightSky className="absolute inset-0 size-full" />
              <p className="absolute start-5 bottom-4 font-display font-extrabold text-white">NightSky</p>
            </div>
            <div className="relative h-56 overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#ffb36b,#ff7a59)] shadow-card">
              <Sunrise className="absolute inset-x-0 bottom-0 w-full" />
              <p className="absolute start-5 top-4 font-display font-extrabold text-white">Sunrise</p>
            </div>
            <div className="grade-9 poster poster-grade relative h-56 rounded-3xl">
              <div className="absolute inset-x-[15%] inset-y-[8%]">
                <BundleStack colors={["#3B3FD8", "#0B8A66", "#C42F86", "#E2463A", "#E2780E"]} />
              </div>
              <p className="absolute start-5 bottom-4 font-display font-extrabold text-white">BundleStack</p>
            </div>
          </div>
          <ul className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {(["generic", "cart", "library", "search", "video", "lock", "receipt"] as const).map((k) => (
              <li key={k} className="card-soft p-3 text-center text-brand-600">
                <div className="mx-auto h-24 w-28">
                  <SpotArt kind={k} />
                </div>
                <p className="mt-1 font-display text-sm font-extrabold text-ink">{k}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* ═════ العدّ ═════ */}
        <section className="bg-white">
          <Section id="helpers" icon={<Sparkles aria-hidden />} eyebrow="العربية الصحيحة" title="العدد والمعدود والمدد" sub="‏من ‎@/lib/design‎: count · countParts · W · duration · savings · ar">
            <div className="grid gap-5 md:grid-cols-3">
              <Card className="p-5">
                <Label>count(n, W.lesson)</Label>
                <ul className="grid gap-1.5 font-display font-bold">
                  {[1, 2, 3, 10, 11, 24, 100].map((n) => (
                    <li key={n}>{count(n, W.lesson)}</li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <Label>duration(sec)</Label>
                <ul className="grid gap-1.5 font-display font-bold">
                  {[25, 60, 120, 420, 1500, 3600, 7500].map((s) => (
                    <li key={s}>{duration(s)}</li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <Label>countParts + savings</Label>
                {(() => {
                  const p = countParts(24, W.videoLesson);
                  const sv = savings(6000, 7500);
                  return (
                    <div className="grid gap-3">
                      <p className="font-display">
                        <b className="text-3xl font-black">{p.num}</b> <span className="font-bold text-ink-soft">{p.label}</span>
                      </p>
                      <p className="font-display font-bold">
                        وفّر <span className="num">{((sv?.fils ?? 0) / 1000).toFixed(3)}</span> د.ك (خصم {ar(sv?.pct ?? 0)}٪)
                      </p>
                      <p className="text-sm text-muted">savings(7000, 7000) = {String(savings(7000, 7000))}</p>
                    </div>
                  );
                })()}
              </Card>
            </div>
          </Section>
        </section>

        {/* ═════ بطاقات الكتالوج (src/components/site) ═════ */}
        <section className="bg-white">
          <CatalogShowcase />
        </section>

        {/* ═════ دعوة ═════ */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="bg-teal-night on-dark relative isolate overflow-hidden rounded-[2.5rem] p-8 shadow-pop sm:p-14">
            <span className="absolute -end-16 -top-24 -z-10 size-64 rounded-full bg-[radial-gradient(circle_at_40%_40%,#fff0bf,#ffc531_60%)] shadow-[0_0_0_36px_rgb(255_197_49/0.16),0_0_0_76px_rgb(255_197_49/0.08)]" aria-hidden />
            <span className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.12)_1.3px,transparent_1.6px)] bg-[length:22px_22px]" aria-hidden />
            <h2 className="h-section text-white">
              جاهز تبدأ؟ <span className="text-gold">اختر صفك الآن</span>
            </h2>
            <p className="mt-3 max-w-xl text-lg text-white/90">‏.bg-teal-night + .on-dark: سطح الدعوات واللوحات الليلية، وحلقة التركيز ذهبية فوقه.</p>
            <ul className="mt-8 grid max-w-2xl grid-cols-2 gap-3.5">
              {[6, 7, 8, 9].map((lv) => (
                <li key={lv} className={gradeClass(lv)}>
                  <Link href={`/grades/grade-${lv}`} className="btn btn-3d btn-light btn-xl w-full justify-start rounded-[1.4rem] ps-3">
                    <span className="num-tile size-11 rounded-[0.9rem] text-[1.4rem]">{ar(lv)}</span>
                    {GRADE_NAMES[lv]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
