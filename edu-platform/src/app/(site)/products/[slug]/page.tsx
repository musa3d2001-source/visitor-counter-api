import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Check, Download, Eye, FileText, Lock, Play } from "lucide-react";
import {
  getBundleItems,
  getBundlesContaining,
  getLessons,
  getPlaylist,
  getProductBySlug,
  getProductFilesInfo,
} from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessExpiry, accessibleProductIds, isTeacherOfProduct } from "@/server/access/entitlements";
import { sql } from "@/server/db";
import { VideoProductView } from "./video-view";
import { getSettings } from "@/server/platform/settings";
import { env } from "@/server/env";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Alert } from "@/components/ui/alert";
import { ProductCover } from "@/components/site/product-cover";
import { ProductList } from "@/components/site/product-card";
import { AddToCart } from "@/components/site/add-to-cart";
import { PRODUCT_TYPE_LABELS, PRODUCT_STATUS_LABELS, termLabel, type ProductStatus } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return { title: "المنتج غير متاح" };
  const description = p.summary || `${PRODUCT_TYPE_LABELS[p.type]} ${p.subjectName ?? ""} لطلاب ${p.gradeName}`;
  return {
    title: p.title,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.title, description, images: p.coverUrl ? [{ url: p.coverUrl }] : undefined },
  };
}

/** «تصفّح أول صفحتين مجانًا» بصيغة العدد الصحيحة */
function previewLabel(pages: number | null) {
  if (!pages) return "تصفّح المعاينة مجانًا";
  if (pages === 1) return "تصفّح الصفحة الأولى مجانًا";
  if (pages === 2) return "تصفّح أول صفحتين مجانًا";
  return `تصفّح أول ${pages} ${pages <= 10 ? "صفحات" : "صفحة"} مجانًا`;
}

function formatDuration(sec: number | null) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  let product = await getProductBySlug(slug, { includeUnpublished: user?.role === "admin" || user?.role === "teacher" });
  // المعلم يعاين محتواه غير المنشور فقط
  if (product && product.status !== "published" && user?.role === "teacher" && !(await isTeacherOfProduct(user.id, product.id))) product = null;
  if (!product) notFound();

  if (product.isVideo) {
    const [playlist, included, bundlesV, filesV, ownedV] = await Promise.all([
      getPlaylist(product.id),
      getBundleItems(product.id),
      getBundlesContaining(product.id),
      getProductFilesInfo(product.id),
      user ? accessibleProductIds(user.id) : Promise.resolve(new Set<string>()),
    ]);
    const lessonIds = playlist.flatMap((g) => g.lessons.map((l) => l.id));
    const ownedNow = ownedV.has(product.id);
    let resumeLessonId: string | null = null;
    let watchedIds = new Set<string>();
    let ownedUntil: Date | null = null;
    if (user && lessonIds.length) {
      const prog = await sql<{ lesson_id: string; completed: boolean; updated_at: Date }[]>`
        select lesson_id, completed, updated_at from lesson_progress
        where user_id = ${user.id} and lesson_id = any(${lessonIds}::uuid[])
        order by updated_at desc
      `;
      watchedIds = new Set(prog.filter((p) => p.completed).map((p) => p.lesson_id));
      if (ownedNow && prog.length) {
        const last = prog[0];
        // إن أكمل آخر درس شاهده ننتقل للتالي
        const idx = lessonIds.indexOf(last.lesson_id);
        resumeLessonId = last.completed && idx >= 0 && idx < lessonIds.length - 1 ? lessonIds[idx + 1] : last.lesson_id;
      }
    }
    if (user && ownedNow) ownedUntil = (await accessExpiry(user.id, product.id)).expiresAt;
    return (
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-28 lg:pb-10">
        <Breadcrumbs
          items={[
            { label: "الرئيسية", href: "/" },
            { label: product.gradeName, href: `/grades/${product.gradeSlug}` },
            ...(product.subjectName && product.subjectSlug ? [{ label: product.subjectName, href: `/grades/${product.gradeSlug}/${product.subjectSlug}` }] : []),
            { label: product.title },
          ]}
        />
        {product.status !== "published" ? (
          <Alert tone="warning" className="mt-4" title={`معاينة قبل النشر، الحالة: ${PRODUCT_STATUS_LABELS[product.status as ProductStatus]}`}>
            هذه الصفحة غير ظاهرة للطلاب حتى يتم اعتماد المحتوى ونشره.
          </Alert>
        ) : null}
        <VideoProductView
          product={product}
          playlist={playlist}
          included={included}
          bundles={bundlesV}
          files={filesV}
          owned={ownedV}
          isOwned={ownedNow}
          ownedUntil={ownedUntil}
          resumeLessonId={resumeLessonId}
          watchedIds={watchedIds}
          canBuy={product.status === "published"}
        />
      </div>
    );
  }

  const [files, bundleItems, bundles, lessons, settings] = await Promise.all([
    getProductFilesInfo(product.id),
    product.type === "bundle" ? getBundleItems(product.id) : Promise.resolve([]),
    product.type !== "bundle" ? getBundlesContaining(product.id) : Promise.resolve([]),
    product.type === "video_course" ? getLessons(product.id) : Promise.resolve([]),
    getSettings(),
  ]);
  const owned = user ? await accessibleProductIds(user.id) : new Set<string>();
  const isOwned = owned.has(product.id);
  const mainFiles = files.filter((f) => f.kind === "main");
  const preview = files.find((f) => f.kind === "preview");
  const totalPages = mainFiles.reduce((s, f) => s + (f.pageCount ?? 0), 0) || product.pageCount;
  const itemsValue = bundleItems.reduce((s, i) => s + i.priceFils, 0);
  const contents = product.contents.split("\n").map((l) => l.trim()).filter(Boolean);
  const freeLesson = lessons.find((l) => l.isFreePreview);
  const videosOff = product.type === "video_course" && !settings.videos_enabled;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.summary || product.description,
    image: product.coverUrl ? new URL(product.coverUrl, env().APP_URL).toString() : undefined,
    category: PRODUCT_TYPE_LABELS[product.type],
    offers: {
      "@type": "Offer",
      priceCurrency: "KWD",
      price: filsToKwdString(product.priceFils),
      availability: "https://schema.org/InStock",
      url: new URL(`/products/${product.slug}`, env().APP_URL).toString(),
    },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs
        items={[
          { label: "الرئيسية", href: "/" },
          { label: product.gradeName, href: `/grades/${product.gradeSlug}` },
          ...(product.subjectName && product.subjectSlug ? [{ label: product.subjectName, href: `/grades/${product.gradeSlug}/${product.subjectSlug}` }] : []),
          { label: product.title },
        ]}
      />

      {product.status !== "published" ? (
        <Alert tone="warning" className="mt-4" title={`معاينة قبل النشر، الحالة: ${PRODUCT_STATUS_LABELS[product.status as ProductStatus]}`}>
          هذه الصفحة غير ظاهرة للطلاب حتى يتم نشر المنتج.
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)] lg:grid-cols-[19rem_minmax(0,1fr)_20rem] lg:gap-10">
        <div className="mx-auto w-full max-w-[13rem] md:max-w-none">
          <div className="overflow-hidden rounded-md">
            <ProductCover coverUrl={product.coverUrl} title={product.title} type={product.type} subjectName={product.subjectName} gradeName={product.gradeName} priority sizes="304px" />
          </div>
          {preview && !isOwned ? (
            <Button asChild variant="outline" size="lg" className="mt-4 w-full">
              <Link href={`/preview/${preview.id}`} data-testid="free-preview">
                <Eye aria-hidden /> {previewLabel(preview.pageCount)}
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-700">{PRODUCT_TYPE_LABELS[product.type]}</p>
          <h1 className="mt-1 text-[clamp(2.1rem,5vw,3.1rem)]">{product.title}</h1>
          {product.summary ? <p className="mt-3 text-lg leading-8 text-ink-soft">{product.summary}</p> : null}

          <dl className="mt-6 grid grid-cols-2 gap-x-4 border-t-2 border-ink sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {[
              { k: "الصف", v: product.gradeName },
              { k: "المادة", v: product.subjectName ?? "عدة مواد" },
              { k: "الفصل", v: termLabel(product.term).replace("الفصل الدراسي ", "") },
              totalPages ? { k: "الصفحات", v: String(totalPages) } : { k: "العام الدراسي", v: product.academicYear.replace("-", " / ") },
            ].map((d) => (
              <div key={d.k} className="border-b border-line py-3 pe-3">
                <dt className="text-xs text-muted">{d.k}</dt>
                <dd className="mt-0.5 font-semibold">{d.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-soft">
            {product.isDownloadable ? (
              <>
                <Download className="size-4 text-brand-600" aria-hidden /> قابلة للتنزيل والطباعة بعد الشراء
              </>
            ) : product.type !== "bundle" && product.type !== "video_course" ? (
              <>
                <Lock className="size-4 text-muted" aria-hidden /> تُقرأ داخل المنصة، ولا تُنزّل
              </>
            ) : null}
          </p>

          {contents.length ? (
            <section className="mt-8" aria-labelledby="contents">
              <h2 id="contents" className="text-[1.9rem]">
                ماذا تحتوي
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

          {mainFiles.length ? (
            <section className="mt-8" aria-labelledby="files">
              <h2 id="files" className="text-[1.9rem]">
                الملفات
              </h2>
              <ul className="mt-3 border-t-2 border-ink">
                {mainFiles.map((f) => (
                  <li key={f.id} className="flex min-h-12 items-center gap-3 border-b border-line py-2.5 text-[0.95rem]">
                    <FileText className="size-4.5 text-brand-600" aria-hidden />
                    <span className="flex-1 font-semibold">{f.title}</span>
                    {f.pageCount ? <span className="text-sm text-muted"><span className="num">{f.pageCount}</span> صفحة</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {lessons.length ? (
            <section className="mt-8" aria-labelledby="lessons">
              <h2 id="lessons" className="text-[1.9rem]">
                الدروس
              </h2>
              <ol className="mt-3 border-t-2 border-ink">
                {lessons.map((l, i) => (
                  <li key={l.id} className="grid min-h-12 grid-cols-[2rem_1fr_auto_3.5rem] items-center gap-3 border-b border-line py-2.5 text-[0.95rem]">
                    <span className="num text-center text-sm text-muted">{i + 1}</span>
                    <span>
                      {l.unitTitle ? <span className="block text-xs text-muted">{l.unitTitle}</span> : null}
                      <span className="font-semibold">{l.title}</span>
                    </span>
                    {l.isFreePreview ? <span className="rounded-md bg-accent-200 px-2 py-0.5 text-xs font-semibold text-ink">مجاني</span> : <Lock className="size-4 text-muted" aria-label="مدفوع" />}
                    <span className="num text-end text-sm text-muted">{formatDuration(l.durationSeconds)}</span>
                  </li>
                ))}
              </ol>
              {freeLesson && settings.videos_enabled ? (
                <Button asChild variant="outline" className="mt-4">
                  <Link href={`/watch/${product.id}?lesson=${freeLesson.id}`}>
                    <Play className="fill-current" aria-hidden /> شاهد الدرس المجاني
                  </Link>
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="h-fit md:col-span-2 lg:sticky lg:top-24 lg:col-span-1" aria-label="الشراء">
          <div className="rounded-lg bg-mist p-5 sm:p-6">
            {isOwned ? (
              <>
                <p className="font-semibold text-success">في مكتبتك</p>
                <Button asChild size="lg" className="mt-4 w-full">
                  <Link href="/library">
                    <BookOpen aria-hidden /> افتح في مكتبتي
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="lg" />
                {product.type === "bundle" && itemsValue > product.priceFils ? (
                  <p className="mt-1 text-sm font-semibold text-brand-700">
                    توفّر <span className="num">{filsToKwdString(itemsValue - product.priceFils)}</span> د.ك مقارنة بشراء المذكرات منفردة
                  </p>
                ) : null}
                <div className="mt-5">
                  {videosOff ? (
                    <Alert tone="info">دروس الفيديو ستتوفر قريبًا.</Alert>
                  ) : product.status === "published" ? (
                    <AddToCart productId={product.id} />
                  ) : null}
                </div>
              </>
            )}
            <dl className="mt-5 space-y-2.5 border-t border-line-strong pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">الاستلام</dt>
                <dd className="text-end font-medium">في مكتبتك فور تأكيد الدفع</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">الدفع</dt>
                <dd className="text-end font-medium">كي نت أو بطاقة</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {bundleItems.length ? (
        <section className="mt-14" aria-labelledby="bundle-items">
          <h2 id="bundle-items" className="mb-4 text-[clamp(1.7rem,3vw,2.3rem)]">
            محتويات الباقة
          </h2>
          <ProductList products={bundleItems} ownedIds={owned} />
        </section>
      ) : null}

      {bundles.length ? (
        <section className="mt-14" aria-labelledby="in-bundles">
          <h2 id="in-bundles" className="text-[clamp(1.7rem,3vw,2.3rem)]">
            متوفر أيضًا ضمن باقة
          </h2>
          <p className="mt-1 mb-4 text-muted">الباقة تضم هذه المذكرة مع محتوى آخر. قارن ما تشمله قبل الاختيار.</p>
          <ProductList products={bundles} ownedIds={owned} />
        </section>
      ) : null}

      {/* شريط شراء ثابت على الجوال */}
      {!isOwned && product.status === "published" && !videosOff ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 md:hidden no-print">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="md" showPercent={false} className="shrink-0" />
            <AddToCart productId={product.id} compact className="flex-1" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
