/**
 * نموذج المرحلة 0 (تجربة تقنية، يُستبدل في المرحلة 2): أدوات حتمية بلا Math.sin/cos ولا Date.
 * كل العمليات هنا جمع وضرب وقسمة IEEE-754 بدقة مضاعفة، ونتيجتها متطابقة بتًا في V8 و JavaScriptCore.
 * من Math نستخدم القائمة البيضاء فقط: abs min max floor ceil round trunc sign sqrt imul fround.
 */

/** جيب الزاوية بسلسلة تايلور حتى الحد التاسع (خطأ < 1e-6 على [0, 1.45]) */
function sinPoly(x: number): number {
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - x2 / 110)))));
}
function cosPoly(x: number): number {
  const x2 = x * x;
  return 1 - (x2 / 2) * (1 - (x2 / 12) * (1 - (x2 / 30) * (1 - (x2 / 56) * (1 - (x2 / 90) * (1 - x2 / 132)))));
}
const PI = 3.141592653589793;

/** خطوات التصويب: الزاوية 0..ANGLE_STEPS والقوة 0..POWER_STEPS (أعداد صحيحة فقط في المدخلات) */
export const ANGLE_STEPS = 60;
export const POWER_STEPS = 40;
const ANGLE_MIN_DEG = 5;
const ANGLE_MAX_DEG = 80;
const SPEED_MIN = 7; // م/ث
const SPEED_MAX = 25;

/**
 * جدول السرعات بالمليمتر/ثانية (أعداد صحيحة). الإطلاق نحو اليسار (vx سالبة).
 * يُبنى مرة واحدة من الحساب أعلاه، فهو متطابق في Node والمتصفحات.
 */
const VX = new Int32Array((ANGLE_STEPS + 1) * (POWER_STEPS + 1));
const VY = new Int32Array((ANGLE_STEPS + 1) * (POWER_STEPS + 1));
for (let a = 0; a <= ANGLE_STEPS; a++) {
  const deg = ANGLE_MIN_DEG + ((ANGLE_MAX_DEG - ANGLE_MIN_DEG) * a) / ANGLE_STEPS;
  const rad = (deg * PI) / 180;
  const c = cosPoly(rad);
  const s = sinPoly(rad);
  for (let p = 0; p <= POWER_STEPS; p++) {
    const speed = SPEED_MIN + ((SPEED_MAX - SPEED_MIN) * p) / POWER_STEPS;
    VX[a * (POWER_STEPS + 1) + p] = -Math.round(speed * c * 1000);
    VY[a * (POWER_STEPS + 1) + p] = Math.round(speed * s * 1000);
  }
}

export function aimVelocity(angleStep: number, powerStep: number): { vx: number; vy: number } {
  const i = angleStep * (POWER_STEPS + 1) + powerStep;
  return { vx: VX[i] / 1000, vy: VY[i] / 1000 };
}

/** FNV-1a بـ 32 بت على كلمات صحيحة (Math.imul فقط) */
export class Fnv {
  private h = 0x811c9dc5;
  word(w: number) {
    for (let k = 0; k < 4; k++) {
      this.h ^= (w >>> (k * 8)) & 0xff;
      this.h = Math.imul(this.h, 0x01000193);
    }
  }
  private readonly f32 = new Float32Array(1);
  private readonly u32 = new Uint32Array(this.f32.buffer);
  /** يضيف البتات الخام لقيمة float32 (أصرم من التكميم: أي اختلاف ولو في البت الأخير يظهر) */
  float(v: number) {
    this.f32[0] = v;
    this.word(this.u32[0]);
  }
  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, "0");
  }
}

/** مولّد sfc32 مُبذَّر: تيار للمحاكاة وتيار للعرض، لا يتشاركان حالة */
export function rngStreams(seed: number) {
  const make = (salt: number) => {
    let a = (seed ^ salt) >>> 0;
    let b = Math.imul(seed, 0x9e3779b1) >>> 0;
    let c = (salt * 0x85ebca6b) >>> 0;
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
    return { next, int: (n: number) => next() % n };
  };
  return { sim: make(0x51a1), view: make(0x7e3d) };
}
