import Link from "next/link";
import type * as React from "react";
import { ArrowLeft, CalendarClock, Copyright, FileLock2, FileText, ListOrdered, MessagesSquare, RotateCcw, ScrollText, type LucideIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Sparkle } from "@/components/art";
import { ar, count, SUBJECT_ORDER, subjectVars } from "@/lib/design";
import { cn } from "@/lib/utils";

/**
 * قالب الصفحات القانونية (الشروط، الخصوصية، الاسترجاع، بلاغات الحقوق) بأسلوب «الفصل المشمس»:
 * شريط عنوان ملون بلون الصفحة + رسم، فهرس ملون مثبت على الحاسوب، أقسام مرقمة في لوح أبيض،
 * ودعوة «تواصل معنا» وروابط الصفحات الأخرى في الأسفل. كل نصوصها مسودات، فتحمل تنبيهًا ظاهرًا حتى يعتمدها محامٍ.
 */
export type LegalSection = { id: string; title: string; Icon: LucideIcon; body: React.ReactNode };
export type LegalKey = "terms" | "privacy" | "refund" | "copyright";

const PAGES: Record<LegalKey, { href: string; title: string; blurb: string; Icon: LucideIcon; tone: string }> = {
  terms: { href: "/terms", title: "الشروط والأحكام", blurb: "الحساب والمحتوى والدفع", Icon: ScrollText, tone: "math" },
  privacy: { href: "/privacy", title: "سياسة الخصوصية", blurb: "ما نجمعه وكيف نحميه", Icon: FileLock2, tone: "english" },
  refund: { href: "/refund-policy", title: "سياسة الاسترجاع", blurb: "متى وكيف يُسترجع المبلغ", Icon: RotateCcw, tone: "arabic" },
  copyright: { href: "/copyright", title: "بلاغات حقوق المحتوى", blurb: "إن نُشر عملك دون إذنك", Icon: Copyright, tone: "science" },
};

/** ألوان شريط العنوان: فيروزي للشروط، بنفسجي للخصوصية، شمسي ذهبي للاسترجاع (النص داكن عليه) */
const BAND: Record<LegalKey, { cls: string; dark: boolean }> = {
  terms: { cls: "bg-teal-night", dark: true },
  privacy: { cls: "bg-[radial-gradient(60%_90%_at_0%_0%,rgb(255_133_184/0.55),transparent_60%),linear-gradient(90deg,#9a6bff,#6a3fe0_50%,#4b2fb0)] text-white", dark: true },
  refund: { cls: "bg-[radial-gradient(55%_90%_at_0%_100%,rgb(255_107_90/0.45),transparent_60%),linear-gradient(90deg,#ff9f43,#ffc531_55%,#ffd25e)] text-[#3d2a00]", dark: false },
  copyright: { cls: "bg-[radial-gradient(55%_90%_at_0%_0%,rgb(52_217_160/0.4),transparent_60%),linear-gradient(90deg,#0b8a66,#076b4f_55%,#064f3b)] text-white", dark: true },
};

const SECTION_WORD = { one: "قسم", two: "قسمان", plural: "أقسام", acc: "قسمًا" };

/**
 * أرقام الفهرس: الرقم الأبيض يجلس على الطرفين الداكنين للنغمة (‎--b → --d‎) فيبلغ تباين AA،
 * والنغمة الذهبية (الاجتماعيات) فاتحة حتى في طرفها الداكن فتأخذ حبرًا بنيًا داكنًا كبقية العناصر الذهبية.
 */
const LIGHT_TONES = new Set<string>(["social"]);
const TILE_DARK = "from-[color-mix(in_oklab,var(--b)_65%,var(--d))] to-[var(--d)] text-white";
const TILE_LIGHT = "from-[var(--a)] to-[var(--b)] text-[#3d2a00]";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
/** «2026-11-03» ← «٣ نوفمبر ٢٠٢٦» */
function legalDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${ar(d)} ${MONTHS[m - 1]} ${ar(y)}`;
}

export function LegalDoc({
  page,
  sub,
  intro,
  sections,
  updated,
  version,
  seller = [],
}: {
  page: LegalKey;
  sub: string;
  intro: React.ReactNode;
  sections: LegalSection[];
  /** تاريخ آخر تعديل على نص الصفحة (YYYY-MM-DD) */
  updated: string;
  /** رقم النسخة التي تُسجل عند الموافقة على هذه الصفحة، إن كانت لها موافقة */
  version?: string;
  /** ما أدخله المالك من هوية البائع. لا يُعرض شيء إن كان فارغًا */
  seller?: { key: string; label: string; value: string }[];
}) {
  const meta = PAGES[page];
  const band = BAND[page];
  const others = (Object.keys(PAGES) as LegalKey[]).filter((k) => k !== page);
  const toneSlug = (i: number) => SUBJECT_ORDER[(i + 2) % SUBJECT_ORDER.length];
  const toneOf = (i: number) => subjectVars(toneSlug(i));

  return (
    <div className="bg-sunny pb-20">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
        <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: meta.title }]} />

        {/* شريط العنوان الملون */}
        <header className={cn("relative isolate mt-5 overflow-hidden rounded-[2rem] px-5 py-8 shadow-pop sm:rounded-[2.5rem] sm:px-10 sm:py-12", band.cls, band.dark && "on-dark")}>
          <span className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.16)_1.3px,transparent_1.6px)] bg-[length:22px_22px]" aria-hidden />
          <span className="absolute -bottom-24 -left-20 -z-10 size-72 rounded-full border-[34px] border-white/12" aria-hidden />
          <Sparkle className="animate-twinkle absolute top-6 left-[38%] size-5" color={band.dark ? "#FFE29A" : "#ffffff"} />
          <Sparkle className="animate-twinkle absolute bottom-8 left-[12%] size-3.5 [animation-delay:1.2s]" color="#ffffff" />
          <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full py-1 ps-1 pe-3.5 font-display text-[0.88rem] font-extrabold",
                  band.dark ? "bg-white/14 text-white" : "bg-white/55 text-[#5a3d00]",
                )}
              >
                <span className={cn("grid size-7 place-items-center rounded-full", band.dark ? "bg-[#ffc531] text-[#3d2a00]" : "bg-white text-[#a9401f]")}>
                  <FileText className="size-3.5" aria-hidden />
                </span>
                صفحات المنصة
              </span>
              <h1 className="mt-3 font-display text-[clamp(2.1rem,6vw,3.6rem)] leading-[1.2] font-black">{meta.title}</h1>
              <p className={cn("mt-3 max-w-2xl text-[1.05rem] leading-8 sm:text-[1.12rem]", band.dark ? "text-white/88" : "text-[#4a3300]")}>{sub}</p>
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="عن هذه الصفحة">
                <li className={cn("chip min-h-8 px-3", band.dark ? "chip-glass" : "bg-white/70 text-[#5a3d00]")}>
                  <ListOrdered aria-hidden />
                  {count(sections.length, SECTION_WORD)}
                </li>
                <li className={cn("chip min-h-8 px-3", band.dark ? "chip-glass" : "bg-white/70 text-[#5a3d00]")}>
                  <meta.Icon aria-hidden />
                  {meta.blurb}
                </li>
                <li className={cn("chip min-h-8 px-3", band.dark ? "chip-glass" : "bg-white/70 text-[#5a3d00]")}>
                  <CalendarClock aria-hidden />
                  آخر تحديث: <time dateTime={updated}>{legalDate(updated)}</time>
                </li>
                {version ? (
                  <li className={cn("chip min-h-8 px-3", band.dark ? "chip-glass" : "bg-white/70 text-[#5a3d00]")} data-testid="legal-version">
                    <FileText aria-hidden />
                    رقم النسخة: <bdi dir="ltr">{version}</bdi>
                  </li>
                ) : null}
              </ul>
            </div>
            <DocArt Icon={meta.Icon} tone={meta.tone} />
          </div>
        </header>

        <div className="mt-6 grid gap-3">
          <Alert tone="warning" title="مسودة بانتظار مراجعة محامٍ" data-testid="legal-draft-notice">
            لم يُعتمد هذا النص قانونيًا بعد، وقد تتغير صياغته.
          </Alert>
          {seller.length ? (
            <dl className="card-soft flex flex-wrap gap-x-8 gap-y-2 p-4 text-[0.95rem] sm:p-5" data-testid="legal-seller">
              {seller.map((x) => (
                <div key={x.key} className="min-w-0">
                  <dt className="font-display text-[0.85rem] font-extrabold text-ink-soft">{x.label}</dt>
                  <dd className="break-words text-ink">{x.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="mt-8 grid gap-6 lg:mt-10 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:gap-10">
          {/* الفهرس */}
          <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <nav aria-label="محتويات الصفحة" className="card-soft p-4 sm:p-5">
              <p className="mb-3 flex items-center gap-2 font-display text-[1rem] font-black text-ink">
                <ListOrdered className="size-5 text-brand-600" aria-hidden />
                في هذه الصفحة
              </p>
              <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                {sections.map((s, i) => (
                  <li key={s.id} style={toneOf(i)}>
                    <a href={`#${s.id}`} className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 font-display text-[0.95rem] font-bold text-ink-soft transition-colors hover:bg-[var(--soft)] hover:text-[var(--tink)]">
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-[0.65rem] bg-linear-to-br text-[0.95rem] font-black shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]",
                          LIGHT_TONES.has(toneSlug(i)) ? TILE_LIGHT : TILE_DARK,
                        )}
                      >
                        {ar(i + 1)}
                      </span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          {/* النص */}
          <article className="min-w-0">
            <div className="panel panel-rainbow px-5 pt-10 pb-8 sm:px-10 sm:pt-12 sm:pb-10">
              <div className="rounded-2xl border border-accent-200 bg-[#fff8e6] px-4 py-3.5 text-[1.02rem] leading-8 text-ink-soft sm:px-5">{intro}</div>
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-28 border-t border-dashed border-line-strong pt-8 mt-8 first-of-type:border-t-0" style={toneOf(i)}>
                  <div className="flex items-center gap-3.5">
                    <span className="icon-tile size-12 [&_svg]:size-6">
                      <s.Icon aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <span className="block font-display text-[0.8rem] font-extrabold text-[var(--tink)]">القسم {ar(i + 1)}</span>
                      <h2 id={`${s.id}-h`} className="font-display text-[1.35rem] leading-snug font-black text-ink sm:text-[1.5rem]">
                        {s.title}
                      </h2>
                    </div>
                  </div>
                  <div className="prose-sunny mt-4 text-[1.02rem] sm:ps-[3.875rem]">{s.body}</div>
                </section>
              ))}
            </div>

            {/* دعوة تواصل + الصفحات الأخرى */}
            <div className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="bg-teal-night on-dark relative isolate overflow-hidden rounded-[1.75rem] p-6 shadow-pop sm:p-7">
                <span className="absolute -bottom-12 -left-12 -z-10 size-32 rounded-full bg-[radial-gradient(circle_at_40%_40%,#fff0bf,#ffc531_60%)] shadow-[0_0_0_18px_rgb(255_197_49/0.14),0_0_0_40px_rgb(255_197_49/0.07)]" aria-hidden />
                <Sparkle className="absolute top-6 left-8 size-4" color="#FFE29A" />
                <h2 className="font-display text-[1.35rem] font-black text-white">عندك سؤال عن هذه الصفحة؟</h2>
                <p className="mt-1.5 max-w-md text-[0.98rem] leading-7 text-white/85">راسلنا وسنوضح لك أي نقطة قبل الشراء أو بعده.</p>
                <Link href="/contact" className="btn btn-3d btn-accent btn-md mt-5">
                  <MessagesSquare aria-hidden />
                  تواصل معنا
                </Link>
              </div>
              <ul className="grid gap-3">
                {others.map((k) => {
                  const o = PAGES[k];
                  return (
                    <li key={k}>
                      <Link href={o.href} className="tile-3d group flex items-center gap-3.5 p-4" style={subjectVars(o.tone)}>
                        <span className="icon-tile [&_svg]:size-5.5">
                          <o.Icon aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[1.05rem] font-black text-ink">{o.title}</span>
                          <span className="block text-[0.9rem] text-ink-soft">{o.blurb}</span>
                        </span>
                        <ArrowLeft className="size-5 text-[var(--tink)] transition-transform group-hover:-translate-x-1" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

/** رسم الوثيقة: ورقة بيضاء مائلة بلون الصفحة وأيقونتها، وخلفها ورقتان ملونتان */
function DocArt({ Icon, tone }: { Icon: LucideIcon; tone: string }) {
  return (
    <div className="relative mx-auto hidden h-52 w-56 md:block" aria-hidden style={subjectVars(tone)}>
      <span className="absolute top-6 left-4 h-40 w-32 -rotate-[12deg] rounded-2xl bg-[#ffd25e] shadow-[0_20px_40px_-20px_rgb(0_0_0/0.5)]" />
      <span className="absolute top-4 right-3 h-40 w-32 rotate-[10deg] rounded-2xl bg-[#ff8a75] shadow-[0_20px_40px_-20px_rgb(0_0_0/0.5)]" />
      <div className="absolute inset-x-0 top-0 mx-auto h-48 w-36 -rotate-[2deg] overflow-hidden rounded-2xl bg-white p-3 shadow-[0_30px_50px_-24px_rgb(0_0_0/0.6)]">
        <div className="poster grid h-16 place-items-center rounded-xl text-white">
          <Icon className="size-8" />
        </div>
        <div className="mt-3 space-y-2">
          <span className="block h-2 w-[85%] rounded-full bg-[var(--soft)]" />
          <span className="block h-2 w-full rounded-full bg-[#efe6d6]" />
          <span className="block h-2 w-[70%] rounded-full bg-[#efe6d6]" />
          <span className="block h-2 w-[90%] rounded-full bg-[#efe6d6]" />
          <span className="block h-2 w-[55%] rounded-full bg-[var(--a)] opacity-60" />
        </div>
      </div>
      <span className="absolute -bottom-1 left-6 grid size-14 place-items-center rounded-full bg-linear-to-br from-[#ffd25e] to-[#eb9b00] text-[#3d2a00] shadow-[0_8px_0_#b77800,0_16px_24px_-10px_rgb(0_0_0/0.45)]">
        <ShieldTick />
      </span>
    </div>
  );
}

function ShieldTick() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6Z" />
      <path d="m8.8 12.2 2.3 2.3 4.2-4.6" />
    </svg>
  );
}
