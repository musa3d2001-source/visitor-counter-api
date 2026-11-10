/**
 * أجزاء «مكتبتي» بأسلوب «الفصل المشمس»: بطاقة فيديو بملصق المادة، صف مذكرة ملون، ولوح «تابع من حيث توقفت».
 * عرض فقط؛ الروابط ومعرّفات الاختبار (data-testid) كما هي.
 */
import Link from "next/link";
import type * as React from "react";
import { ArrowLeft, BookOpen, CalendarClock, Download, FileText, Moon, Play, RotateCcw, Sun } from "lucide-react";
import type { LibraryItem } from "@/server/access/entitlements";
import { coverUrl } from "@/server/catalog/queries";
import { Button } from "@/components/ui/button";
import { ProductCover } from "@/components/site/product-cover";
import { NightSky, SubjectIcon, Sunrise } from "@/components/art";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { PRODUCT_TYPE_LABELS, termLabel, type ProductType } from "@/lib/labels";
import { ar, count, toneClass, W } from "@/lib/design";
import { cn, formatDate } from "@/lib/utils";
import { ProgressBar } from "../../cart/_components/commerce";

export type ResumeEntry = {
  key: string;
  href: string;
  kind: "video" | "file";
  title: string;
  context: string;
  pct: number;
  status: string;
  /** درس أكمله الطالب (يظهر بارزًا فقط إن لم يبقَ درس قيد المشاهدة) */
  completed?: boolean;
  item: LibraryItem | null;
};

function itemSlug(item: LibraryItem | null) {
  return subjectSlugFromName(item?.subjectName);
}

/** play: موضع زر التشغيل (مركزه على النقطة المحددة) */
type PosterVariant = { cls?: string; style?: React.CSSProperties; icon: React.ReactNode; art: React.ReactNode; play: string };

/**
 * ملصق الفيديو في المكتبة يتنوع بنوع المحتوى داخل لون المادة (مثل صفوف v2-c):
 * مراجعة ليلة الاختبار ← سماء ليلية بنفسجية وهلال، مراجعة الاختبار القصير ← شروق مرجاني،
 * الدرس المنفرد ← زر تشغيل كبير بحلقات. الوحدات والدورات ← ملصق المادة المعتاد.
 */
function posterVariant(type: ProductType, slug: string | null): PosterVariant | null {
  if (type === "exam_review")
    return {
      style: {
        background: "radial-gradient(60% 90% at 0% 100%, rgb(255 210 94 / 0.6), transparent 70%), linear-gradient(to left, #1d1a57, #33278f 38%, #6b36b3 72%, #d9507e)",
        ["--b" as string]: "#5230b8",
        ["--d" as string]: "#1d1a57",
        ["--tink" as string]: "#4a2aa8",
      },
      icon: <Moon aria-hidden />,
      art: <NightSky className="pointer-events-none absolute end-[2%] top-[16%] w-[58%]" />,
      play: "end-[20%] top-[52%] -mt-[1.8rem] -me-[1.8rem]",
    };
  if (type === "quiz_review")
    return {
      cls: "poster-grade grade-6",
      icon: <Sun aria-hidden />,
      art: <Sunrise className="pointer-events-none absolute end-[4%] bottom-0 w-[46%] opacity-80" />,
      play: "end-[22%] top-[34%] -mt-[1.8rem] -me-[1.8rem]",
    };
  if (type === "video_lesson")
    return {
      cls: toneClass(slug),
      icon: <Play className="fill-current" aria-hidden />,
      art: (
        <span className="pointer-events-none absolute end-[6%] top-1/2 grid aspect-square w-[36%] -translate-y-1/2 place-items-center rounded-full border-[10px] border-white/18" aria-hidden>
          <span className="absolute inset-[14%] rounded-full border-[8px] border-white/22" />
          {slug ? <SubjectIcon slug={slug} className="absolute -end-[6%] -top-[6%] size-[34%] rotate-12 text-white/85" strokeWidth={2.2} /> : null}
        </span>
      ),
      play: "end-[24%] top-1/2 -mt-[1.8rem] -me-[1.8rem]",
    };
  return null;
}

/** ملصق بطاقة الفيديو: صورة المالك إن وُجدت، وإلا ملصق متنوع بالنوع (أو ملصق المادة المعتاد) */
function LibraryPoster({ item, title, slug, sizes, className }: { item: LibraryItem; title: string; slug: string | null; sizes: string; className?: string }) {
  const type = item.type as ProductType;
  const url = coverUrl(item.coverKey);
  const v = url ? null : posterVariant(type, slug);
  if (!v)
    return <ProductCover coverUrl={url} title={title} type={type} subjectName={item.subjectName} subjectSlug={slug} gradeName={item.gradeName} sizes={sizes} wide className={className} />;
  return (
    <div className={cn("poster @container flex aspect-[16/10] flex-col justify-between p-4 sm:p-5", v.cls, className)} style={v.style} role="img" aria-label={title}>
      <span className="chip chip-glass relative z-10 self-start">
        {v.icon}
        {PRODUCT_TYPE_LABELS[type]}
      </span>
      {v.art}
      <span className={cn("play-dot absolute", v.play)} aria-hidden>
        <Play className="-ms-0.5 size-6 fill-current" />
      </span>
      <span className="relative max-w-[58%]">
        <span className="block font-display text-[clamp(1rem,7.5cqi,2rem)] leading-[1.3] font-black text-white [text-shadow:0_3px_0_color-mix(in_oklab,var(--d)_60%,transparent),0_8px_18px_rgb(0_0_0/0.22)]">
          {item.subjectName ?? item.gradeName}
        </span>
        {item.subjectName ? (
          <span className="mt-1 inline-block rounded-full bg-white/90 px-2.5 font-display text-[clamp(0.7rem,5cqi,0.85rem)] leading-7 font-extrabold" style={{ color: "var(--tink)" }}>
            {item.gradeName}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** بطاقة شرح فيديو في المكتبة: ملصق المادة، العنوان، التقدم الحقيقي، وزرا الفتح */
export function VideoLibraryCard({ item }: { item: LibraryItem }) {
  const pct = item.lessonCount ? Math.round((item.watchedCount / item.lessonCount) * 100) : 0;
  const meta = [item.teacherName, item.subjectName, item.gradeName].filter(Boolean).join(" · ");
  const slug = itemSlug(item);
  return (
    <article className={cn("tile-3d flex h-full flex-col p-2.5", toneClass(slug))} data-testid="library-video">
      <LibraryPoster item={item} title={item.title} slug={slug} sizes="(max-width: 640px) 92vw, (max-width: 1280px) 45vw, 380px" className="rounded-[1.3rem]" />
      <div className="flex flex-1 flex-col px-2 pt-4 pb-2 sm:px-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="chip">{PRODUCT_TYPE_LABELS[item.type as ProductType]}</span>
          {pct === 100 ? <span className="chip chip-mint">أكملته</span> : null}
        </div>
        <h3 className="mt-2 font-display text-[1.15rem] leading-snug font-extrabold text-ink">{item.title}</h3>
        {meta ? <p className="mt-1 text-[0.88rem] text-muted">{meta}</p> : null}
        <div className="mt-4">
          {item.watchedCount ? (
            <div aria-label={`شاهدت ${ar(item.watchedCount)} من ${ar(item.lessonCount)}`} role="group">
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[0.85rem] font-bold">
                <span className="text-[var(--tink)]">
                  شاهدت {ar(item.watchedCount)} من {ar(item.lessonCount)}
                </span>
                <span className="font-display text-[var(--tink)]">{ar(pct)}٪</span>
              </div>
              <ProgressBar pct={pct} />
            </div>
          ) : (
            <p className="text-[0.88rem] font-semibold text-ink-soft">{count(item.lessonCount, W.lesson)}، لم تبدأ بعد</p>
          )}
          {item.expiresAt ? (
            <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-3 py-1 text-[0.82rem] font-bold text-warning">
              <CalendarClock className="size-4" aria-hidden />
              الوصول حتى {formatDate(item.expiresAt)}
            </p>
          ) : null}
        </div>
        <div className="mt-auto flex flex-wrap gap-2.5 pt-5">
          <Button asChild className="min-w-0 flex-1">
            <Link prefetch={false} href={`/watch/${item.productId}`} data-testid="open-video">
              <Play className="fill-current" aria-hidden /> {item.watchedCount ? "تابع المشاهدة" : "ابدأ المشاهدة"}
            </Link>
          </Button>
          {item.files.length ? (
            <Button asChild variant="soft">
              <Link prefetch={false} href={`/read/${item.files[0].id}`} data-testid="open-attachment">
                <FileText aria-hidden /> الملف المرفق
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** صف مذكرة/ملف بلون المادة: غلاف مصغر، العنوان، الفصل، وأزرار الفتح والتنزيل */
export function NoteLibraryRow({ item }: { item: LibraryItem }) {
  const slug = itemSlug(item);
  return (
    <article className={cn("tile-3d flex h-full flex-col gap-4 p-4 sm:flex-row sm:items-center", toneClass(slug))}>
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <ProductCover
          coverUrl={coverUrl(item.coverKey)}
          title={item.title}
          type={item.type as ProductType}
          subjectName={item.subjectName}
          subjectSlug={slug}
          gradeName={item.gradeName}
          sizes="72px"
          compact
          className="size-[4.5rem] shrink-0 rounded-[1.1rem]"
        />
        <div className="min-w-0">
          <span className="chip">{PRODUCT_TYPE_LABELS[item.type as ProductType]}</span>
          <h4 className="mt-1.5 font-display text-[1.05rem] leading-snug font-extrabold text-ink">{item.title}</h4>
          {item.term ? <p className="mt-0.5 text-[0.86rem] text-muted">{termLabel(item.term)}</p> : null}
        </div>
      </div>
      <div className="shrink-0 border-t-2 border-dashed border-[var(--soft)] pt-3 sm:border-t-0 sm:pt-0">
        {item.type === "video_course" ? (
          <Button asChild size="sm">
            <Link prefetch={false} href={`/watch/${item.productId}`}>
              <Play className="fill-current" aria-hidden /> شاهد الدروس
            </Link>
          </Button>
        ) : item.files.length === 0 ? (
          <p className="text-[0.88rem] text-muted">الملفات قيد التجهيز وتظهر هنا قريبًا.</p>
        ) : (
          <ul className="flex flex-col gap-2 sm:items-end">
            {item.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 sm:justify-end">
                {f.lastPage ? (
                  <span className="chip">
                    <BookOpen aria-hidden /> وصلت للصفحة {ar(f.lastPage)}
                  </span>
                ) : null}
                {item.isDownloadable ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/files/${f.id}?download=1`}>
                      <Download aria-hidden /> تنزيل
                    </a>
                  </Button>
                ) : null}
                <Button asChild size="sm">
                  <Link prefetch={false} href={`/read/${f.id}`} data-testid="open-file">
                    <FileText aria-hidden /> {item.files.length > 1 ? f.title : "افتح المذكرة"}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** البطاقة البارزة في لوح «تابع من حيث توقفت» */
export function ResumeFeatured({ r }: { r: ResumeEntry }) {
  const slug = itemSlug(r.item);
  return (
    <Link prefetch={false}
      href={r.href}
      className={cn(
        "group grid gap-4 rounded-[1.75rem] bg-white p-2.5 text-ink shadow-pop transition-transform hover:-translate-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-center sm:gap-6 motion-reduce:hover:translate-y-0",
        toneClass(slug),
      )}
      data-testid={r.kind === "video" ? "continue-watching-item" : "continue-reading-item"}
    >
      {r.item ? (
        <LibraryPoster item={r.item} title={r.title} slug={slug} sizes="(max-width: 640px) 90vw, 420px" className="rounded-[1.35rem]" />
      ) : (
        <ProductCover
          coverUrl={null}
          title={r.title}
          type={(r.kind === "video" ? "video_lesson" : "final_notes") as ProductType}
          subjectName={null}
          subjectSlug={slug}
          gradeName=""
          sizes="(max-width: 640px) 90vw, 420px"
          wide
          className="rounded-[1.35rem]"
        />
      )}
      <span className="block px-2.5 pb-3 sm:px-0 sm:pe-5 sm:pb-0">
        <span className="chip">
          {r.kind === "video" ? <Play className="fill-current" aria-hidden /> : <BookOpen aria-hidden />}
          {r.kind === "video" ? (r.completed ? "آخر درس أكملته" : "آخر درس شاهدته") : "آخر ما قرأته"}
        </span>
        <span className="mt-2 block font-display text-[1.3rem] leading-snug font-black sm:text-[1.5rem]">{r.title}</span>
        <span className="mt-1 block text-[0.92rem] text-muted">{r.context}</span>
        <span className="mt-4 flex items-center gap-3">
          <ProgressBar pct={r.pct} className="flex-1" />
          <span className="shrink-0 font-display text-[0.88rem] font-extrabold text-[var(--tink)]">{r.status}</span>
        </span>
        <span className="btn btn-3d btn-primary btn-md mt-5">
          {r.kind === "video" ? (r.completed ? "راجع الدرس" : "تابع المشاهدة") : "تابع القراءة"}
          {r.completed ? <RotateCcw aria-hidden /> : <ArrowLeft aria-hidden />}
        </span>
      </span>
    </Link>
  );
}

/** صف زجاجي صغير لبقية عناصر «تابع» على اللوح الداكن */
export function ResumeRow({ r }: { r: ResumeEntry }) {
  const slug = itemSlug(r.item);
  return (
    <Link prefetch={false}
      href={r.href}
      className="group flex items-center gap-3.5 rounded-[1.4rem] bg-white/10 p-3 ring-1 ring-white/15 transition-colors hover:bg-white/16"
      data-testid={r.kind === "video" ? "continue-watching-item" : "continue-reading-item"}
    >
      <ProductCover
        coverUrl={r.item ? coverUrl(r.item.coverKey) : null}
        title={r.title}
        type={(r.item?.type ?? (r.kind === "video" ? "video_lesson" : "final_notes")) as ProductType}
        subjectName={r.item?.subjectName ?? null}
        subjectSlug={slug}
        gradeName={r.item?.gradeName ?? ""}
        sizes="64px"
        compact
        className="size-16 shrink-0 rounded-[1rem]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display font-extrabold text-white">{r.title}</span>
        <span className="block truncate text-[0.85rem] text-white/75">{r.context}</span>
        <span className="mt-2 flex items-center gap-2.5">
          <ProgressBar pct={r.pct} tone="gold" className="h-2 flex-1" />
          <span className="shrink-0 text-[0.8rem] font-bold text-white/85">{r.status}</span>
        </span>
      </span>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-600 text-accent-900 transition-transform group-hover:-translate-x-0.5" aria-hidden>
        <Play className="size-4 fill-current" />
      </span>
    </Link>
  );
}
