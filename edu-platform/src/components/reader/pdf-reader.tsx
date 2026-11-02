"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, LoaderCircle, Maximize, Minus, Plus, TriangleAlert } from "lucide-react";
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
};

export function PdfReader({ src, title, backHref, backLabel, initialPage = 1, watermark, downloadHref, progressFileId, badge }: Props) {
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
        const status = (err as { status?: number })?.status;
        setError(
          status === 401
            ? "انتهت جلستك، سجّل الدخول مرة أخرى."
            : status === 403
              ? "لا تملك صلاحية فتح هذا الملف."
              : "تعذر فتح الملف. تحقق من اتصالك وحاول مرة أخرى.",
        );
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

  return (
    <div className="flex h-dvh flex-col bg-[#2b3233] select-none" onContextMenu={(e) => e.preventDefault()}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[#1f2526] px-2 text-white sm:px-4">
        <Link href={backHref} className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-white/10" aria-label={backLabel}>
          <ArrowRight className="size-5" aria-hidden />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-sm font-bold sm:text-base">{title}</h1>
          {badge ? <p className="text-[0.7rem] text-white/60">{badge}</p> : null}
        </div>
        {doc ? (
          <span className="num rounded-md bg-white/10 px-2 py-1 text-xs" aria-live="polite" data-testid="reader-pages">
            {current} / {doc.numPages}
          </span>
        ) : null}
        <div className="flex items-center">
          <button className="grid size-10 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-40" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} disabled={zoom <= 0.6} aria-label="تصغير">
            <Minus className="size-4.5" aria-hidden />
          </button>
          <button className="grid size-10 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-40" onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))} disabled={zoom >= 2.4} aria-label="تكبير">
            <Plus className="size-4.5" aria-hidden />
          </button>
          <button
            className="hidden size-10 place-items-center rounded-lg hover:bg-white/10 sm:grid"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
            aria-label="ملء الشاشة"
          >
            <Maximize className="size-4.5" aria-hidden />
          </button>
          {downloadHref ? (
            <a href={downloadHref} className="grid size-10 place-items-center rounded-lg hover:bg-white/10" aria-label="تنزيل الملف" data-testid="reader-download">
              <Download className="size-4.5" aria-hidden />
            </a>
          ) : null}
        </div>
      </header>

      <div ref={containerRef} className="reader-scroll flex-1 overflow-auto px-2 py-4" data-testid="reader">
        {error ? (
          <div className="mx-auto mt-16 max-w-sm rounded-lg bg-surface p-6 text-center text-ink" role="alert">
            <TriangleAlert className="mx-auto size-10 text-danger" aria-hidden />
            <p className="mt-3 font-semibold">{error}</p>
            <Link href={backHref} className="mt-4 inline-block text-sm font-semibold text-brand-700 underline">
              {backLabel}
            </Link>
          </div>
        ) : !doc ? (
          <div className="mt-24 flex flex-col items-center gap-3 text-white/80" role="status">
            <LoaderCircle className="size-8 animate-spin" aria-hidden />
            <p className="text-sm">جارٍ فتح الملف…</p>
          </div>
        ) : (
          <div className="mx-auto flex flex-col items-center gap-3" dir="ltr">
            {pages.map((n) => (
              <PdfPage key={n} doc={doc} n={n} width={pageWidth} ratio={ratio} watermark={watermark} onVisible={onVisible} />
            ))}
          </div>
        )}
      </div>
      <style>{`@media print { .reader-scroll { display: none !important; } }`}</style>
    </div>
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
      className="relative overflow-hidden bg-white shadow-lg"
      style={{ width, height: Math.round(width * ratio) }}
      aria-label={`صفحة ${n}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {!rendered ? <div className="absolute inset-0 animate-pulse bg-neutral-100" aria-hidden /> : null}
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
