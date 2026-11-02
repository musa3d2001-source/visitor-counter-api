"use client";

import { useEffect, useRef } from "react";

/** مشغل فيديو مناسب للجوال مع حفظ تقدم المشاهدة */
export function VideoPlayer({ lessonId, src, embedUrl, startAt, trackProgress, watermark }: { lessonId: string; src?: string; embedUrl?: string | null; startAt: number; trackProgress: boolean; watermark?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    const v = ref.current;
    if (!v || !trackProgress) return;
    const send = (completed = false) => {
      const pos = Math.floor(v.currentTime);
      if (!completed && Math.abs(pos - lastSent.current) < 10) return;
      lastSent.current = pos;
      void fetch(`/api/lessons/${lessonId}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: pos, completed }),
        keepalive: true,
      }).catch(() => {});
    };
    const onTime = () => send(false);
    const onPause = () => send(false);
    const onEnded = () => send(true);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [lessonId, trackProgress]);

  if (embedUrl) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe src={embedUrl} className="absolute inset-0 h-full w-full" allow="accelerometer; gyroscope; encrypted-media; picture-in-picture; fullscreen" allowFullScreen title="درس الفيديو" />
      </div>
    );
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black" onContextMenu={(e) => e.preventDefault()}>
      <video
        ref={ref}
        src={src}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        className="h-full w-full"
        onLoadedMetadata={(e) => {
          if (startAt > 5) e.currentTarget.currentTime = startAt;
        }}
      />
      {watermark ? <span className="pointer-events-none absolute end-3 top-3 text-xs text-white/35 select-none">{watermark}</span> : null}
    </div>
  );
}
