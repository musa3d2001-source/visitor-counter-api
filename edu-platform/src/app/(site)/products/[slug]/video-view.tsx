import Image from "next/image";
import Link from "next/link";
import { CalendarClock, CircleCheck, Clock, FileText, Gift, Lock, PlayCircle, ShieldCheck } from "lucide-react";
import type { PlaylistGroup, ProductCard, ProductDetail, PublicFileInfo } from "@/server/catalog/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Alert } from "@/components/ui/alert";
import { AddToCart } from "@/components/site/add-to-cart";
import { ProductCover } from "@/components/site/product-cover";
import { ProductGrid } from "@/components/site/product-card";
import { VideoGrid } from "@/components/site/video-card";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { formatClock, formatTotalDuration, lessonsLabel } from "@/components/site/format";
import { PRODUCT_TYPE_LABELS, termLabel } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export function accessPeriodText(p: Pick<ProductDetail, "accessMode" | "accessUntil" | "accessDays">): string {
  if (p.accessMode === "until_date" && p.accessUntil) return `الوصول حتى ${formatDate(p.accessUntil)}`;
  if (p.accessMode === "days" && p.accessDays) return `الوصول لمدة ${p.accessDays} يومًا من تاريخ الشراء`;
  return "وصول غير محدد";
}

/** صفحة منتج الفيديو (درس/وحدة/مراجعة/دورة/باقة فيها فيديوهات) */
export function VideoProductView({
  product,
  playlist,
  included,
  bundles,
  files,
  owned,
  isOwned,
  ownedUntil,
  resumeLessonId,
  watchedIds,
  canBuy,
}: {
  product: ProductDetail;
  playlist: PlaylistGroup[];
  included: ProductCard[];
  bundles: ProductCard[];
  files: PublicFileInfo[];
  owned: Set<string>;
  isOwned: boolean;
  ownedUntil: Date | null;
  resumeLessonId: string | null;
  watchedIds: Set<string>;
  canBuy: boolean;
}) {
  const lessons = playlist.flatMap((g) => g.lessons);
  const firstLesson = lessons[0]?.id ?? null;
  const itemsValue = included.reduce((s, i) => s + i.priceFils, 0);
  const contents = product.contents.split("\n").map((l) => l.trim()).filter(Boolean);
  const mainFiles = files.filter((f) => f.kind === "main");
  const watchHref = `/watch/${product.id}${resumeLessonId ?? firstLesson ? `?lesson=${resumeLessonId ?? firstLesson}` : ""}`;

  return (
    <>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-10">
        <div className="min-w-0">
          {/* الصورة المصغرة مع زر المعاينة */}
          <div className="relative aspect-video overflow-hidden rounded-3xl bg-brand-900 shadow-lift">
            {product.thumbnailUrl ? (
              <Image src={product.thumbnailUrl} alt="" fill priority sizes="(max-width: 1024px) 100vw, 700px" className="object-cover" />
            ) : (
              <div className="absolute inset-0 [&>div]:!aspect-auto [&>div]:h-full" aria-hidden>
                <ProductCover coverUrl={null} title={product.title} type={product.type} subjectName={product.subjectName} gradeName={product.gradeName} compact />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/5" aria-hidden />
            <div className="absolute inset-0 grid place-items-center">
              {isOwned ? (
                <Link href={watchHref} className="flex items-center gap-2 rounded-full bg-white/95 px-5 py-3 font-bold text-brand-800 shadow-lift transition hover:scale-105" data-testid="continue-watching">
                  <PlayCircle className="size-6" aria-hidden /> {resumeLessonId ? "تابع المشاهدة" : "ابدأ المشاهدة"}
                </Link>
              ) : product.previewLessonId ? (
                <Link
                  href={`/watch/${product.id}?lesson=${product.previewLessonId}`}
                  className="flex items-center gap-2 rounded-full bg-white/95 px-5 py-3 font-bold text-brand-800 shadow-lift transition hover:scale-105"
                  data-testid="watch-preview"
                >
                  <PlayCircle className="size-6" aria-hidden /> شاهد المعاينة المجانية
                </Link>
              ) : (
                <span className="grid size-16 place-items-center rounded-full bg-white/85 text-brand-700" aria-hidden>
                  <PlayCircle className="size-9" />
                </span>
              )}
            </div>
            <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
              <span className="flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1">
                <PlayCircle className="size-4" aria-hidden /> {lessonsLabel(product.lessonCount)}
              </span>
              {product.totalDurationSeconds ? (
                <span className="flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1">
                  <Clock className="size-4" aria-hidden /> {formatTotalDuration(product.totalDurationSeconds)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Badge>{PRODUCT_TYPE_LABELS[product.type]}</Badge>
            <Badge tone="neutral">
              {product.subjectName ?? "عدة مواد"} · {product.gradeName}
            </Badge>
            {product.term ? <Badge tone="neutral">{termLabel(product.term)}</Badge> : null}
          </div>
          <h1 className="mt-3 text-2xl leading-[1.5] font-bold sm:text-3xl">{product.title}</h1>
          {product.summary ? <p className="mt-2 text-lg leading-8 text-ink-soft">{product.summary}</p> : null}

          {product.teacher ? (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
              <TeacherAvatar name={product.teacher.name} photoUrl={product.teacher.photoUrl} size={52} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">المعلم</p>
                <p className="font-bold">{product.teacher.name}</p>
                {product.teacher.headline ? <p className="truncate text-xs text-muted">{product.teacher.headline}</p> : null}
              </div>
              {product.teacher.slug ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/teachers/${product.teacher.slug}`} data-testid="teacher-link">
                    صفحة المعلم
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {product.description ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold">عن {PRODUCT_TYPE_LABELS[product.type]}</h2>
              <p className="mt-2 leading-8 whitespace-pre-line text-ink-soft">{product.description}</p>
            </section>
          ) : null}

          {contents.length ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold">ماذا ستتعلم؟</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {contents.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-ink-soft">
                    <CircleCheck className="mt-1 size-4 shrink-0 text-brand-600" aria-hidden /> {c}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* قائمة الدروس */}
          {playlist.length ? (
            <section className="mt-8" aria-labelledby="lessons-title">
              <h2 id="lessons-title" className="text-lg font-bold">
                محتوى الشرح <span className="text-sm font-normal text-muted">({lessonsLabel(lessons.length)})</span>
              </h2>
              <div className="mt-3 space-y-4">
                {playlist.map((g) => (
                  <div key={g.key} className="overflow-hidden rounded-2xl border border-line bg-surface">
                    <h3 className="flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-2.5 text-sm font-bold">
                      <span>{g.title}</span>
                      <span className="text-xs font-normal text-muted">{formatTotalDuration(g.lessons.reduce((n, l) => n + (l.durationSeconds ?? 0), 0))}</span>
                    </h3>
                    <ol className="divide-y divide-line">
                      {g.lessons.map((l) => {
                        const open = isOwned || l.isFreePreview;
                        return (
                          <li key={l.id} data-testid="lesson-item">
                            <Link
                              href={`/watch/${product.id}?lesson=${l.id}`}
                              className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-brand-50/50"
                              aria-label={`${l.title}${open ? "" : " — مقفل"}`}
                            >
                              <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-brand-100 sm:w-28">
                                {l.thumbnailUrl ? <Image src={l.thumbnailUrl} alt="" fill sizes="112px" className="object-cover" /> : null}
                                <span className="absolute inset-0 grid place-items-center text-brand-700" aria-hidden>
                                  <PlayCircle className={l.thumbnailUrl ? "size-6 text-white drop-shadow" : "size-6"} />
                                </span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 font-semibold">{l.title}</span>
                                <span className="num text-xs text-muted">{formatClock(l.durationSeconds)}</span>
                              </span>
                              {watchedIds.has(l.id) ? (
                                <CircleCheck className="size-5 shrink-0 text-success" aria-label="تمت المشاهدة" />
                              ) : l.isFreePreview && !isOwned ? (
                                <Badge tone="success">
                                  <Gift className="size-3" aria-hidden /> مجاني
                                </Badge>
                              ) : open ? null : (
                                <Lock className="size-4 shrink-0 text-muted" aria-label="مقفل" data-testid="lesson-locked" />
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {mainFiles.length ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold">ملفات مرفقة</h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {mainFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <FileText className="size-5 text-brand-600" aria-hidden />
                    <span className="flex-1 font-semibold">{f.title}</span>
                    {f.pageCount ? (
                      <span className="text-muted">
                        <span className="num">{f.pageCount}</span> صفحة
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* صندوق الشراء */}
        <aside className="h-fit lg:sticky lg:top-24">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="lg" />
            {included.length && itemsValue > product.priceFils ? (
              <p className="mt-1 text-sm font-semibold text-success">
                توفّر <span className="num">{filsToKwdString(itemsValue - product.priceFils)}</span> د.ك مقارنة بالشراء المنفرد
              </p>
            ) : null}
            <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-soft" data-testid="access-period">
              <CalendarClock className="size-4 text-brand-600" aria-hidden /> {accessPeriodText(product)}
            </p>
            <div className="mt-4">
              {isOwned ? (
                <div className="flex flex-col gap-3">
                  <Alert tone="success">
                    هذا المحتوى في مكتبتك{ownedUntil ? ` — متاح حتى ${formatDate(ownedUntil)}` : ""}.
                  </Alert>
                  <Button asChild size="lg">
                    <Link href={watchHref}>
                      <PlayCircle aria-hidden /> {resumeLessonId ? "تابع المشاهدة" : "ابدأ المشاهدة"}
                    </Link>
                  </Button>
                </div>
              ) : canBuy ? (
                <AddToCart productId={product.id} />
              ) : null}
            </div>
            <ul className="mt-4 flex flex-col gap-2 text-xs text-muted">
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-success" aria-hidden /> دفع آمن عبر كي نت والبطاقات</li>
              <li className="flex items-center gap-1.5"><CircleCheck className="size-4 text-success" aria-hidden /> مشاهدة فورية بعد تأكيد الدفع</li>
              <li className="flex items-center gap-1.5"><CircleCheck className="size-4 text-success" aria-hidden /> تكمل من حيث توقفت على أي جهاز</li>
            </ul>
          </div>
        </aside>
      </div>

      {included.length ? (
        <section className="mt-14">
          <h2 className="mb-5 text-2xl font-bold">{product.type === "bundle" ? "تشمل الباقة" : "تشمل الدورة"} ({included.length})</h2>
          {included.every((i) => i.isVideo) ? <VideoGrid products={included} ownedIds={owned} /> : <ProductGrid products={included} ownedIds={owned} />}
        </section>
      ) : null}

      {bundles.length ? (
        <section className="mt-14">
          <h2 className="mb-1 text-2xl font-bold">وفّر أكثر مع الباقات</h2>
          <p className="mb-5 text-sm text-muted">هذا المحتوى مضمّن في الباقات التالية</p>
          <ProductGrid products={bundles} ownedIds={owned} />
        </section>
      ) : null}

      {!isOwned && canBuy ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden no-print">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="md" className="shrink-0" />
            <AddToCart productId={product.id} compact className="flex-1" />
          </div>
        </div>
      ) : null}
    </>
  );
}
