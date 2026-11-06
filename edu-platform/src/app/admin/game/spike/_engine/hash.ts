/**
 * [تجربة المرحلة 0 - كود مؤقت]
 * بصمة الحالة stateHash بخوارزمية FNV-1a (32 بت) على كلمات 32 بت تُقرأ بايتًا بايتًا،
 * فلا تتأثر بترتيب البايتات في المنصة. الأعداد العشرية تُحوَّل إلى بتات float32 قبل الخلط.
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export class Fnv1a {
  private h = FNV_OFFSET;
  private readonly f = new Float32Array(1);
  private readonly u = new Uint32Array(this.f.buffer);

  u32(value: number): this {
    const v = value >>> 0;
    let h = this.h;
    h = Math.imul(h ^ (v & 0xff), FNV_PRIME);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), FNV_PRIME);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), FNV_PRIME);
    h = Math.imul(h ^ ((v >>> 24) & 0xff), FNV_PRIME);
    this.h = h >>> 0;
    return this;
  }

  /** يكتب العدد بدقة float32 (وهي دقة Rapier الداخلية) ثم يخلط بتاته */
  f32(value: number): this {
    this.f[0] = value;
    return this.u32(this.u[0]);
  }

  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, "0");
  }
}
