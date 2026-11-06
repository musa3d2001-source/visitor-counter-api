/**
 * [تجربة المرحلة 0 - كود مؤقت، ليس إنتاجيًا]
 * مولّد عشوائي مُبذَّر بتيارين مستقلين: "sim" (يؤثر في الفيزياء) و"render" (للعرض فقط).
 * يعتمد على Math.imul وعمليات البتات فقط (القائمة البيضاء)، فينتج الأعداد نفسها في كل محرك JS.
 */
export interface Rng {
  /** عدد صحيح بلا إشارة 32 بت */
  nextU32(): number;
  /** عدد صحيح في [min, max] شاملًا */
  nextInt(min: number, max: number): number;
  /** عدد في [0, 1) */
  nextFloat(): number;
}

/** murmur3 fmix32: يخلط البذرة ورقم التيار قبل البدء */
function mix32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 بحالة 32 بت */
export function createRng(seed: number, stream: number): Rng {
  let a = mix32((seed >>> 0) ^ Math.imul((stream + 1) >>> 0, 0x9e3779b9));
  const nextU32 = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    nextU32,
    nextInt(min, max) {
      const span = max - min + 1;
      return min + (nextU32() % span);
    },
    nextFloat() {
      return nextU32() / 4294967296;
    },
  };
}

export const SIM_STREAM = 0;
export const RENDER_STREAM = 1;

export function createStreams(seed: number): { sim: Rng; render: Rng } {
  return { sim: createRng(seed, SIM_STREAM), render: createRng(seed, RENDER_STREAM) };
}
