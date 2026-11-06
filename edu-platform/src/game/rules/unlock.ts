/**
 * الفتح (GAME_DESIGN.md §8):
 *  - المستوى مكتمل بنجمة الإتمام أو qonly_passed.
 *  - أول درس منشور في الوحدة مفتوح دائمًا، وغيره يُفتح باكتمال أقرب درس منشور قبله (غير المنشور يُتجاوز ولا يُفتح أبدًا).
 *  - تحدّي الوحدة يُفتح باكتمال كل دروسها المنشورة (ودرس منشور واحد على الأقل).
 */
import { STAR } from "./stars";

export type UnlockLevel = { id: string; unitId: string; order: number; kind: "lesson" | "challenge"; published: boolean };
export type LevelProgress = { starsMask: number; qonlyPassed: boolean };

export function isComplete(p: LevelProgress | undefined): boolean {
  if (!p) return false;
  return (p.starsMask & STAR.completion) !== 0 || p.qonlyPassed === true;
}

/** قراءة آمنة من سجل (لا تلتقط مفاتيح النموذج الأولي مثل constructor) */
function progressOf(progress: Readonly<Record<string, LevelProgress>>, id: string): LevelProgress | undefined {
  return Object.prototype.hasOwnProperty.call(progress, id) ? progress[id] : undefined;
}

/** ترتيب ثابت: order ثم المعرّف، فلا يتأثر الناتج بترتيب المدخلات */
function byOrder(a: UnlockLevel, b: UnlockLevel): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function unlockedLevelIds(levels: readonly UnlockLevel[], progress: Readonly<Record<string, LevelProgress>>): Set<string> {
  const units = new Map<string, UnlockLevel[]>();
  for (const l of levels) {
    const list = units.get(l.unitId);
    if (list) list.push(l);
    else units.set(l.unitId, [l]);
  }

  const open = new Set<string>();
  for (const list of units.values()) {
    const lessons = list.filter((l) => l.kind === "lesson" && l.published).sort(byOrder);
    let prevComplete = true; // أول درس منشور مفتوح دائمًا
    let allComplete = lessons.length > 0;
    for (const l of lessons) {
      if (prevComplete) open.add(l.id);
      prevComplete = isComplete(progressOf(progress, l.id));
      if (!prevComplete) allComplete = false;
    }
    if (allComplete) {
      for (const c of list) if (c.kind === "challenge" && c.published) open.add(c.id);
    }
  }
  return open;
}
