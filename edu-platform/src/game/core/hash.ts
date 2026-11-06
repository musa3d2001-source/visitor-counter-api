/** FNV-1a بـ 32 بت على كلمات صحيحة (Math.imul فقط)، و float() يضيف البتات الخام لقيمة float32 */
export class Fnv {
  private h = 0x811c9dc5;
  private readonly f32 = new Float32Array(1);
  private readonly u32 = new Uint32Array(this.f32.buffer);

  word(w: number): this {
    for (let k = 0; k < 4; k++) {
      this.h ^= (w >>> (k * 8)) & 0xff;
      this.h = Math.imul(this.h, 0x01000193);
    }
    return this;
  }

  /** أصرم من التكميم: أي اختلاف ولو في البت الأخير يظهر */
  float(v: number): this {
    this.f32[0] = v;
    return this.word(this.u32[0]);
  }

  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, "0");
  }
}
