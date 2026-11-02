/**
 * توليد مقاطع فيديو اختبارية صغيرة (VP9 داخل MP4 — قابلة للتشغيل في Chromium بدون ترميزات مملوكة).
 * تُخزن مؤقتًا في tests/.tmp/videos. إن لم يتوفر ffmpeg تُعيد null ويجب تخطي الاختبار.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(__dirname, "../.tmp/videos");

let ffmpegChecked: boolean | null = null;
export function hasFfmpeg(): boolean {
  if (ffmpegChecked !== null) return ffmpegChecked;
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" });
    ffmpegChecked = true;
  } catch {
    ffmpegChecked = false;
  }
  return ffmpegChecked;
}

/** يعيد مسار ملف MP4 بمدة محددة (ثوانٍ) أو null إن تعذر التوليد */
export function makeVideoFile(seconds = 4, label = "clip"): string | null {
  if (!hasFfmpeg()) return null;
  mkdirSync(DIR, { recursive: true });
  const file = join(DIR, `${label}-${seconds}s.mp4`);
  if (existsSync(file)) return file;
  try {
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=320x240:rate=15`,
        "-c:v", "libvpx-vp9", "-b:v", "200k", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        file,
      ],
      { stdio: "ignore", timeout: 60_000 },
    );
    return existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

export function makeVideoBytes(seconds = 4, label = "clip"): Uint8Array | null {
  const f = makeVideoFile(seconds, label);
  return f ? new Uint8Array(readFileSync(f)) : null;
}
