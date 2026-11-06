/** مولّد sfc32 مُبذَّر بتيارين لا يتشاركان حالة: sim (للمحاكاة) و view (للعرض فقط) */
export type Rng = { next: () => number; int: (n: number) => number; float: () => number };

function stream(seed: number, salt: number): Rng {
  let a = (seed ^ salt) >>> 0;
  let b = Math.imul(seed, 0x9e3779b1) >>> 0;
  let c = Math.imul(salt, 0x85ebca6b) >>> 0;
  let d = 1;
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) next();
  return { next, int: (n: number) => next() % n, float: () => next() / 4294967296 };
}

export function rngStreams(seed: number): { sim: Rng; view: Rng } {
  return { sim: stream(seed, 0x51a1), view: stream(seed, 0x7e3d) };
}
