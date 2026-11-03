import { ar, count, W } from "@/lib/design";

/** تنسيق مدة الفيديو: 7:05 أو 1:02:30 (أرقام المشغّل اللاتينية) */
export function formatClock(sec: number | null | undefined): string {
  if (!sec || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** مدة إجمالية مقروءة: «٤٥ دقيقة»، «٣ ساعات و١٠ دقائق»، «أقل من دقيقة» */
export function formatTotalDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  if (sec < 60) return "أقل من دقيقة";
  const minutes = Math.round(sec / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return count(m, W.minute);
  return m ? `${count(h, W.hour)} و${count(m, W.minute)}` : count(h, W.hour);
}

/** «٣ دروس» بصياغة عربية صحيحة (انظر count في src/lib/design.ts) */
export function lessonsLabel(n: number): string {
  return count(n, W.lesson);
}

export function initials(name: string): string {
  const parts = name
    .replace(/^(الأستاذة|الأستاذ|أ\.|د\.|المعلمة|المعلم)\s*/u, "")
    .replace(/\([^)]*\)/gu, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.replace(/^ال/u, "")[0] ?? "")
    .join(" ");
}

/** صيغة العدد العربية: 1 مفرد، 2 مثنى، 3–10 جمع، 11+ مفرد منصوب (أرقام هندية عربية) */
export function arabicCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return `${forms.one} واحد`.replace(/ة واحد$/, "ة واحدة");
  if (n === 2) return forms.two;
  const m = n % 100;
  if (m >= 3 && m <= 10) return `${ar(n)} ${forms.few}`;
  if (m >= 11 && m <= 99) return `${ar(n)} ${forms.many}`;
  return `${ar(n)} ${forms.one}`;
}
