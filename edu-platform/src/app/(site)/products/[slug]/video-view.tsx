import Image from "next/image";
import Link from "next/link";
import { Check, CircleCheck, FileText, Lock, Play } from "lucide-react";
import type { PlaylistGroup, ProductCard, ProductDetail, PublicFileInfo } from "@/server/catalog/queries";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { AddToCart } from "@/components/site/add-to-cart";
import { posterTone } from "@/components/site/product-cover";
import { ProductList } from "@/components/site/product-card";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { formatClock, formatTotalDuration, lessonsLabel } from "@/components/site/format";
import { PRODUCT_TYPE_LABELS, termLabel } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export function accessPeriodText(p: Pick<ProductDetail, "accessMode" | "accessUntil" | "accessDays">): string {
  if (p.accessMode === "until_date" && p.accessUntil) return `حتى ${formatDate(p.accessUntil)}`;
  if (p.accessMode === "days" && p.accessDays) {
    const d = p.accessDays;
    const days = d === 1 ? "يوم واحد" : d === 2 ? "يومين" : d <= 10 ? `${d} أيام` : `${d} يومًا`;
    return `${days} من تاريخ الشراء`;
  }
  return "بلا تاريخ انتهاء";
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
  const facts = [
    product.subjectName ?? "عدة مواد",
    product.gradeName,
    product.term ? termLabel(product.term).replace("الفصل الدراسي ", "الفصل ") : null,
  ].filter(Boolean);
  let n = 0;

  return (
    <>
      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-semibold text-brand-700">{PRODUCT_TYPE_LABELS[product.type]}</p>
        <h1 className="mt-1 text-[clamp(2.1rem,5vw,3.3rem)]">{product.title}</h1>
        {product.summary ? <p className="mt-3 text-lg leading-8 text-ink-soft">{product.summary}</p> : null}
        <p className="mt-3 text-sm text-muted">{facts.join("، ")}</p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <div className="min-w-0">
          {/* شاشة المعاينة */}
          <div className="relative aspect-video overflow-hidden rounded-lg bg-ink">
            {product.thumbnailUrl ? (
              <Image src={product.thumbnailUrl} alt="" fill priority sizes="(max-width: 1024px) 100vw, 760px" className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col p-5 text-white sm:p-7" style={{ backgroundColor: posterTone(product.subjectName, product.gradeName) }} aria-hidden>
                <span className="text-sm text-white/80">{product.gradeName}</span>
                <span className="mt-1 font-display text-[clamp(2.4rem,7vw,4.5rem)] leading-none font-semibold">{product.subjectName ?? PRODUCT_TYPE_LABELS[product.type]}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 bg-gradient-to-t from-black/55 to-transparent p-4 pt-16 sm:p-5 sm:pt-20">
              {isOwned ? (
                <Link
                  href={watchHref}
                  className="inline-flex min-h-12 items-center gap-2.5 rounded-lg bg-white px-5 font-semibold text-ink transition-colors hover:bg-accent-200"
                  data-testid="continue-watching"
                >
                  <Play className="size-4 fill-current" aria-hidden /> {resumeLessonId ? "تابع المشاهدة" : "ابدأ المشاهدة"}
                </Link>
              ) : product.previewLessonId ? (
                <Link
                  href={`/watch/${product.id}?lesson=${product.previewLessonId}`}
                  className="inline-flex min-h-12 items-center gap-2.5 rounded-lg bg-white px-5 font-semibold text-ink transition-colors hover:bg-accent-200"
                  data-testid="watch-preview"
                >
                  <Play className="size-4 fill-current" aria-hidden /> شاهد المعاينة المجانية
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm font-medium text-white">
                {lessonsLabel(product.lessonCount)}
                {product.totalDurationSeconds ? ` في ${formatTotalDuration(product.totalDurationSeconds)}` : ""}
              </span>
            </div>
          </div>

          {product.teacher ? (
            <div className="mt-6 flex items-center gap-4 border-b border-line pb-6">
              <TeacherAvatar name={product.teacher.name} photoUrl={product.teacher.photoUrl} size={56} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{product.teacher.name}</p>
                {product.teacher.headline ? <p className="text-sm text-muted">{product.teacher.headline}</p> : null}
              </div>
              {product.teacher.slug ? (
                <Link
                  href={`/teachers/${product.teacher.slug}`}
                  data-testid="teacher-link"
                  className="shrink-0 text-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-700"
                >
                  صفحة المعلم
                </Link>
              ) : null}
            </div>
          ) : null}

          {contents.length ? (
            <section className="mt-8" aria-labelledby="learn">
              <h2 id="learn" className="text-[1.9rem]">
                ماذا ستتعلم
              </h2>
              <ul className="mt-3 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                {contents.map((c) => (
                  <li key={c} className="flex items-start gap-2.5 leading-7 text-ink-soft">
                    <Check className="mt-1.5 size-4 shrink-0 text-brand-600" aria-hidden /> {c}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {product.description ? (
            <section className="mt-8" aria-labelledby="about">
              <h2 id="about" className="text-[1.9rem]">
                عن {PRODUCT_TYPE_LABELS[product.type]}
              </h2>
              <p className="mt-2 max-w-[68ch] leading-8 whitespace-pre-line text-ink-soft">{product.description}</p>
            </section>
          ) : null}

          {/* جدول الدروس: الترقيم هنا تسلسل فعلي لترتيب المشاهدة */}
          {playlist.length ? (
            <section className="mt-10" aria-labelledby="lessons-title">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="lessons-title" className="text-[1.9rem]">
                  الدروس
                </h2>
                <span className="text-sm text-muted">
                  {lessonsLabel(lessons.length)}
                  {product.totalDurationSeconds ? ` في ${formatTotalDuration(product.totalDurationSeconds)}` : ""}
                </span>
              </div>
              <div className="mt-3 space-y-6">
                {playlist.map((g) => (
                  <div key={g.key}>
                    {playlist.length > 1 || g.title !== product.title ? (
                      <h3 className="flex items-baseline justify-between gap-3 border-b-2 border-ink pb-2 text-[0.98rem] font-semibold">
                        <span>{g.title}</span>
                        <span className="text-xs font-normal text-muted">{formatTotalDuration(g.lessons.reduce((s, l) => s + (l.durationSeconds ?? 0), 0))}</span>
                      </h3>
                    ) : (
                      <div className="border-b-2 border-ink" />
                    )}
                    <ol>
                      {g.lessons.map((l) => {
                        n += 1;
                        const open = isOwned || l.isFreePreview;
                        const watched = watchedIds.has(l.id);
                        return (
                          <li key={l.id} data-testid="lesson-item" className="border-b border-line">
                            <Link
                              href={`/watch/${product.id}?lesson=${l.id}`}
                              className="group grid min-h-14 grid-cols-[2rem_1fr_auto_3.5rem] items-center gap-3 py-2.5 text-[0.95rem] transition-colors hover:bg-mist sm:px-2"
                              aria-label={`${l.title}${open ? "" : "، مقفل"}`}
                            >
                              <span className="num text-center text-sm text-muted">{n}</span>
                              <span className={open ? "font-semibold group-hover:text-brand-700" : "text-ink-soft"}>{l.title}</span>
                              <span className="flex items-center">
                                {watched ? (
                                  <CircleCheck className="size-4.5 text-success" aria-label="تمت المشاهدة" />
                                ) : l.isFreePreview && !isOwned ? (
                                  <span className="rounded-md bg-accent-200 px-2 py-0.5 text-xs font-semibold text-ink">مجاني</span>
                                ) : open ? (
                                  <Play className="size-3.5 text-brand-600 fill-current" aria-hidden />
                                ) : (
                                  <Lock className="size-4 text-muted" aria-label="مقفل" data-testid="lesson-locked" />
                                )}
                              </span>
                              <span className="num text-end text-sm text-muted">{formatClock(l.durationSeconds)}</span>
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
            <section className="mt-10" aria-labelledby="files">
              <h2 id="files" className="text-[1.9rem]">
                ملفات مرفقة
              </h2>
              <ul className="mt-3 border-t-2 border-ink">
                {mainFiles.map((f) => (
                  <li key={f.id} className="flex min-h-12 items-center gap-3 border-b border-line py-2.5 text-[0.95rem]">
                    <FileText className="size-4.5 text-brand-600" aria-hidden />
                    <span className="flex-1 font-semibold">{f.title}</span>
                    {f.pageCount ? (
                      <span className="text-sm text-muted">
                        <span className="num">{f.pageCount}</span> صفحة
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* لوحة الشراء */}
        <aside className="h-fit lg:sticky lg:top-24" aria-label="الشراء">
          <div className="rounded-lg bg-mist p-5 sm:p-6">
            {isOwned ? (
              <>
                <p className="font-semibold text-success">في مكتبتك</p>
                {ownedUntil ? <p className="mt-1 text-sm text-ink-soft">متاح حتى {formatDate(ownedUntil)}</p> : null}
                <Button asChild size="lg" className="mt-4 w-full">
                  <Link href={watchHref}>
                    <Play className="fill-current" aria-hidden /> {resumeLessonId ? "تابع المشاهدة" : "ابدأ المشاهدة"}
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="lg" />
                {included.length && itemsValue > product.priceFils ? (
                  <p className="mt-1 text-sm font-semibold text-brand-700">
                    توفّر <span className="num">{filsToKwdString(itemsValue - product.priceFils)}</span> د.ك مقارنة بالشراء المنفرد
                  </p>
                ) : null}
                {canBuy ? (
                  <div className="mt-5">
                    <AddToCart productId={product.id} />
                  </div>
                ) : null}
              </>
            )}
            <dl className="mt-5 space-y-2.5 border-t border-line-strong pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">مدة الوصول</dt>
                <dd className="text-end font-medium" data-testid="access-period">
                  {accessPeriodText(product)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">المشاهدة</dt>
                <dd className="text-end font-medium">فور تأكيد الدفع</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">الدفع</dt>
                <dd className="text-end font-medium">كي نت أو بطاقة</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-6 text-muted">تكمل من حيث توقفت على أي جهاز.</p>
          </div>
        </aside>
      </div>

      {included.length ? (
        <section className="mt-14" aria-labelledby="included">
          <h2 id="included" className="text-[clamp(1.7rem,3vw,2.3rem)]">
            {product.type === "bundle" ? "تشمل الباقة" : "أجزاء الدورة"}
          </h2>
          <p className="mt-1 mb-4 text-muted">{product.type === "bundle" ? "كل ما تحصل عليه عند شراء الباقة." : "تحتاج جزءًا واحدًا فقط؟ كل جزء متاح للشراء وحده."}</p>
          <ProductList products={included} ownedIds={owned} />
        </section>
      ) : null}

      {bundles.length ? (
        <section className="mt-14" aria-labelledby="in-bundles">
          <h2 id="in-bundles" className="text-[clamp(1.7rem,3vw,2.3rem)]">
            متوفر أيضًا ضمن باقة
          </h2>
          <p className="mt-1 mb-4 text-muted">الباقة تضم هذا المحتوى مع محتوى آخر. قارن ما تشمله قبل الاختيار.</p>
          <ProductList products={bundles} ownedIds={owned} />
        </section>
      ) : null}

      {!isOwned && canBuy ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 lg:hidden no-print">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="shrink-0">
              <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="md" />
              <p className="text-[0.7rem] text-muted">{accessPeriodText(product)}</p>
            </div>
            <AddToCart productId={product.id} compact className="flex-1" />
          </div>
        </div>
      ) : null}
    </>
  );
}
