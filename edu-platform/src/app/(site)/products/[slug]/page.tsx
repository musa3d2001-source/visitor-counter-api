import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CircleCheck, Download, Eye, FileText, Lock, PlayCircle, ShieldCheck } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Alert } from "@/components/ui/alert";
import { ProductCover } from "@/components/site/product-cover";
import { ProductGrid } from "@/components/site/product-card";
import { AddToCart } from "@/components/site/add-to-cart";
import { PRODUCT_TYPE_LABELS, PRODUCT_STATUS_LABELS, termLabel, type ProductStatus } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return { title: "المنتج غير متاح" };
  const description = p.summary || `${PRODUCT_TYPE_LABELS[p.type]} ${p.subjectName ?? ""} — ${p.gradeName}`;
  return {
    title: p.title,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { title: p.title, description, images: p.coverUrl ? [{ url: p.coverUrl }] : undefined },
  };
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
          <Alert tone="warning" className="mt-4" title={`معاينة — الحالة: ${PRODUCT_STATUS_LABELS[product.status as ProductStatus]}`}>
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
        <Alert tone="warning" className="mt-4" title={`معاينة المدير — الحالة: ${PRODUCT_STATUS_LABELS[product.status as ProductStatus]}`}>
          هذه الصفحة غير ظاهرة للطلاب حتى يتم نشر المنتج.
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,340px)_1fr] lg:gap-12">
        <div className="mx-auto w-full max-w-[230px] md:max-w-[340px]">
          <div className="overflow-hidden rounded-3xl border border-line shadow-lift">
            <ProductCover coverUrl={product.coverUrl} title={product.title} type={product.type} subjectName={product.subjectName} gradeName={product.gradeName} priority sizes="340px" />
          </div>
          {preview && !isOwned ? (
            <Button asChild variant="secondary" size="lg" className="mt-4 w-full">
              <Link href={`/preview/${preview.id}`} data-testid="free-preview">
                <Eye aria-hidden /> معاينة مجانية ({preview.pageCount ?? ""} صفحات)
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge>{PRODUCT_TYPE_LABELS[product.type]}</Badge>
            {product.isDownloadable ? (
              <Badge tone="success">
                <Download className="size-3.5" aria-hidden /> قابل للتنزيل والطباعة
              </Badge>
            ) : product.type !== "bundle" && product.type !== "video_course" ? (
              <Badge tone="neutral">
                <Lock className="size-3.5" aria-hidden /> للقراءة داخل المنصة
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl leading-[1.5] font-bold sm:text-3xl">{product.title}</h1>
          {product.summary ? <p className="mt-2 text-lg leading-8 text-ink-soft">{product.summary}</p> : null}

          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              { k: "الصف", v: product.gradeName },
              { k: "المادة", v: product.subjectName ?? "عدة مواد" },
              { k: "الفصل", v: termLabel(product.term) },
              { k: "العام الدراسي", v: product.academicYear.replace("-", " / ") },
            ].map((d) => (
              <div key={d.k} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                <dt className="text-xs text-muted">{d.k}</dt>
                <dd className="mt-0.5 font-semibold">{d.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="lg" />
            {product.type === "bundle" && itemsValue > product.priceFils ? (
              <p className="mt-1 text-sm font-semibold text-success">
                توفّر <span className="num">{filsToKwdString(itemsValue - product.priceFils)}</span> د.ك مقارنة بشراء المذكرات منفردة
              </p>
            ) : null}
            <div className="mt-4">
              {isOwned ? (
                <div className="flex flex-col gap-3">
                  <Alert tone="success">هذا المنتج موجود في مكتبتك.</Alert>
                  <Button asChild size="lg">
                    <Link href="/library">
                      <BookOpen aria-hidden /> افتح في مكتبتي
                    </Link>
                  </Button>
                </div>
              ) : videosOff ? (
                <Alert tone="info">دروس الفيديو ستتوفر قريبًا.</Alert>
              ) : product.status === "published" ? (
                <AddToCart productId={product.id} />
              ) : null}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-success" aria-hidden /> دفع آمن عبر كي نت والبطاقات</li>
              <li className="flex items-center gap-1.5"><CircleCheck className="size-4 text-success" aria-hidden /> تظهر في مكتبتك فور تأكيد الدفع</li>
            </ul>
          </div>

          {product.description ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold">عن {PRODUCT_TYPE_LABELS[product.type]}</h2>
              <p className="mt-2 leading-8 whitespace-pre-line text-ink-soft">{product.description}</p>
            </section>
          ) : null}

          {contents.length ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold">ماذا تحتوي؟</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {contents.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-ink-soft">
                    <CircleCheck className="mt-1 size-4 shrink-0 text-brand-600" aria-hidden /> {c}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {mainFiles.length ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold">
                الملفات {totalPages ? <span className="text-sm font-normal text-muted">(<span className="num">{totalPages}</span> صفحة)</span> : null}
              </h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {mainFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <FileText className="size-5 text-brand-600" aria-hidden />
                    <span className="flex-1 font-semibold">{f.title}</span>
                    {f.pageCount ? <span className="text-muted"><span className="num">{f.pageCount}</span> صفحة</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {lessons.length ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold">الدروس ({lessons.length})</h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <PlayCircle className="size-5 text-brand-600" aria-hidden />
                    <div className="flex-1">
                      {l.unitTitle ? <p className="text-xs text-muted">{l.unitTitle}</p> : null}
                      <p className="font-semibold">{l.title}</p>
                    </div>
                    {l.isFreePreview ? <Badge tone="success">مجاني</Badge> : <Lock className="size-4 text-muted" aria-label="مدفوع" />}
                    <span className="num text-muted">{formatDuration(l.durationSeconds)}</span>
                  </li>
                ))}
              </ul>
              {freeLesson && settings.videos_enabled ? (
                <Button asChild variant="secondary" className="mt-3">
                  <Link href={`/watch/${product.id}?lesson=${freeLesson.id}`}>
                    <PlayCircle aria-hidden /> شاهد الدرس المجاني
                  </Link>
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {bundleItems.length ? (
        <section className="mt-14">
          <h2 className="mb-5 text-2xl font-bold">محتويات الباقة ({bundleItems.length})</h2>
          <ProductGrid products={bundleItems} ownedIds={owned} />
        </section>
      ) : null}

      {bundles.length ? (
        <section className="mt-14">
          <h2 className="mb-1 text-2xl font-bold">وفّر أكثر مع الباقات</h2>
          <p className="mb-5 text-sm text-muted">هذه المذكرة مضمّنة في الباقات التالية</p>
          <ProductGrid products={bundles} ownedIds={owned} />
        </section>
      ) : null}

      {/* شريط شراء ثابت على الجوال */}
      {!isOwned && product.status === "published" && !videosOff ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur md:hidden no-print">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="md" className="shrink-0" />
            <AddToCart productId={product.id} compact className="flex-1" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
