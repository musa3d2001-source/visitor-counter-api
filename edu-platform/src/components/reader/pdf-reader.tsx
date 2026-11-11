"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpenText, Download, Eye, LoaderCircle, Maximize, Minus, Plus, RotateCw, ShieldCheck, ShoppingCart, TriangleAlert } from "lucide-react";
import { ar } from "@/lib/design";
import { Price } from "@/components/ui/price";
import {
  FILE_BUSY_MESSAGE,
  FILE_PREPARING_MESSAGE,
  READER_DELIVERY_HEADER,
  READER_PAGE_FAILED_MESSAGE,
  answerFailure,
  fileAnswerKind,
  jitteredWaitMs,
  networkRetryDelaySeconds,
  readerErrorMessage,
  readerFailure,
  readerRetryDelaySeconds,
  type FileAnswer,
  type FileLinkAnswer,
} from "@/lib/reader-error";
import { PDF_READER_ASSETS, PDF_READER_ENGINE, PDF_READER_WORKER } from "@/lib/reader-assets";
import type { PDFDocumentProxy, PDFPageProxy, PDFWorker } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");

/**
 * محرك القارئ من /pdfjs/<الإصدار>/ لا من حزمة الموقع: نسخة pdf.js القديمة مجهزة لحد المتصفحات في reader-assets.ts (البند R018).
 * import وقت التشغيل من النطاق نفسه، يسمح به CSP لأن السكربت الذي يطلبه موثوق بـ nonce ('strict-dynamic').
 */
let engineLoad: Promise<PdfJs> | null = null;
let engineFailures = 0;
function loadReaderEngine(): Promise<PdfJs> {
  if (!engineLoad) {
    // تحميل تعثر لا يُعاد من ذاكرة الوحدات: زر «حاول مرة أخرى» يطلب الملف من جديد بعنوان مختلف
    const url = engineFailures ? `${PDF_READER_ENGINE}?retry=${engineFailures}` : PDF_READER_ENGINE;
    engineLoad = (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<PdfJs>).catch((err: unknown) => {
      engineLoad = null;
      engineFailures++;
      throw err;
    });
  }
  return engineLoad;
}

/** أقصى انتظار لفتح ملف وصل كاملًا، ولرسم صفحة واحدة. ما يتجاوزه متصفح علق، فيقال ذلك بدل دوّامة بلا نهاية */
const OPEN_DEADLINE_MS = 60_000;
const PAGE_RENDER_DEADLINE_MS = 60_000;
/** أكبر ملف تُحجز له ذاكرته مقدمًا من الطول المعلن. ما فوقه يُجمع قطعًا كما كان */
const MAX_PREALLOCATED_BYTES = 256 * 1024 * 1024;

/**
 * قارئ PDF مدمج ومتجاوب مبني على PDF.js:
 * - يرسم الصفحات القريبة من الشاشة فقط، ويحرر لوحات الرسم البعيدة (ملف من مئات الصفحات لا يملأ ذاكرة الهاتف)
 * - يحمّل المحرك والعامل مع الملف لا بعده، ويحجز للملف نسخة واحدة في الذاكرة (البند R020)
 * - يعيد المحاولة وحده حين يقول التطبيق إنه مشغول أو ترد منصة الاستضافة بانشغالها، بعد Retry-After وجزء عشوائي منه (البند R017)
 * - صفحة لم تُرسم تقول ذلك على الصفحة نفسها مع زر لإعادة رسمها، ولا تُنسب إلى الاتصال (القرار F27)
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
  /** libraryNote: جملة «تظهر في مكتبتي» من site-truth على الخادم، أو null حين لا يوجد دفع يُؤكَّد */
  cta?: { href: string; label: string; shortLabel?: string; priceFils?: number | null; compareAtPriceFils?: number | null; libraryNote?: string | null };
};

export function PdfReader({ src, title, backHref, backLabel, initialPage = 1, watermark, downloadHref, progressFileId, badge, variant = "full", cta }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ received: number; total: number | null }>({ received: 0, total: null });
  const [waiting, setWaiting] = useState<{ message: string; seconds: number } | null>(null);
  /** file: الملف يصل. engine: وصل الملف، والمحرك يفتحه */
  const [phase, setPhase] = useState<"file" | "engine">("file");
  const [attempt, setAttempt] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(initialPage);
  const [width, setWidth] = useState(0);
  const lastSaved = useRef(initialPage);
  const scrolledInitially = useRef(false);

  // تحميل المستند: الطلب بأيدينا لا بيد pdf.js، لنعرف نسبة التحميل ونقرأ Retry-After عند الانشغال
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    let worker: PDFWorker | null = null;
    setError(null);
    setDoc(null);
    setPhase("file");
    setLoaded({ received: 0, total: null });
    const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    // المحرك (نحو 150 KB مضغوطًا) والعامل (نحو 400 KB) يصلان أثناء تنزيل الملف لا بعده (البند R020)
    const engine = loadReaderEngine();
    const workerReady = engine.then((pdfjs) => {
      if (cancelled) return null;
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_READER_WORKER;
      worker = new pdfjs.PDFWorker();
      return worker;
    });
    // التعثر هنا يُقرأ حين يُنتظر بعد وصول الملف، لا قبله
    workerReady.catch(() => {});

    (async () => {
      try {
        let bytes: Uint8Array | null = null;
        // نسختك المحفوظة تصل رابطًا لدقيقة واحدة (القرار F22). إن تعذر اتباعه تُطلب مرة واحدة عبر الموقع نفسه
        let viaSite = false;
        // لكل نوع حدّه: انشغال التطبيق، وانشغال المنصة، وانقطاع الشبكة. التحويل إلى البث عبر الموقع لا يُحتسب منها
        const retried = { app: 0, platform: 0, network: 0 };
        const onProgress = (received: number, total: number | null) => {
          if (!cancelled) setLoaded({ received, total });
        };
        /** انقطاع في الشبكة (لا إلغاء): يُعاد مرة واحدة بعد ثانيتين وجزء عشوائي */
        const afterNetworkDrop = async (err: unknown) => {
          if (abort.signal.aborted) throw err;
          const wait = networkRetryDelaySeconds(retried.network++);
          if (wait === null) throw readerFailure({ stage: "network" }, err);
          await pause(jitteredWaitMs(wait));
        };
        while (!bytes) {
          let res: Response;
          try {
            res = await fetch(viaSite ? streamThroughSite(src) : src, { headers: { "x-reader": "1", [READER_DELIVERY_HEADER]: "url" }, credentials: "same-origin", signal: abort.signal });
          } catch (err) {
            await afterNetworkDrop(err);
            if (cancelled) return;
            continue;
          }
          if (!res.ok) {
            const answer = await readFileAnswer(res);
            const kind = fileAnswerKind(answer);
            const wait = kind === "final" ? null : readerRetryDelaySeconds(answer, retried[kind]);
            if (wait === null) throw answerFailure(answer);
            retried[kind as "app" | "platform"]++;
            setWaiting({ message: res.status === 429 ? FILE_PREPARING_MESSAGE : FILE_BUSY_MESSAGE, seconds: wait });
            await pause(jitteredWaitMs(wait));
            if (cancelled) return;
            setWaiting(null);
            continue;
          }
          try {
            if (!viaSite && (res.headers.get("content-type") ?? "").includes("application/json")) {
              const link = (await res.json().catch(() => ({}))) as Partial<FileLinkAnswer>;
              try {
                if (typeof link.url !== "string") throw new Error("no link");
                // بلا كوكي ولا عنوان الصفحة ولا ذاكرة متصفح: الرابط وحده هو الإذن، وعمره دقيقة
                const copy = await fetch(link.url, { credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: abort.signal });
                if (!copy.ok) throw new Error("link refused");
                bytes = await readWithProgress(copy, typeof link.size === "number" ? link.size : null, onProgress);
              } catch (err) {
                if (abort.signal.aborted) throw err;
                viaSite = true;
              }
              continue;
            }
            bytes = await readWithProgress(res, null, onProgress);
          } catch (err) {
            // انقطع التنزيل في منتصفه: الطلب كله يُعاد مرة واحدة
            await afterNetworkDrop(err);
            if (cancelled) return;
          }
        }
        if (cancelled) return;
        setPhase("engine");
        let pdfjs: PdfJs;
        let readyWorker: PDFWorker | null;
        try {
          [pdfjs, readyWorker] = await Promise.all([engine, workerReady]);
          // العامل جاهز فعلًا (ملفه وصل وبدأ): تعثره هنا محرك لم يعمل، لا ملف لم يُفتح
          if (readyWorker) await withDeadline(readyWorker.promise, OPEN_DEADLINE_MS);
        } catch (err) {
          throw readerFailure({ stage: "engine" }, err);
        }
        if (cancelled || !readyWorker) return;
        // الإصدار جزء من المسار: الملفات تُخزَّن سنة كاملة، والعامل يبقى مطابقًا للمكتبة بعد أي ترقية.
        // المصفوفة تُنقل إلى العامل كما هي (طولها طول ذاكرتها)، فلا تبقى منها نسخة ثانية هنا
        const task = pdfjs.getDocument({
          data: bytes,
          worker: readyWorker,
          cMapUrl: `${PDF_READER_ASSETS}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDF_READER_ASSETS}/standard_fonts/`,
          wasmUrl: `${PDF_READER_ASSETS}/wasm/`,
        });
        loadingTask = task;
        let loadedDoc: PDFDocumentProxy;
        let ratioOfFirst: number;
        try {
          loadedDoc = await withDeadline(task.promise, OPEN_DEADLINE_MS);
          const first = await withDeadline(loadedDoc.getPage(1), OPEN_DEADLINE_MS);
          const vp = first.getViewport({ scale: 1 });
          ratioOfFirst = vp.height / vp.width;
        } catch (err) {
          if ((err as { name?: string } | null)?.name === "PasswordException") throw err;
          throw readerFailure({ stage: "open" }, err);
        }
        if (cancelled) return;
        setRatio(ratioOfFirst);
        setDoc(loadedDoc);
      } catch (err) {
        if (cancelled) return;
        setWaiting(null);
        setError(readerErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
      void loadingTask?.destroy();
      // العامل المعطى لـ getDocument لا يُغلق مع المستند، فيُغلق هنا
      (worker as PDFWorker | null)?.destroy();
    };
  }, [src, attempt]);

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
      requestAnimationFrame(() => {
        const el = containerRef.current;
        const list = listRef.current;
        if (!el || !list) return;
        const h = Math.round(Math.max(240, Math.min(el.clientWidth - 16, 900)) * ratio) + PAGE_GAP;
        el.scrollTop = list.offsetTop + (Math.min(initialPage, doc.numPages) - 1) * h;
      });
    }
  }, [doc, width, initialPage, ratio]);

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

  const pageWidth = Math.max(240, Math.min(width - 16, 900) * zoom);
  const pageHeight = Math.round(pageWidth * ratio);
  const stride = pageHeight + PAGE_GAP;
  const numPages = doc?.numPages ?? 0;
  // الصفحات المرسومة: ما يظهر على الشاشة وصفحتان قبله وبعده. البقية مساحة فارغة بلا لوحة رسم
  const [range, setRange] = useState({ first: 1, last: 3 });

  const measure = useCallback(() => {
    const el = containerRef.current;
    const list = listRef.current;
    if (!el || !list || !numPages || stride <= 0) return;
    const top = el.scrollTop - list.offsetTop;
    const first = Math.min(numPages, Math.max(1, Math.floor(top / stride) + 1 - PAGE_BUFFER));
    const last = Math.min(numPages, Math.max(first, Math.ceil((top + el.clientHeight) / stride) + PAGE_BUFFER));
    setRange((r) => (r.first === first && r.last === last ? r : { first, last }));
    setCurrent(Math.min(numPages, Math.max(1, Math.floor((top + el.clientHeight * 0.35) / stride) + 1)));
  }, [numPages, stride]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !numPages) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [measure, numPages]);

  const pages = doc ? Array.from({ length: Math.max(0, Math.min(range.last, numPages) - range.first + 1) }, (_, i) => range.first + i) : [];

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
          <Link prefetch={false}
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
            <Link prefetch={false} href={cta.href} className="btn btn-3d btn-accent btn-sm min-h-11 shrink-0 px-3 sm:px-3.5">
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
            <div className="mt-5 flex flex-col gap-3">
              <button type="button" className="btn btn-3d btn-accent btn-md w-full" onClick={() => setAttempt((n) => n + 1)} data-testid="reader-retry">
                <RotateCw aria-hidden />
                حاول مرة أخرى
              </button>
              <Link prefetch={false} href={backHref} className="btn btn-3d btn-primary btn-md w-full">
                <ArrowRight aria-hidden />
                {backLabel}
              </Link>
            </div>
          </div>
        ) : !doc ? (
          <div className="relative mt-24 flex flex-col items-center gap-4 text-white/85" role="status">
            <span className="grid size-16 place-items-center rounded-[1.25rem] bg-white/10 ring-1 ring-white/15">
              <LoaderCircle className="size-8 animate-spin text-[#ffc531]" aria-hidden />
            </span>
            {waiting ? (
              <p className="max-w-xs text-center font-display text-[0.98rem] leading-7 font-bold" data-testid="reader-waiting">
                {waiting.message}
              </p>
            ) : phase === "engine" ? (
              <p className="font-display text-[0.98rem] font-bold" data-testid="reader-loading">
                وصل الملف، نجهز صفحاته…
              </p>
            ) : (
              <p className="font-display text-[0.98rem] font-bold" data-testid="reader-loading">
                جارٍ فتح الملف…
                {loaded.total ? <span className="num ms-1.5 text-[#ffc531]">{ar(Math.min(100, Math.floor((loaded.received / loaded.total) * 100)))}٪</span> : null}
              </p>
            )}
            {loaded.total && !waiting && phase === "file" ? (
              <span className="block h-1.5 w-48 overflow-hidden rounded-full bg-white/15" aria-hidden>
                <span className="block h-full rounded-full bg-linear-to-l from-[#ffd25e] to-[#ffc531] transition-[width] duration-300" style={{ width: `${Math.min(100, (loaded.received / loaded.total) * 100)}%` }} />
              </span>
            ) : null}
          </div>
        ) : (
          <div className="relative mx-auto flex flex-col items-center" dir="ltr">
            <div ref={listRef} className="relative" style={{ width: pageWidth, height: numPages * stride - PAGE_GAP }}>
              {pages.map((n) => (
                <PdfPage key={n} doc={doc} n={n} width={pageWidth} height={pageHeight} top={(n - 1) * stride} watermark={watermark} />
              ))}
            </div>
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
        وصلت إلى آخر صفحة في المعاينة.{cta.libraryNote ? ` ${cta.libraryNote}` : null}
      </p>
      {cta.priceFils != null ? (
        <Price fils={cta.priceFils} compareAt={cta.compareAtPriceFils} size="lg" className="mt-4 justify-center" />
      ) : null}
      <div className="mt-5 flex flex-col gap-3">
        <Link prefetch={false} href={cta.href} className="btn btn-3d btn-accent btn-lg w-full">
          <ShoppingCart aria-hidden />
          {cta.label}
        </Link>
        <Link prefetch={false} href={backHref} className="btn btn-ghost btn-md w-full">
          <ArrowRight aria-hidden />
          {backLabel}
        </Link>
      </div>
    </section>
  );
}

/** المسافة بين الصفحات، وعدد الصفحات المرسومة قبل الظاهر وبعده */
const PAGE_GAP = 16;
const PAGE_BUFFER = 2;

/** الطلب نفسه عبر الموقع، ببايتات تمر بالخادم بدل الرابط: لشبكة تحجب التخزين أو رابط انتهى قبل أن يبدأ التنزيل */
function streamThroughSite(src: string): string {
  const url = new URL(src, window.location.href);
  url.searchParams.set("via", "stream");
  return `${url.pathname}${url.search}`;
}

/** رد غير ناجح كما يحتاجه القرار: هل هو JSON من التطبيق، أم صفحة خطأ من منصة الاستضافة */
async function readFileAnswer(res: Response): Promise<FileAnswer> {
  const text = await res.text().catch(() => "");
  let body: FileAnswer["body"] = {};
  let appJson = false;
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string") {
        body = parsed as FileAnswer["body"];
        appJson = true;
      }
    } catch {
      /* ليس JSON التطبيق */
    }
  }
  return { status: res.status, retryAfter: res.headers.get("retry-after"), appJson, platformError: res.headers.get("x-vercel-error"), body };
}

/**
 * يقرأ الجسم كله مع نسبة التحميل. حين يُعرف الطول (Content-Length، أو حجم النسخة في جواب الرابط) تُحجز مصفوفة واحدة
 * بحجمه وتُملأ مباشرة، فلا تجتمع في ذاكرة الهاتف القطع ونسختها المجمعة معًا (البند R020). ما جاء أكبر مما قيل يكمل قطعًا.
 */
async function readWithProgress(res: Response, expected: number | null, onProgress: (received: number, total: number | null) => void): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  const total = Number.isFinite(declared) && declared > 0 ? declared : expected !== null && expected > 0 ? expected : null;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  let out: Uint8Array | null = total !== null && total <= MAX_PREALLOCATED_BYTES ? new Uint8Array(total) : null;
  let chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (out && received + value.byteLength > out.byteLength) {
      chunks = [out.subarray(0, received)];
      out = null;
    }
    if (out) out.set(value, received);
    else chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }
  if (out) return received === out.byteLength ? out : out.slice(0, received);
  const joined = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.byteLength;
  }
  return joined;
}

/** وعد لا ينتهي خلال المهلة يُعامل كتعثر: متصفح علق في فتح الملف أو رسم صفحة */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("reader deadline")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * صفحة واحدة. تُرسم حين تُركَّب (القائمة تركّب القريب من الشاشة فقط)، وتحرر لوحة الرسم وموارد الصفحة
 * حين تبتعد فتُزال، فلا تتراكم لوحات بدقة 2x لكل صفحة مرت بها العين. تغيير التكبير يعيد رسم المركَّب فقط.
 */
function PdfPage({ doc, n, width, height, top, watermark }: { doc: PDFDocumentProxy; n: number; width: number; height: number; top: number; watermark?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(0);
  /** الرسم تعثر أو علق: يقال على الصفحة نفسها، وزرها يعيد الرسم */
  const [failed, setFailed] = useState(false);
  const [redraw, setRedraw] = useState(0);

  useEffect(() => {
    if (!canvasRef.current || rendered === width) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    const giveUp = () => {
      if (cancelled) return;
      cancelled = true;
      task?.cancel();
      setFailed(true);
    };
    const watchdog = setTimeout(giveUp, PAGE_RENDER_DEADLINE_MS);
    (async () => {
      try {
        const page = await doc.getPage(n);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, viewport });
        await task.promise;
        if (cancelled) return;
        setFailed(false);
        setRendered(width);
      } catch (err) {
        // الإلغاء (تمرير بعيدًا أو تكبير) ليس تعثرًا. أي خطأ آخر يُرى، لا يُبلع فتبقى الصفحة فارغة
        if ((err as { name?: string } | null)?.name === "RenderingCancelledException") return;
        giveUp();
      } finally {
        clearTimeout(watchdog);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      task?.cancel();
    };
  }, [doc, n, width, rendered, redraw]);

  // عند الإزالة: لوحة بحجم صفر تحرر ذاكرتها فورًا، و cleanup يحرر موارد الصفحة في pdf.js
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      void doc
        .getPage(n)
        .then((page) => page.cleanup())
        .catch(() => {});
    };
  }, [doc, n]);

  return (
    <div
      id={`page-${n}`}
      className="absolute start-0 overflow-hidden rounded-[4px] bg-white shadow-[0_18px_40px_-18px_rgb(0_0_0/0.7),0_0_0_1px_rgb(255_255_255/0.06)]"
      style={{ width, height, top }}
      aria-label={`صفحة ${ar(n)}`}
      data-testid="reader-page"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {failed ? (
        <div dir="rtl" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#f4efe6] px-5 text-center text-ink" role="alert" data-testid="reader-page-failed">
          <TriangleAlert className="size-7 text-[#c2410c]" aria-hidden />
          <p className="max-w-xs font-display text-[0.98rem] leading-7 font-bold">
            {READER_PAGE_FAILED_MESSAGE} حدّث المتصفح أو افتح الملف من Safari أو Chrome إن تكرر ذلك.
          </p>
          <button
            type="button"
            className="btn btn-3d btn-accent btn-sm min-h-11"
            onClick={() => {
              setFailed(false);
              setRendered(0);
              setRedraw((r) => r + 1);
            }}
            data-testid="reader-page-retry"
          >
            <RotateCw aria-hidden />
            أعد عرض الصفحة
          </button>
        </div>
      ) : !rendered ? (
        <div className="absolute inset-0 animate-pulse bg-[#f4efe6]" aria-hidden />
      ) : null}
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
