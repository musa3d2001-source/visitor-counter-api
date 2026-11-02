"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, LoaderCircle, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, SkipBack, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { PlayerJsBridge } from "./playerjs";
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
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/75 p-4 text-center text-white" role="dialog" aria-live="polite" data-testid="next-countdown">
      <div>
        <p className="text-sm text-white/75">الدرس التالي خلال <span className="num font-bold">{left}</span> ثوانٍ</p>
        {nextTitle ? <p className="mt-1 text-lg font-bold">{nextTitle}</p> : null}
        <div className="mt-4 flex justify-center gap-2">
          <button className="rounded-xl bg-accent-600 px-4 py-2 font-semibold text-ink" onClick={() => router.push(nextHref)} data-testid="next-lesson-now">
            شاهد الآن
          </button>
          <button className="rounded-xl border border-white/40 px-4 py-2 font-semibold" onClick={onCancel}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
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
  const [waiting, setWaiting] = useState(true);
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
      className={cn("group/player relative aspect-video w-full overflow-hidden bg-black select-none", fullscreen ? "" : "rounded-2xl", !showControls && playing ? "cursor-none" : "")}
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
          const v = e.currentTarget;
          setDuration(v.duration || 0);
          v.playbackRate = speed;
          if (startAt > 3 && startAt < (v.duration || 0) - 5) v.currentTime = startAt;
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

      {watermark ? (
        <span className="pointer-events-none absolute end-3 top-3 z-10 text-[0.7rem] font-semibold text-white/30" aria-hidden>
          {watermark}
        </span>
      ) : null}

      {error ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 text-center text-white" role="alert">
          <div>
            <TriangleAlert className="mx-auto size-10 text-accent-600" aria-hidden />
            <p className="mt-3 font-bold">تعذر تشغيل الفيديو</p>
            <p className="mt-1 text-sm text-white/70">تحقق من اتصالك ثم أعد تحميل الصفحة. إن انتهت جلستك سجّل الدخول مجددًا.</p>
          </div>
        </div>
      ) : null}

      {waiting && !error && !ended ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" aria-hidden>
          <LoaderCircle className="size-10 animate-spin text-white/80" />
        </div>
      ) : null}

      {!playing && !ended && !error && !waiting ? (
        <button className="absolute inset-0 z-10 grid place-items-center" onClick={toggle} aria-label="تشغيل">
          <span className="grid size-16 place-items-center rounded-full bg-white/90 text-brand-700 shadow-lift transition hover:scale-105">
            <Play className="size-8 translate-x-0.5" fill="currentColor" aria-hidden />
          </span>
        </button>
      ) : null}

      {ended && nextHref ? <NextOverlay nextHref={nextHref} nextTitle={nextTitle ?? null} onCancel={() => setEnded(false)} /> : null}
      {ended && !nextHref ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 text-white">
          <button className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 font-semibold" onClick={() => videoRef.current && ((videoRef.current.currentTime = 0), void videoRef.current.play())}>
            <SkipBack className="size-5" aria-hidden /> إعادة المشاهدة
          </button>
        </div>
      ) : null}

      {/* شريط التحكم */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pt-8 pb-2 text-white transition-opacity duration-200",
          showControls || !playing ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        dir="ltr"
      >
        <div className="relative h-4">
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/25" aria-hidden>
            <div className="h-full rounded-full bg-white/35" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
          </div>
          <div className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent-600" style={{ width: `${pct}%` }} aria-hidden />
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
            className="absolute inset-0 h-4 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
        </div>
        <div className="mt-1 flex items-center gap-1 sm:gap-2">
          <button className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={toggle} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"} data-testid="play-toggle">
            {playing ? <Pause className="size-5" fill="currentColor" aria-hidden /> : <Play className="size-5" fill="currentColor" aria-hidden />}
          </button>
          <button className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={() => seekBy(-10)} aria-label="رجوع 10 ثوانٍ">
            <RotateCcw className="size-4.5" aria-hidden />
          </button>
          <button className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={() => seekBy(10)} aria-label="تقديم 10 ثوانٍ">
            <RotateCw className="size-4.5" aria-hidden />
          </button>
          <span className="num ms-1 text-xs tabular-nums sm:text-sm" data-testid="player-time">
            {clock(time)} / {clock(duration)}
          </span>
          <div className="ms-auto flex items-center gap-1">
            <div className="hidden items-center sm:flex">
              <button
                className="grid size-9 place-items-center rounded-lg hover:bg-white/15"
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
                className="w-20 accent-white"
              />
            </div>
            <div className="relative">
              <button
                className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold hover:bg-white/15"
                onClick={() => setSpeedOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                aria-label="سرعة التشغيل"
                data-testid="speed-menu"
              >
                <Gauge className="size-4.5" aria-hidden /> <span className="num">{speed}x</span>
              </button>
              {speedOpen ? (
                <div role="menu" className="absolute end-0 bottom-11 min-w-28 overflow-hidden rounded-xl bg-[#1f2526] py-1 shadow-lift" dir="rtl">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      role="menuitemradio"
                      aria-checked={s === speed}
                      className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-white/10", s === speed && "text-accent-600")}
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
            <button className="grid size-9 place-items-center rounded-lg hover:bg-white/15" onClick={toggleFullscreen} aria-label={fullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}>
              {fullscreen ? <Minimize className="size-4.5" aria-hidden /> : <Maximize className="size-4.5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// مشغل Bunny Stream: سرعة + جودات تلقائية متعددة + ملء الشاشة من المشغل نفسه
// ---------------------------------------------------------------------------
function BunnyPlayer({ lessonId, embedUrl, startAt, trackProgress, nextHref, nextTitle }: Props & { embedUrl: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ended, setEnded] = useState(false);
  const save = useProgressSaver(lessonId, trackProgress);

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
  }, [embedUrl, startAt, save]);

  return (
    <div data-testid="watch-player" data-kind="bunny" className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="مشغل الدرس"
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {ended && nextHref ? <NextOverlay nextHref={nextHref} nextTitle={nextTitle ?? null} onCancel={() => setEnded(false)} /> : null}
    </div>
  );
}
