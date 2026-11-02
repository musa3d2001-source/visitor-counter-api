/** تنسيق مدة الفيديو: 7:05 أو 1:02:30 */
export function formatClock(sec: number | null | undefined): string {
  if (!sec || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** مدة إجمالية مقروءة: «45 دقيقة»، «3 ساعات و10 دقائق»، «أقل من دقيقة» */
export function formatTotalDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  const minutes = Math.round(sec / 60);
  if (minutes < 1) return "أقل من دقيقة";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const mins = (n: number) => (n === 1 ? "دقيقة" : n === 2 ? "دقيقتان" : n <= 10 ? `${n} دقائق` : `${n} دقيقة`);
  const hours = (n: number) => (n === 1 ? "ساعة" : n === 2 ? "ساعتان" : n <= 10 ? `${n} ساعات` : `${n} ساعة`);
  if (!h) return mins(m);
  return m ? `${hours(h)} و${mins(m)}` : hours(h);
}

/** «3 دروس» بصياغة عربية صحيحة */
export function lessonsLabel(n: number): string {
  if (n === 1) return "درس واحد";
  if (n === 2) return "درسان";
  if (n >= 3 && n <= 10) return `${n} دروس`;
  return `${n} درسًا`;
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

/** صيغة العدد العربية: 1 مفرد، 2 مثنى، 3–10 جمع، 11+ مفرد منصوب */
export function arabicCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return `${forms.one} واحد`.replace(/ة واحد$/, "ة واحدة");
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}
