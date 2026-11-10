import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, BookOpenText, CalendarDays, Download, Eye, FileText, GraduationCap, Layers, Library, ListChecks, Lock, ShieldCheck, Sparkles, Shapes, Files } from "lucide-react";
import {
  getBundleItems,
  getBundlesContaining,
  getPlaylist,
  getProductBySlug,
  getProductFilesInfo,
  type ProductCard,
} from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/auth/session";
import { accessExpiry, accessibleProductIds, isTeacherOfProduct } from "@/server/access/entitlements";
import { sql } from "@/server/db";
import { VideoProductView, accessPeriodText } from "./video-view";
import { getSettings } from "@/server/platform/settings";
import { paymentPublicState } from "@/server/payments/public-state";
import { libraryNote, paymentClaims, productLibraryLine } from "@/lib/site-truth";
import { closedVideoProductIds } from "@/server/video/policy";
import { unsellableProductIds } from "@/server/commerce/cart";
import { env } from "@/server/env";
import { Alert } from "@/components/ui/alert";
import { ProductGrid } from "@/components/site/product-card";
import { AddToCart } from "@/components/site/add-to-cart";
import { SubjectIcon } from "@/components/art";
import { PRODUCT_TYPE_LABELS, PRODUCT_STATUS_LABELS, type ProductStatus } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { academicYearLabel, count, gradeClass, gradeLevelFromSlug, toneClass, W } from "@/lib/design";
import { GlassChip, HeroStat, HeroStats, ProductHero } from "./_components/hero";
import { BundleFanArt, NotePaperArt } from "./_components/hero-art";
import { MobileBuyBar, ProductUnavailableNotice, PurchasePanel, SaleEndedNotice, VideoClosedNotice, type TrustItem } from "./_components/purchase";
import { FactGrid, FileList, LearnList, SectionPanel, WideHead } from "./_components/sections";
import { aboutTitle, includesLabel, previewLabel, shortTermLabel } from "./_components/labels";

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

/** محتويات الباقات التي تضم المنتج: لتلوين أوراقها بموادها الحقيقية */
async function itemsOf(bundles: ProductCard[]) {
  const lists = await Promise.all(bundles.map((b) => getBundleItems(b.id)));
  return new Map(bundles.map((b, i) => [b.id, lists[i]]));
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  let product = await getProductBySlug(slug, { includeUnpublished: user?.role === "admin" || user?.role === "teacher" });
  // المعلم يعاين محتواه غير المنشور فقط
  if (product && product.status !== "published" && user?.role === "teacher" && !(await isTeacherOfProduct(user.id, product.id))) product = null;
  if (!product) notFound();

  const breadcrumbs = [
    { label: "الرئيسية", href: "/" },
    { label: product.gradeName, href: `/grades/${product.gradeSlug}` },
    ...(product.subjectName && product.subjectSlug ? [{ label: product.subjectName, href: `/grades/${product.gradeSlug}/${product.subjectSlug}` }] : []),
    { label: product.title },
  ];
  // فحص واحد لكل أنواع الفيديو والباقات التي تضم فيديو، وهو نفسه ما يمنع السلة والدفع
  const settings = await getSettings();
  const videoClosed = (await closedVideoProductIds(sql, [product.id], settings)).has(product.id);
  // الفحص نفسه الذي يمنع السلة والدفع: الصفحة لا تعرض زر شراء سيرفضه الخادم
  const unavailable = !videoClosed && !product.saleEnded && product.status === "published" && (await unsellableProductIds([product.id], sql, settings)).has(product.id);

  if (product.isVideo) {
    const [playlist, included, bundlesV, filesV, ownedV] = await Promise.all([
      getPlaylist(product.id),
      getBundleItems(product.id),
      getBundlesContaining(product.id),
      getProductFilesInfo(product.id),
      user ? accessibleProductIds(user.id) : Promise.resolve(new Set<string>()),
    ]);
    const bundleItemsV = await itemsOf(bundlesV);
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
      <div className="mx-auto max-w-7xl px-3 pt-4 pb-36 sm:px-6 lg:pb-16">
        {product.status !== "published" ? (
          <Alert tone="warning" className="mb-4" title={`معاينة قبل النشر، الحالة: ${PRODUCT_STATUS_LABELS[product.status as ProductStatus]}`}>
            هذه الصفحة غير ظاهرة للطلاب حتى يتم اعتماد المحتوى ونشره.
          </Alert>
        ) : null}
        <VideoProductView
          payment={paymentPublicState()}
          product={product}
          playlist={playlist}
          included={included}
          bundles={bundlesV}
          bundleItems={bundleItemsV}
          files={filesV}
          owned={ownedV}
          isOwned={ownedNow}
          ownedUntil={ownedUntil}
          resumeLessonId={resumeLessonId}
          watchedIds={watchedIds}
          canBuy={product.status === "published" && !product.saleEnded && !videoClosed && !unavailable}
          videoClosed={videoClosed}
          unavailable={unavailable}
          breadcrumbs={breadcrumbs}
        />
      </div>
    );
  }

  const [files, bundleItems, bundles] = await Promise.all([
    getProductFilesInfo(product.id),
    product.type === "bundle" ? getBundleItems(product.id) : Promise.resolve([]),
    product.type !== "bundle" ? getBundlesContaining(product.id) : Promise.resolve([]),
  ]);
  const [owned, bundleItemsById] = await Promise.all([user ? accessibleProductIds(user.id) : Promise.resolve(new Set<string>()), itemsOf(bundles)]);
  const isOwned = owned.has(product.id);
  const mainFiles = files.filter((f) => f.kind === "main");
  const preview = files.find((f) => f.kind === "preview");
  const totalPages = mainFiles.reduce((s, f) => s + (f.pageCount ?? 0), 0) || product.pageCount;
  const itemsValue = bundleItems.reduce((s, i) => s + i.priceFils, 0);
  const contents = product.contents.split("\n").map((l) => l.trim()).filter(Boolean);

  const isBundle = product.type === "bundle";
  const level = gradeLevelFromSlug(product.gradeSlug);
  const tone = isBundle ? gradeClass(level) : toneClass(product.subjectSlug);
  const typeLabel = PRODUCT_TYPE_LABELS[product.type];
  const term = shortTermLabel(product.term);
  const subjectsCount = new Set(bundleItems.map((i) => i.subjectSlug ?? i.subjectName ?? i.id)).size;
  const readOnly = !product.isDownloadable && !isBundle;
  const readingText = product.isDownloadable ? "قابلة للتنزيل والطباعة بعد الشراء" : readOnly ? "تُقرأ داخل المنصة، ولا تُنزّل" : null;
  const accessText = accessPeriodText(product);
  const paymentLine = paymentClaims(paymentPublicState()).productLine;
  const libraryLine = productLibraryLine(paymentPublicState(), isBundle);

  const trust: TrustItem[] = [
    ...(paymentLine ? [{ icon: <ShieldCheck aria-hidden />, text: paymentLine, bg: "#DEF8EE", fg: "#0A6F52" }] : []),
    ...(libraryLine ? [{ icon: <Library aria-hidden />, text: libraryLine, bg: "#FFF0C7", fg: "#6E4700" }] : []),
    ...(readingText ? [{ icon: product.isDownloadable ? <Download aria-hidden /> : <Lock aria-hidden />, text: readingText, bg: "#E8EEFF", fg: "#2B33B5" }] : []),
  ];

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
      availability: product.saleEnded ? "https://schema.org/Discontinued" : videoClosed || unavailable ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      url: new URL(`/products/${product.slug}`, env().APP_URL).toString(),
    },
  };

  const facts = [
    { k: "الصف", v: product.gradeName, icon: <GraduationCap />, tone: gradeClass(level) },
    { k: "المادة", v: product.subjectName ?? "عدة مواد", icon: <SubjectIcon slug={product.subjectSlug} size={18} />, tone: toneClass(product.subjectSlug) },
    ...(term ? [{ k: "الفصل الدراسي", v: term.replace("الفصل ", ""), icon: <CalendarDays />, tone: "tone-social" }] : []),
    ...(totalPages ? [{ k: "الصفحات", v: count(totalPages, W.page), icon: <FileText />, tone: "tone-english" }] : []),
    ...(isBundle && bundleItems.length ? [{ k: "المحتويات", v: count(bundleItems.length, W.product), icon: <Layers />, tone: "tone-english" }] : []),
    { k: "العام الدراسي", v: academicYearLabel(product.academicYear), icon: <CalendarDays />, tone: "tone-islamic" },
    ...(readingText ? [{ k: "طريقة القراءة", v: product.isDownloadable ? "تنزيل وطباعة" : "داخل المنصة", icon: product.isDownloadable ? <Download /> : <Lock />, tone: "tone-arabic" }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-3 pt-4 pb-36 sm:px-6 lg:pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {product.status !== "published" ? (
        <Alert tone="warning" className="mb-4" title={`معاينة قبل النشر، الحالة: ${PRODUCT_STATUS_LABELS[product.status as ProductStatus]}`}>
          هذه الصفحة غير ظاهرة للطلاب حتى يتم نشر المنتج.
        </Alert>
      ) : null}

      <ProductHero
        toneClass={tone}
        breadcrumbs={breadcrumbs}
        title={product.title}
        summary={product.summary}
        chips={
          <>
            <span className="chip chip-white">
              {isBundle ? <Layers aria-hidden /> : <FileText aria-hidden />}
              {typeLabel}
            </span>
            <GlassChip icon={<GraduationCap aria-hidden />}>{product.gradeName}</GlassChip>
            {product.subjectName ? <GlassChip icon={<SubjectIcon slug={product.subjectSlug} size={16} />}>{product.subjectName}</GlassChip> : null}
            {term ? <GlassChip>{term}</GlassChip> : null}
          </>
        }
        art={
          isBundle ? (
            <BundleFanArt level={level} items={bundleItems} priceFils={product.priceFils} compareAtPriceFils={isOwned || unavailable ? null : product.compareAtPriceFils} />
          ) : (
            <NotePaperArt
              subjectSlug={product.subjectSlug}
              subjectName={product.subjectName}
              typeLabel={typeLabel}
              gradeName={product.gradeName}
              pages={totalPages}
              previewPages={preview?.pageCount ?? null}
              hasPreview={!!preview && !isOwned}
              priceFils={product.priceFils}
              compareAtPriceFils={isOwned || unavailable ? null : product.compareAtPriceFils}
            />
          )
        }
      >
        <HeroStats>
          {totalPages ? <HeroStat icon={<FileText aria-hidden />}>{count(totalPages, W.page)}</HeroStat> : null}
          {mainFiles.length > 1 ? <HeroStat icon={<Files aria-hidden />}>{count(mainFiles.length, { one: "ملف", two: "ملفان", plural: "ملفات", acc: "ملفًا" })}</HeroStat> : null}
          {isBundle && bundleItems.length ? <HeroStat icon={<Layers aria-hidden />}>{includesLabel(bundleItems.length)}</HeroStat> : null}
          {isBundle && subjectsCount > 1 ? <HeroStat icon={<Shapes aria-hidden />}>{count(subjectsCount, W.subject)}</HeroStat> : null}
          {readingText ? <HeroStat icon={product.isDownloadable ? <Download aria-hidden /> : <Lock aria-hidden />}>{product.isDownloadable ? "تنزيل وطباعة" : "قراءة داخل المنصة"}</HeroStat> : null}
        </HeroStats>
      </ProductHero>

      <div className={`${tone} mt-8 grid gap-8 lg:mt-0 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_24.5rem]`}>
        <aside className="relative z-10 h-full lg:col-start-2 lg:row-start-1 lg:-mt-24 lg:me-6 xl:me-8" aria-label="الشراء">
          <div className="lg:sticky lg:top-24">
            <PurchasePanel
              toneClass={tone}
              typeIcon={isBundle ? <Layers aria-hidden /> : <FileText aria-hidden />}
              typeLabel={typeLabel}
              gradeName={[product.gradeName, product.subjectName].filter(Boolean).join(" · ")}
              priceFils={product.priceFils}
              compareAtPriceFils={product.compareAtPriceFils}
              bundleSaving={isBundle && itemsValue > product.priceFils ? { fils: itemsValue - product.priceFils, label: "مقارنة بشراء المذكرات منفردة" } : null}
              owned={isOwned ? { until: null, href: "/library", label: "افتح في مكتبتي", icon: <BookOpen aria-hidden /> } : null}
              buy={product.saleEnded ? <SaleEndedNotice /> : videoClosed ? <VideoClosedNotice /> : unavailable ? <ProductUnavailableNotice /> : product.status === "published" ? <AddToCart productId={product.id} /> : null}
              hidePrice={unavailable}
              preview={preview && !isOwned ? { href: `/preview/${preview.id}`, label: previewLabel(preview.pageCount), icon: <Eye aria-hidden />, testId: "free-preview" } : null}
              accessText={accessText}
              trust={videoClosed || unavailable ? [] : trust}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1 lg:pt-8">
          <SectionPanel id="details" title={`تفاصيل ${isBundle ? "الباقة" : typeLabel}`} icon={<ListChecks aria-hidden />}>
            <FactGrid facts={facts} />
          </SectionPanel>

          {contents.length ? (
            <SectionPanel id="contents" title="ماذا تحتوي" icon={<Sparkles aria-hidden />}>
              <LearnList items={contents} />
            </SectionPanel>
          ) : null}

          {product.description ? (
            <SectionPanel id="about" title={aboutTitle(product.type)} icon={<BookOpenText aria-hidden />}>
              <p className="max-w-[68ch] text-[1.05rem] leading-9 whitespace-pre-line text-ink-soft">{product.description}</p>
            </SectionPanel>
          ) : null}

          {mainFiles.length ? (
            <SectionPanel id="files" title="الملفات" icon={<Files aria-hidden />}>
              <FileList files={mainFiles.map((f) => ({ id: f.id, title: f.title, pages: f.pageCount ? count(f.pageCount, W.page) : null }))} />
            </SectionPanel>
          ) : null}

        </div>
      </div>

      {bundleItems.length ? (
        <section className="mt-16" aria-labelledby="bundle-items">
          <WideHead
            id="bundle-items"
            eyebrow={count(bundleItems.length, W.product)}
            eyebrowIcon={<Layers aria-hidden />}
            tone="eyebrow-violet"
            title="محتويات الباقة"
            sub={libraryNote(paymentPublicState(), "bundleContents") ?? undefined}
          />
          <ProductGrid products={bundleItems} ownedIds={owned} />
        </section>
      ) : null}

      {bundles.length ? (
        <section className="mt-16" aria-labelledby="in-bundles">
          <WideHead
            id="in-bundles"
            eyebrow="وفّر أكثر"
            eyebrowIcon={<Sparkles aria-hidden />}
            tone="eyebrow-gold"
            title="متوفر أيضًا ضمن باقة"
            sub="الباقة تضم هذه المذكرة مع محتوى آخر. قارن ما تشمله قبل الاختيار."
          />
          <ProductGrid products={bundles} ownedIds={owned} itemsById={bundleItemsById} />
        </section>
      ) : null}

      {/* شريط شراء ثابت على الجوال */}
      {!isOwned && product.status === "published" && !videoClosed && !product.saleEnded && !unavailable ? (
        <MobileBuyBar productId={product.id} priceFils={product.priceFils} compareAtPriceFils={product.compareAtPriceFils} accessText={accessText} />
      ) : null}
    </div>
  );
}
