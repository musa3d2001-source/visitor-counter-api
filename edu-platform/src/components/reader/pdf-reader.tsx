"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpenText, Download, Eye, LoaderCircle, Maximize, Minus, Plus, ShieldCheck, ShoppingCart, TriangleAlert } from "lucide-react";
import { ar } from "@/lib/design";
import { Price } from "@/components/ui/price";
import { readerErrorMessage } from "@/lib/reader-error";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

/**
 * قارئ PDF مدمج ومتجاوب مبني على PDF.js:
 * - يرسم الصفحات عند ظهورها فقط (أداء أفضل على الأجهزة المتوسطة)
 * - طبقة علامة مائية فوق كل صفحة
 * - بدون طبقة نص قابلة للنسخ، وبدون زر تنزيل للمنتجات «للقراءة فقط»
 * - يحفظ آخر صفحة ويعيد الطالب إليها
 * ملاحظة: لا يمكن منع لقطات الشاشة أو التصوير الخارجي تمامًا في المتصفح؛ العلامة المائية تردع إعادة النشر.
 */
type Props = {
  src: string;
  title: string;
  backHref: string;
  backLabel: string;
  initialPage?: number;
  watermark?: string;
  downloadHref?: string | null;
  progressFileId?: string | null;
  badge?: string;
  /** شكل الشارة فقط: «preview» ذهبية للمعاينة، وغير ذلك فيروزية فاتحة */
  variant?: "preview" | "full";
  /**
   * زر إجراء اختياري في الشريط (مثل «اشترِ المذكرة» في المعاينة). shortLabel يظهر على الجوال.
   * في المعاينة يُعاد استخدامه في بطاقة «انتهت المعاينة» بعد آخر صفحة، مع السعر إن وُجد.
   */
  cta?: { href: string; label: string; shortLabel?: string; priceFils?: number | null; compareAtPriceFils?: number | null };
};

export function PdfReader({ src, title, backHref, backLabel, initialPage = 1, watermark, downloadHref, progressFileId, badge, variant = "full", cta }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(initialPage);
  const [width, setWidth] = useState(0);
  const lastSaved = useRef(initialPage);
  const scrolledInitially = useRef(false);

  // تحميل المستند
  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({
          url: src,
          httpHeaders: { "x-reader": "1" },
          withCredentials: true,
          disableAutoFetch: true,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
        });
        loadingTask = task;
        const loaded = await task.promise;
        if (cancelled) return;
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setRatio(vp.height / vp.width);
        setDoc(loaded);
      } catch (err) {
        setError(readerErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [src]);

  // عرض الحاوية (للتكيّف مع الشاشة)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // الانتقال لآخر صفحة محفوظة
  useEffect(() => {
    if (!doc || scrolledInitially.current || width === 0) return;
    scrolledInitially.current = true;
    if (initialPage > 1) {
      requestAnimationFrame(() => document.getElementById(`page-${initialPage}`)?.scrollIntoView({ block: "start" }));
    }
  }, [doc, width, initialPage]);

  // حفظ التقدم
  useEffect(() => {
    if (!progressFileId) return;
    const t = setTimeout(() => {
      if (current === lastSaved.current) return;
      lastSaved.current = current;
      void fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: progressFileId, page: current }),
        keepalive: true,
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [current, progressFileId]);

  const onVisible = useCallback((n: number) => setCurrent(n), []);

  const pageWidth = Math.max(240, Math.min(width - 16, 900) * zoom);
  const pages = doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : [];

  const zoomOut = () => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)));
  const zoomIn = () => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)));
  const progress = doc ? Math.min(100, Math.max(0, (current / doc.numPages) * 100)) : 0;
  const preview = variant === "preview";
  const dockBtn =
    "grid size-11 shrink-0 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/12 hover:text-white disabled:pointer-events-none disabled:opacity-35";

  return (
    <div className="flex h-dvh flex-col bg-[#0b2f2d] select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* شريط القراءة العلوي: فيروزي داكن بخط قوس قزح */}
      <header className="bg-teal-night on-dark relative z-10 shrink-0 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.6)]">
        <div className="flex h-16 items-center gap-2 px-2 sm:gap-3 sm:px-4">
          <Link
            href={backHref}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 font-display text-[0.92rem] font-bold text-white transition-colors hover:bg-white/18"
            aria-label={backLabel}
          >
            <ArrowRight className="size-5" aria-hidden />
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
          <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-[#ffd25e] to-[#eb9b00] text-[#3d2a00] shadow-[inset_0_-3px_0_rgb(0_0_0/0.15)] md:grid" aria-hidden>
            <BookOpenText className="size-5" />
          </span>
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate font-display text-[0.98rem] leading-snug font-extrabold text-white sm:text-[1.08rem]">{title}</h1>
            {badge ? (
              <p className={`mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 text-[0.72rem] leading-5 font-bold sm:text-[0.78rem] ${preview ? "bg-[#ffc531] text-[#3d2a00]" : "bg-white/12 text-[#bdf3ea]"}`}>
                {preview ? <Eye className="size-3.5 shrink-0" aria-hidden /> : <ShieldCheck className="size-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{badge}</span>
              </p>
            ) : null}
          </div>
          {cta ? (
            <Link href={cta.href} className="btn btn-3d btn-accent btn-sm min-h-11 shrink-0 px-3 sm:px-3.5">
              <ShoppingCart aria-hidden />
              {cta.shortLabel ? (
                <>
                  <span className="sm:hidden">{cta.shortLabel}</span>
                  <span className="hidden sm:inline">{cta.label}</span>
                </>
              ) : (
                cta.label
              )}
            </Link>
          ) : null}
          <button
            className="hidden size-11 shrink-0 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/12 sm:grid"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
            aria-label="ملء الشاشة"
          >
            <Maximize className="size-5" aria-hidden />
          </button>
          {downloadHref && !error ? (
            <a
              href={downloadHref}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-b from-[#ffd25e] to-[#f2ae12] text-[#3d2a00] shadow-[0_3px_0_#b77800] transition-transform active:translate-y-[2px] active:shadow-none"
              aria-label="تنزيل الملف"
              data-testid="reader-download"
            >
              <Download className="size-5" aria-hidden />
            </a>
          ) : null}
        </div>
        <span className="block h-[3px] bg-linear-to-l from-[#ff6b5a] via-[#ffc531] via-40% to-[#9b5cf6]" aria-hidden />
      </header>

      <div ref={containerRef} className="reader-scroll relative flex-1 overflow-auto px-2 pt-5 pb-28" data-testid="reader">
        <span className="pointer-events-none fixed inset-x-0 top-16 bottom-0 bg-[radial-gradient(rgb(255_255_255/0.05)_1.2px,transparent_1.5px)] bg-[length:22px_22px]" aria-hidden />
        {error ? (
          <div className="relative mx-auto mt-16 max-w-sm rounded-[1.75rem] bg-surface p-7 text-center text-ink shadow-pop" role="alert">
            <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-linear-to-br from-[#ffa07a] to-[#e8483f] text-white shadow-[0_5px_0_#b4322a]">
              <TriangleAlert className="size-8" aria-hidden />
            </span>
            <p className="mt-4 font-display text-[1.1rem] font-extrabold">{error}</p>
            <Link href={backHref} className="btn btn-3d btn-primary btn-md mt-5">
              <ArrowRight aria-hidden />
              {backLabel}
            </Link>
          </div>
        ) : !doc ? (
          <div className="relative mt-24 flex flex-col items-center gap-4 text-white/85" role="status">
            <span className="grid size-16 place-items-center rounded-[1.25rem] bg-white/10 ring-1 ring-white/15">
              <LoaderCircle className="size-8 animate-spin text-[#ffc531]" aria-hidden />
            </span>
            <p className="font-display text-[0.98rem] font-bold">جارٍ فتح الملف…</p>
          </div>
        ) : (
          <div className="relative mx-auto flex flex-col items-center gap-4" dir="ltr">
            {pages.map((n) => (
              <PdfPage key={n} doc={doc} n={n} width={pageWidth} ratio={ratio} watermark={watermark} onVisible={onVisible} />
            ))}
            {preview && cta ? <PreviewEndCard cta={cta} backHref={backHref} backLabel={backLabel} /> : null}
          </div>
        )}
      </div>

      {/* لوحة التحكم العائمة: تصغير، رقم الصفحة وشريط التقدم، تكبير */}
      {doc ? (
        <div className="on-dark pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/12 bg-[#06302e]/88 p-1.5 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.7)] backdrop-blur-md">
            <button className={dockBtn} onClick={zoomOut} disabled={zoom <= 0.6} aria-label="تصغير">
              <Minus className="size-5" aria-hidden />
            </button>
            <div className="flex min-w-[7.5rem] flex-col items-center px-2">
              <span className="flex items-baseline gap-1.5 font-display text-white">
                <span className="text-[0.75rem] font-bold text-white/70" aria-hidden>
                  صفحة
                </span>
                {/* العدّاد المرئي بالأرقام العربية الهندية مثل قراءة التكبير؛ النص المقروء لقارئ الشاشة في عنصر مخفي بصريًا */}
                <span className="num text-[1rem] font-black" aria-hidden>
                  {ar(current)} / {ar(doc.numPages)}
                </span>
                <span className="sr-only" aria-live="polite" data-testid="reader-pages">
                  صفحة {current} / {doc.numPages}
                </span>
              </span>
              <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-white/15" aria-hidden>
                <span className="block h-full rounded-full bg-linear-to-l from-[#ffd25e] to-[#ffc531] transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </span>
            </div>
            <span className="hidden min-w-12 text-center font-display text-[0.8rem] font-bold text-white/70 sm:block" aria-hidden>
              {ar(Math.round(zoom * 100))}٪
            </span>
            <button className={dockBtn} onClick={zoomIn} disabled={zoom >= 2.4} aria-label="تكبير">
              <Plus className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
      <style>{`@media print { .reader-scroll { display: none !important; } }`}</style>
    </div>
  );
}

/** بطاقة ختام المعاينة: تبيع مثل شاشة قفل الفيديو (العنوان، السعر، زر الشراء الذهبي، والعودة). */
function PreviewEndCard({
  cta,
  backHref,
  backLabel,
}: {
  cta: NonNullable<Props["cta"]>;
  backHref: string;
  backLabel: string;
}) {
  return (
    <section
      dir="rtl"
      aria-labelledby="preview-end-title"
      className="relative mt-6 mb-2 w-full max-w-md overflow-hidden rounded-[1.75rem] bg-surface p-6 text-center text-ink shadow-pop sm:p-8"
    >
      <span className="absolute inset-x-0 top-0 block h-[5px] bg-linear-to-l from-[#ff6b5a] via-[#ffc531] via-40% to-[#9b5cf6]" aria-hidden />
      <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-linear-to-br from-[#ffd25e] to-[#eb9b00] text-[#3d2a00] shadow-[0_5px_0_#b77800]" aria-hidden>
        <Eye className="size-8" />
      </span>
      <h2 id="preview-end-title" className="mt-4 font-display text-[1.4rem] leading-tight font-black">
        انتهت المعاينة
      </h2>
      <p className="mt-2 text-[0.98rem] leading-7 text-ink-soft">
        وصلت إلى آخر صفحة في المعاينة. النسخة الكاملة تظهر في «مكتبتي» فور تأكيد الدفع.
      </p>
      {cta.priceFils != null ? (
        <Price fils={cta.priceFils} compareAt={cta.compareAtPriceFils} size="lg" className="mt-4 justify-center" />
      ) : null}
      <div className="mt-5 flex flex-col gap-3">
        <Link href={cta.href} className="btn btn-3d btn-accent btn-lg w-full">
          <ShoppingCart aria-hidden />
          {cta.label}
        </Link>
        <Link href={backHref} className="btn btn-ghost btn-md w-full">
          <ArrowRight aria-hidden />
          {backLabel}
        </Link>
      </div>
    </section>
  );
}

function PdfPage({
  doc,
  n,
  width,
  ratio,
  watermark,
  onVisible,
}: {
  doc: PDFDocumentProxy;
  n: number;
  width: number;
  ratio: number;
  watermark?: string;
  onVisible: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [rendered, setRendered] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setNear(true);
        }
      },
      { rootMargin: "800px 0px" },
    );
    const vis = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.35) onVisible(n);
      },
      { threshold: [0.35, 0.6] },
    );
    io.observe(el);
    vis.observe(el);
    return () => {
      io.disconnect();
      vis.disconnect();
    };
  }, [n, onVisible]);

  useEffect(() => {
    if (!near || !canvasRef.current || rendered === width) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    (async () => {
      const page = await doc.getPage(n);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const canvas = canvasRef.current!;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
        if (!cancelled) setRendered(width);
      } catch {
        /* render cancelled */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, n, width, rendered]);

  return (
    <div
      id={`page-${n}`}
      ref={ref}
      className="relative overflow-hidden rounded-[4px] bg-white shadow-[0_18px_40px_-18px_rgb(0_0_0/0.7),0_0_0_1px_rgb(255_255_255/0.06)]"
      style={{ width, height: Math.round(width * ratio) }}
      aria-label={`صفحة ${ar(n)}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {!rendered ? <div className="absolute inset-0 animate-pulse bg-[#f4efe6]" aria-hidden /> : null}
      {watermark ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-around overflow-hidden opacity-[0.13]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="-rotate-[30deg] text-[clamp(10px,2.2vw,18px)] font-semibold whitespace-nowrap text-black">
              {watermark}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
