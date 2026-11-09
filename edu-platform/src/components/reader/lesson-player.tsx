"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Gauge, LoaderCircle, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, SkipBack, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { PlayerJsBridge } from "./playerjs";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

type Props = {
  lessonId: string;
  kind: "file" | "bunny";
  src?: string;
  embedUrl?: string;
  startAt: number;
  trackProgress: boolean;
  watermark?: string;
  nextHref?: string | null;
  nextTitle?: string | null;
};

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** حفظ تقدم المشاهدة (مخنوق ~10 ثوانٍ، ويُرسل فورًا عند الإيقاف/الانتهاء) */
function useProgressSaver(lessonId: string, enabled: boolean) {
  const last = useRef({ at: 0, pos: -1, completed: false });
  return useCallback(
    (position: number, duration: number, force = false) => {
      if (!enabled || !Number.isFinite(position)) return;
      const completed = duration > 0 && position / duration >= 0.9;
      const now = Date.now();
      const becameCompleted = completed && !last.current.completed;
      if (!force && !becameCompleted && now - last.current.at < 10_000) return;
      if (!becameCompleted && Math.abs(position - last.current.pos) < 1 && !force) return;
      last.current = { at: now, pos: position, completed: last.current.completed || completed };
      void fetch(`/api/lessons/${lessonId}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: Math.floor(position), completed: last.current.completed }),
        keepalive: true,
      }).catch(() => {});
    },
    [lessonId, enabled],
  );
}

/** «٥ ثوانٍ» / «ثانيتين» / «ثانية واحدة» */
function secondsLabel(n: number): string {
  if (n === 1) return "ثانية واحدة";
  if (n === 2) return "ثانيتين";
  return `${ar(n)} ثوانٍ`;
}

/** عدّاد الانتقال التلقائي للدرس التالي (5 ثوانٍ قابلة للإلغاء) */
function NextOverlay({ nextHref, nextTitle, onCancel }: { nextHref: string; nextTitle: string | null; onCancel: () => void }) {
  const router = useRouter();
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (left <= 0) {
      router.push(nextHref);
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, nextHref, router]);
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="on-dark absolute inset-0 z-40 grid place-items-center overflow-y-auto p-3 text-center text-white backdrop-blur-sm sm:p-6"
      style={{ background: "radial-gradient(60% 80% at 50% 40%, rgb(10 107 102 / 0.5), transparent), rgb(4 24 28 / 0.88)" }}
      role="dialog"
      aria-live="polite"
      aria-label="الدرس التالي"
      data-testid="next-countdown"
    >
      <div className="flex max-w-md flex-col items-center">
        <span className="relative hidden size-14 place-items-center sm:grid" aria-hidden>
          <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
            <circle cx="26" cy="26" r={r} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="4" />
            <circle
              cx="26"
              cy="26"
              r={r}
              fill="none"
              stroke="#ffc531"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - left / 5)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
            />
          </svg>
          <span className="font-display text-xl font-black">{ar(Math.max(left, 0))}</span>
        </span>
        <p className="font-display text-[0.9rem] font-bold text-white/80 sm:mt-3">الدرس التالي خلال {secondsLabel(Math.max(left, 0))}</p>
        {nextTitle ? <p className="mt-1 line-clamp-2 font-display text-base leading-snug font-black sm:text-xl">{nextTitle}</p> : null}
        <div className="mt-3 flex justify-center gap-2 sm:mt-5">
          <button className="btn btn-3d btn-accent btn-sm sm:min-h-[2.875rem] sm:px-5 sm:text-base" onClick={() => router.push(nextHref)} data-testid="next-lesson-now">
            <Play className="fill-current" aria-hidden /> شاهد الآن
          </button>
          <button className="btn btn-sm bg-white/12 text-white ring-1 ring-white/25 hover:bg-white/20 sm:min-h-[2.875rem] sm:px-5 sm:text-base" onClick={onCancel}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

/** هوية المشاهد فوق المشغل: نفس العلامة في المشغلين، ولا تعترض لمسات المشغل تحتها */
function ViewerWatermark({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span className="pointer-events-none absolute end-3 top-3 z-10 text-[0.7rem] font-semibold text-white/30 sm:end-4 sm:top-4" aria-hidden data-testid="viewer-watermark">
      {text}
    </span>
  );
}

export function LessonPlayer(props: Props) {
  return props.kind === "bunny" && props.embedUrl ? <BunnyPlayer {...props} embedUrl={props.embedUrl} /> : <FilePlayer {...props} />;
}

// ---------------------------------------------------------------------------
// مشغل الملفات (المزود file): عناصر تحكم مخصصة حول <video>
// ---------------------------------------------------------------------------
function FilePlayer({ lessonId, src, startAt, trackProgress, watermark, nextHref, nextTitle }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useProgressSaver(lessonId, trackProgress);

  // تفضيل السرعة محفوظ لكل متصفح
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("player-speed"));
      if (SPEEDS.includes(v)) setSpeed(v);
    } catch {
      /* التخزين غير متاح */
    }
  }, []);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  // الاستكمال من آخر نقطة — يعمل حتى لو حُمّلت البيانات قبل اكتمال تهيئة React
  const resumed = useRef(false);
  const applyResume = useCallback(() => {
    const v = videoRef.current;
    if (!v || resumed.current || !Number.isFinite(v.duration) || v.duration <= 0) return;
    resumed.current = true;
    setDuration(v.duration);
    if (startAt > 1 && startAt < v.duration - 1) {
      v.currentTime = startAt;
      setTime(startAt);
    }
  }, [startAt]);
  useEffect(() => {
    const v = videoRef.current;
    if (v && v.readyState >= 1) applyResume();
    if (v && v.readyState >= 2) setWaiting(false);
  }, [applyResume]);

  const poke = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 2500);
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.2, v.currentTime + delta));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el?.requestFullscreen) {
      void el.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    } else {
      v?.webkitEnterFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(10);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-10);
      } else if (e.key === "f") {
        toggleFullscreen();
      } else if (e.key === "m" && videoRef.current) {
        videoRef.current.muted = !videoRef.current.muted;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seekBy, toggleFullscreen, poke]);

  // حفظ التقدم عند مغادرة الصفحة
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      if (v && v.currentTime > 0) save(v.currentTime, v.duration || 0, true);
    };
  }, [save]);

  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      data-testid="watch-player"
      data-kind="file"
      className={cn("group/player on-dark relative aspect-video w-full overflow-hidden bg-black select-none", fullscreen ? "" : "rounded-[1.1rem] sm:rounded-[1.5rem]", !showControls && playing ? "cursor-none" : "")}
      onContextMenu={(e) => e.preventDefault()}
      onMouseMove={poke}
      onTouchStart={poke}
    >
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full"
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onClick={toggle}
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = speed;
          applyResume();
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
          save(v.currentTime, v.duration || 0);
        }}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
          poke();
        }}
        onPause={(e) => {
          setPlaying(false);
          setShowControls(true);
          save(e.currentTarget.currentTime, e.currentTarget.duration || 0, true);
        }}
        onEnded={(e) => {
          setPlaying(false);
          setShowControls(true);
          save(e.currentTarget.duration || e.currentTarget.currentTime, e.currentTarget.duration || 0, true);
          setEnded(true);
        }}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onPlaying={() => setWaiting(false)}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        onError={() => setError(true)}
      />

      <ViewerWatermark text={watermark} />

      {error ? (
        <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-[rgb(4_24_28/0.9)] p-4 text-center text-white sm:p-6" role="alert">
          <div className="max-w-sm">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#ffc531] text-[#3d2a00] sm:size-14" aria-hidden>
              <TriangleAlert className="size-7" />
            </span>
            <p className="mt-3 font-display text-lg font-black">تعذر تشغيل الفيديو</p>
            <p className="mt-1 text-sm text-white/80">تحقق من اتصالك ثم أعد تحميل الصفحة. إن انتهت جلستك سجّل الدخول مجددًا.</p>
          </div>
        </div>
      ) : null}

      {waiting && !error && !ended ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" aria-hidden>
          <LoaderCircle className="size-10 animate-spin text-white/80" />
        </div>
      ) : null}

      {!playing && !ended && !error && !waiting ? (
        <button className="group/play absolute inset-0 z-10 grid place-items-center bg-black/10" onClick={toggle} aria-label="تشغيل">
          <span className="grid size-16 place-items-center rounded-full bg-white text-brand-600 shadow-[0_0_0_10px_rgb(255_255_255/0.22),0_18px_34px_-12px_rgb(0_0_0/0.6)] transition-transform group-hover/play:scale-105 motion-reduce:transition-none sm:size-20">
            <Play className="size-7 translate-x-0.5 sm:size-9" fill="currentColor" aria-hidden />
          </span>
        </button>
      ) : null}

      {ended && nextHref ? <NextOverlay nextHref={nextHref} nextTitle={nextTitle ?? null} onCancel={() => setEnded(false)} /> : null}
      {ended && !nextHref ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[rgb(4_24_28/0.8)] text-white">
          <button className="btn btn-3d btn-light btn-md" onClick={() => videoRef.current && ((videoRef.current.currentTime = 0), void videoRef.current.play())}>
            <SkipBack className="size-5" aria-hidden /> إعادة المشاهدة
          </button>
        </div>
      ) : null}

      {/* شريط التحكم */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 pt-10 pb-1.5 text-white transition-opacity duration-200 sm:px-4 sm:pb-2.5",
          showControls || !playing ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        dir="ltr"
      >
        <div className="relative mx-1 h-4">
          <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-white/25" aria-hidden>
            <div className="h-full rounded-full bg-white/35" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
          </div>
          <div className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#ffd25e,#ffc531)] shadow-[0_0_10px_rgb(255_197_49/0.6)]" style={{ width: `${pct}%` }} aria-hidden />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.target.value);
              setTime(Number(e.target.value));
            }}
            aria-label="شريط التقدم"
            aria-valuetext={`${clock(time)} من ${clock(duration)}`}
            className="absolute inset-0 h-4 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#ffc531] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#ffc531] [&::-webkit-slider-thumb]:shadow"
          />
        </div>
        <div className="mt-0.5 flex items-center gap-0.5 sm:gap-1.5">
          <button className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-white/15" onClick={toggle} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"} data-testid="play-toggle">
            {playing ? <Pause className="size-5" fill="currentColor" aria-hidden /> : <Play className="size-5" fill="currentColor" aria-hidden />}
          </button>
          <button className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-white/15" onClick={() => seekBy(-10)} aria-label="رجوع 10 ثوانٍ">
            <RotateCcw className="size-4.5" aria-hidden />
          </button>
          <button className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-white/15" onClick={() => seekBy(10)} aria-label="تقديم 10 ثوانٍ">
            <RotateCw className="size-4.5" aria-hidden />
          </button>
          <span className="num ms-1 rounded-full bg-black/35 px-2 py-0.5 text-xs font-semibold tabular-nums sm:text-sm" data-testid="player-time">
            {clock(time)} / {clock(duration)}
          </span>
          <div className="ms-auto flex items-center gap-1">
            <div className="hidden items-center sm:flex">
              <button
                className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-white/15"
                onClick={() => videoRef.current && (videoRef.current.muted = !videoRef.current.muted)}
                aria-label={muted ? "إلغاء كتم الصوت" : "كتم الصوت"}
              >
                {muted || volume === 0 ? <VolumeX className="size-4.5" aria-hidden /> : <Volume2 className="size-4.5" aria-hidden />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.volume = Number(e.target.value);
                  v.muted = Number(e.target.value) === 0;
                }}
                aria-label="مستوى الصوت"
                className="w-20 accent-[#ffc531]"
              />
            </div>
            <div className="relative">
              <button
                className="flex h-11 items-center gap-1 rounded-xl px-2 font-display text-sm font-extrabold transition-colors hover:bg-white/15"
                onClick={() => setSpeedOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                aria-label="سرعة التشغيل"
                data-testid="speed-menu"
              >
                <Gauge className="size-4.5" aria-hidden /> <span className="num">{speed}x</span>
              </button>
              {speedOpen ? (
                <div role="menu" className="absolute end-0 bottom-12 min-w-32 overflow-hidden rounded-2xl bg-[#0b2a2e] p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/15" dir="rtl">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      role="menuitemradio"
                      aria-checked={s === speed}
                      className={cn("flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 font-display text-sm font-bold hover:bg-white/10", s === speed && "bg-white/10 text-[#ffd25e]")}
                      onClick={() => {
                        setSpeed(s);
                        setSpeedOpen(false);
                        try {
                          localStorage.setItem("player-speed", String(s));
                        } catch {
                          /* التخزين غير متاح */
                        }
                      }}
                      data-testid={`speed-${s}`}
                    >
                      <span className="num">{s === 1 ? "عادية" : `${s}x`}</span>
                      {s === speed ? <span aria-hidden>✓</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-white/15" onClick={toggleFullscreen} aria-label={fullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}>
              {fullscreen ? <Minimize className="size-4.5" aria-hidden /> : <Maximize className="size-4.5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// مشغل Bunny Stream: سرعة + جودات تلقائية متعددة
//
// ملء الشاشة يُطلب على الحاوية لا على الإطار، حتى تبقى علامة هوية المشاهد ظاهرة كما في مشغل الملفات:
// لو مُنح الإطار ملء الشاشة لغطى الشاشة وحده واختفت العلامة، ولذلك لا نمنحه الإذن حيث يتوفر البديل.
// iPhone لا يدعم ملء الشاشة لعنصر، فيبقى الإذن عند المشغل (ويخرج الفيديو فيه من الصفحة كما يخرج في مشغل الملفات).
// الإذن يُقرأ عند تحميل الإطار، فالإطار يُرسم بعد معرفة قدرة المتصفح.
// ---------------------------------------------------------------------------
const subscribeNever = () => () => {};
const supportsElementFullscreen = () => Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);

function BunnyPlayer({ lessonId, embedUrl, startAt, trackProgress, watermark, nextHref, nextTitle }: Props & { embedUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ended, setEnded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const elementFullscreen = useSyncExternalStore(subscribeNever, supportsElementFullscreen, () => null);
  const save = useProgressSaver(lessonId, trackProgress);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(containerRef.current) && document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const bridge = new PlayerJsBridge(iframe);
    let lastPos = 0;
    let lastDur = 0;
    bridge.on("ready", () => {
      if (startAt > 3) bridge.setCurrentTime(startAt);
    });
    bridge.on("timeupdate", (v) => {
      const val = v as { seconds?: number; duration?: number } | undefined;
      lastPos = Number(val?.seconds ?? 0);
      lastDur = Number(val?.duration ?? 0);
      save(lastPos, lastDur);
    });
    bridge.on("pause", () => save(lastPos, lastDur, true));
    bridge.on("ended", () => {
      save(lastDur || lastPos, lastDur, true);
      setEnded(true);
    });
    return () => {
      if (lastPos > 0) save(lastPos, lastDur, true);
      bridge.destroy();
    };
  }, [embedUrl, startAt, save, elementFullscreen]);

  return (
    <div ref={containerRef} data-testid="watch-player" data-kind="bunny" className={cn("on-dark relative aspect-video w-full overflow-hidden bg-black", fullscreen ? "" : "rounded-[1.1rem] sm:rounded-[1.5rem]")}>
      {elementFullscreen === null ? null : (
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title="مشغل الدرس"
          className="absolute inset-0 h-full w-full border-0"
          allow={`accelerometer; gyroscope; autoplay; encrypted-media${elementFullscreen ? "" : "; fullscreen"}`}
          allowFullScreen={!elementFullscreen}
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      <ViewerWatermark text={watermark} />
      {elementFullscreen ? (
        <button
          type="button"
          className="absolute start-2 top-2 z-30 grid size-11 place-items-center rounded-xl bg-black/45 text-white transition-colors hover:bg-black/70 sm:start-3 sm:top-3"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
          data-testid="bunny-fullscreen"
        >
          {fullscreen ? <Minimize className="size-4.5" aria-hidden /> : <Maximize className="size-4.5" aria-hidden />}
        </button>
      ) : null}
      {ended && nextHref ? <NextOverlay nextHref={nextHref} nextTitle={nextTitle ?? null} onCancel={() => setEnded(false)} /> : null}
    </div>
  );
}
