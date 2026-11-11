import "server-only";
import { STAMP_TRANSFER_MEMORY_BYTES } from "@/lib/pdf-limits";
import { stampBusyRefusal } from "./stamp-gate";

/**
 * عدّاد البايتات التي تمسكها هذه النسخة خارج الختم نفسه (البندان R007 و R016): الأصل بعد قراءته من التخزين،
 * والنسخة المختومة حتى يكتمل رفعها، والنسخة التي تُبث من الذاكرة حين تعذر حفظها حتى يُغلق بثها أو يُلغى.
 * الحجز قبل القراءة: ما لا يتسع يُرفض فورًا بـ StampBusyError (503 مع Retry-After) ولا يُقرأ شيء.
 * لكل نسخة عدّادها، كما مكان الختم: ذاكرة كل نسخة منفصلة، فلا حاجة لاتفاق بين النسخ.
 * الحجز الأول على نسخة فارغة يُقبل دائمًا، حتى لا يُرفض ملف واحد كبير إلى الأبد.
 */
let budget = STAMP_TRANSFER_MEMORY_BYTES;
let used = 0;

export type MemoryLease = {
  readonly bytes: number;
  /** الحجم الفعلي بعد أن عُرف (النسخة المختومة بعد الختم، أو بعد التخلي عن الأصل) */
  resize(bytes: number): void;
  /** مرة واحدة: النداء الثاني لا يفعل شيئًا */
  release(): void;
};

export function reserveStampMemory(bytes: number): MemoryLease {
  const wanted = Math.max(0, Math.ceil(bytes));
  if (used > 0 && used + wanted > budget) throw stampBusyRefusal();
  used += wanted;
  let held = wanted;
  let released = false;
  return {
    get bytes() {
      return held;
    },
    resize(next: number) {
      if (released) return;
      const n = Math.max(0, Math.ceil(next));
      used += n - held;
      held = n;
    },
    release() {
      if (released) return;
      released = true;
      used -= held;
      held = 0;
    },
  };
}

export function stampMemoryState() {
  return { used, budget };
}

/** للاختبارات فقط: سقف أصغر. null يعيد السقف الافتراضي (الحجوزات القائمة تبقى محسوبة) */
export function configureStampMemoryForTests(next: { budgetBytes?: number } | null) {
  budget = next?.budgetBytes ?? STAMP_TRANSFER_MEMORY_BYTES;
}
