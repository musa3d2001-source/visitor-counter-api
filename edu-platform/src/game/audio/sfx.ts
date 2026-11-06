/**
 * مؤثرات صوتية إجرائية بـ WebAudio (GAME_DESIGN.md §1، و ARCHITECTURE.md §2: «audio/ WebAudio إجرائي مع كتم»).
 *  - لا ملفات صوت ولا موسيقى: مذبذبات جيبية ومثلثية، وضجيج مرشَّح من مخزن واحد مشترك، وأغلفة كسب، ثم كسب رئيسي وضاغط.
 *  - السياق يُنشأ كسولًا عند أول unlock() أو play()؛ iOS Safari يشترط استدعاء resume() داخل لمسة المستخدم.
 *  - بلا AudioContext (الخادم، Node، متصفح قديم) يصبح كل شيء بلا أثر، ولا يرمي أبدًا.
 *  - لا يحفظ شيئًا؛ المستدعي يخزّن تفضيل الكتم ويمرّره.
 * الوصفات (sfxRecipe) بيانات نقية تُختبر في Node، والمحرك (createSfx) يحوّلها إلى عقد WebAudio في المتصفح فقط.
 * لا وصول إلى window عند الاستيراد: كل ما يخص المتصفح داخل الدوال.
 */
import type { MaterialKey } from "../core/materials";

export type SfxName = "launch" | "impact-wood" | "impact-stone" | "shatter-glass" | "crumble-frond" | "lightbox-burst" | "lantern-freed" | "splash" | "correct" | "wrong" | "star" | "ui-tap";

export const SFX_NAMES: readonly SfxName[] = [
  "launch",
  "impact-wood",
  "impact-stone",
  "shatter-glass",
  "crumble-frond",
  "lightbox-burst",
  "lantern-freed",
  "splash",
  "correct",
  "wrong",
  "star",
  "ui-tap",
];

/** أطول مدة لكل مؤثر بالثواني: قصيرة (≤ 0.6) إلا تحرير القنديل (لحن صاعد ≤ 1.2) والنجمة (بريق ≤ 1) */
export const SFX_MAX_SECONDS: Readonly<Record<SfxName, number>> = {
  launch: 0.6,
  "impact-wood": 0.6,
  "impact-stone": 0.6,
  "shatter-glass": 0.6,
  "crumble-frond": 0.6,
  "lightbox-burst": 0.6,
  "lantern-freed": 1.2,
  splash: 0.6,
  correct: 0.6,
  wrong: 0.6,
  star: 1,
  "ui-tap": 0.6,
};

/** أصوات الاصطدام والكسر: تُخنق معًا حتى لا يتشبّع انهيار كبير */
export const IMPACT_SFX: readonly SfxName[] = ["impact-wood", "impact-stone", "shatter-glass", "crumble-frond"];

/** الخانق: لا يتجاوز 12 صوت اصطدام في أي ثانية (دفعة 3 في اللحظة نفسها، ثم 9 في الثانية) */
export const IMPACT_BURST = 3;
export const IMPACT_RATE = 9;

export function isImpactSfx(name: SfxName): boolean {
  return IMPACT_SFX.includes(name);
}

/** صوت انكسار كل خامة (الغيم لا ينكسر) */
const BREAK_SFX: Record<MaterialKey, SfxName | null> = {
  frond: "crumble-frond",
  teak: "impact-wood",
  stone: "impact-stone",
  glass: "shatter-glass",
  cloud: null,
  lightbox: "lightbox-burst",
};

/** صوت الارتطام بلا كسر (الغيم ناعم فلا صوت له) */
const HIT_SFX: Record<MaterialKey, SfxName | null> = {
  frond: "impact-wood",
  teak: "impact-wood",
  stone: "impact-stone",
  glass: "impact-stone",
  cloud: null,
  lightbox: "impact-wood",
};

export function breakSfx(m: MaterialKey): SfxName | null {
  return BREAK_SFX[m];
}

export function hitSfx(m: MaterialKey): SfxName | null {
  return HIT_SFX[m];
}

// ───────────────────────── الوصفات (بيانات نقية) ─────────────────────────

/** طبقة نغمة: مذبذب جيبي أو مثلثي فقط (لا مربع ولا منشاري: أصوات لطيفة للأطفال) */
export type ToneLayer = {
  kind: "tone";
  wave: "sine" | "triangle";
  /** بداية الطبقة بالثواني من لحظة التشغيل */
  at: number;
  /** صعود خطي إلى الذروة (ثوانٍ) */
  attack: number;
  /** هبوط أسّي من الذروة إلى الصمت (ثوانٍ) */
  decay: number;
  /** ذروة الكسب 0..1 قبل الصوت الرئيسي */
  peak: number;
  /** التردد بالهرتز، وينزلق أسّيًا إلى f1 خلال glide ثانية إن وُجد */
  f0: number;
  f1?: number;
  glide?: number;
};

/** طبقة ضجيج: المخزن المشترك عبر مرشح واحد، وتردد المرشح ينزلق كالنغمة */
export type NoiseLayer = {
  kind: "noise";
  filter: "lowpass" | "highpass" | "bandpass";
  q: number;
  at: number;
  attack: number;
  decay: number;
  peak: number;
  f0: number;
  f1?: number;
  glide?: number;
  /** نبضات متتابعة (حفيف السعف): عددها، والفاصل بين بداياتها (≥ attack + decay)، ونسبة خفوت كل نبضة عن سابقتها */
  grains?: { count: number; gap: number; fall: number };
};

export type SfxLayer = ToneLayer | NoiseLayer;

/** يحصر العدد في 0..1، و NaN يصبح 0 */
export function clamp01(x: number): number {
  return x > 0 ? (x < 1 ? x : 1) : 0;
}

/** يحصر الاتجاه في −1..1، و NaN يصبح 0 (الوسط) */
export function clampPan(x: number): number {
  if (x > -1) return x < 1 ? x : 1;
  return x <= -1 ? -1 : 0;
}

/** كسب الشدة: الضربة الخفيفة مسموعة بالكاد (0.2) والقوية كاملة */
export function intensityGain(intensity: number): number {
  return 0.2 + 0.8 * clamp01(intensity);
}

/** نهاية الطبقة بالثواني من لحظة التشغيل */
export function layerEnd(l: SfxLayer): number {
  const extra = l.kind === "noise" && l.grains ? (Math.max(1, Math.floor(l.grains.count)) - 1) * l.grains.gap : 0;
  return l.at + extra + l.attack + l.decay;
}

/** نهاية الوصفة كلها */
export function recipeEnd(layers: readonly SfxLayer[]): number {
  let end = 0;
  for (const l of layers) end = Math.max(end, layerEnd(l));
  return end;
}

/** نغمات السلّم الخماسي على «ري» الكبير (D E F♯ A B): لا تنافر مهما تراكبت الأصوات */
const NOTE = {
  Fs4: 369.99,
  A4: 440,
  D5: 587.33,
  Fs5: 739.99,
  A5: 880,
  B5: 987.77,
  D6: 1174.66,
  E6: 1318.51,
  Fs6: 1479.98,
  A6: 1760,
  B6: 1975.53,
  D7: 2349.32,
} as const;

type ToneExtra = Partial<Pick<ToneLayer, "wave" | "f1" | "glide">>;
type NoiseExtra = Partial<Pick<NoiseLayer, "f1" | "glide" | "grains">>;

function tone(f0: number, at: number, attack: number, decay: number, peak: number, extra: ToneExtra = {}): ToneLayer {
  return { kind: "tone", wave: "sine", at, attack, decay, peak, f0, ...extra };
}

function noise(filter: NoiseLayer["filter"], f0: number, q: number, at: number, attack: number, decay: number, peak: number, extra: NoiseExtra = {}): NoiseLayer {
  return { kind: "noise", filter, q, at, attack, decay, peak, f0, ...extra };
}

/**
 * وصفة المؤثر: طبقات نقية من الاسم والشدة (0..1) و vary (0..1) الذي يزحزح نغمة أصوات العالم ±3%
 * حتى لا يتكرر الاصطدام آليًا. أصوات الواجهة والتقييم ثابتة النغمة.
 */
export function sfxRecipe(name: SfxName, intensity = 1, vary = 0.5): SfxLayer[] {
  const i = clamp01(intensity);
  const a = intensityGain(i);
  const d = 1 + (clamp01(vary) - 0.5) * 0.06;
  switch (name) {
    // انطلاق الشهاب: «ووش» ضجيج يصعد مرشّحه، مع دفعة النابض المنخفضة ورنّة صغيرة
    case "launch":
      return [
        noise("bandpass", 450, 0.9, 0, 0.06, 0.34, 0.3 * a, { f1: 1000 + 900 * i, glide: 0.24 }),
        tone(150, 0, 0.004, 0.14, 0.32 * a, { f1: 70, glide: 0.12 }),
        tone(392 * d, 0.01, 0.005, 0.15, 0.09 * a, { f1: 588 * d, glide: 0.08 }),
      ];
    // خشب: «طَق» أجوف قصير؛ الضربة الأقوى أطول وأسطع
    case "impact-wood":
      return [
        tone(250 * d, 0, 0.002, 0.1 + 0.06 * i, 0.34 * a, { wave: "triangle", f1: 195 * d, glide: 0.08 }),
        tone(610 * d, 0, 0.002, 0.05, 0.1 * a, { f1: 520 * d, glide: 0.05 }),
        noise("bandpass", (900 + 1500 * i) * d, 2.5, 0, 0.001, 0.035, 0.2 * a),
      ];
    // حجر: ارتطام مكتوم منخفض
    case "impact-stone":
      return [
        tone(115 * d, 0, 0.003, 0.16 + 0.08 * i, 0.46 * a, { f1: 62 * d, glide: 0.16 }),
        noise("lowpass", 350 + 1000 * i, 0.7, 0, 0.002, 0.09, 0.3 * a, { f1: 180, glide: 0.09 }),
        tone(330 * d, 0, 0.002, 0.04, 0.08 * a, { wave: "triangle" }),
      ];
    // زجاج: رنين أجراس خماسي خفيف بدل التهشّم الحاد
    case "shatter-glass":
      return [
        noise("highpass", 2800 + 1200 * i, 0.7, 0, 0.002, 0.07, 0.13 * a),
        ...[NOTE.Fs6, NOTE.A6, NOTE.D7, NOTE.B6].map((f, k) => tone(f * d, k * 0.035, 0.002, 0.16 + 0.03 * k, (0.09 - 0.012 * k) * a)),
      ];
    // سعف: حفيف جاف بنبضات متتابعة وارتطام لين
    case "crumble-frond":
      return [
        noise("bandpass", (1700 + 1200 * i) * d, 1.1, 0, 0.003, 0.034, 0.3 * a, { grains: { count: 5, gap: 0.045, fall: 0.72 } }),
        tone(175 * d, 0, 0.003, 0.07, 0.1 * a, { wave: "triangle", f1: 135 * d, glide: 0.07 }),
      ];
    // صندوق الضوء: «ووم» ناعم ونفَس ضجيج يهبط، ولمعة نغمتين
    case "lightbox-burst":
      return [
        tone(95, 0, 0.006, 0.3, 0.4 * a, { f1: 48, glide: 0.26 }),
        noise("lowpass", 1600 + 1200 * i, 0.8, 0, 0.005, 0.34, 0.24 * a, { f1: 320, glide: 0.32 }),
        tone(NOTE.A5, 0.02, 0.01, 0.38, 0.08 * a),
        tone(NOTE.E6, 0.05, 0.01, 0.36, 0.06 * a),
      ];
    // تحرير القنديل: لحن خماسي صاعد بأجراس (أساس + أوكتاف سريع الخفوت)، والأخيرة أطول، مع نسمة هواء
    case "lantern-freed": {
      const run = [NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.B5, NOTE.D6];
      const layers: SfxLayer[] = [];
      run.forEach((f, k) => {
        const last = k === run.length - 1;
        layers.push(tone(f, k * 0.1, 0.006, last ? 0.68 : 0.42, (0.17 + 0.01 * k) * a));
        layers.push(tone(f * 2, k * 0.1, 0.003, 0.14, 0.045 * a));
      });
      layers.push(noise("highpass", 5200, 0.7, 0.08, 0.16, 0.4, 0.025 * a));
      return layers;
    }
    // سقوط في البحر: ضجيج يهبط مرشّحه، و«بلوب» وقطرتان
    case "splash":
      return [
        noise("lowpass", 2400 + 1600 * i, 0.6, 0, 0.012, 0.4, 0.3 * a, { f1: 450, glide: 0.38 }),
        tone(240 * d, 0.015, 0.004, 0.1, 0.12 * a, { f1: 520 * d, glide: 0.09 }),
        tone(880 * d, 0.15, 0.003, 0.06, 0.05 * a, { f1: 1300 * d, glide: 0.05 }),
        tone(1150 * d, 0.23, 0.003, 0.05, 0.04 * a, { f1: 1650 * d, glide: 0.04 }),
      ];
    // إجابة صحيحة: «دِن-دِنغ» صاعد (رابعة تامة) بجرس دافئ
    case "correct":
      return [
        tone(NOTE.A5, 0, 0.005, 0.22, 0.22 * a),
        tone(NOTE.A5 * 2, 0, 0.003, 0.08, 0.04 * a),
        tone(NOTE.D6, 0.09, 0.005, 0.36, 0.24 * a),
        tone(NOTE.D6 * 2, 0.09, 0.003, 0.1, 0.04 * a),
        tone(NOTE.D5, 0.09, 0.01, 0.3, 0.06 * a, { wave: "triangle" }),
      ];
    // إجابة خاطئة: نغمتان ناعمتان هابطتان («أوه، تقريبًا») بصعود بطيء وكسب أخفض من الصحيحة، والثانية ترتفع قليلًا
    // في آخرها تشجيعًا. لا طنين ولا نغمة حادة.
    case "wrong":
      return [
        tone(NOTE.A4, 0, 0.02, 0.2, 0.14 * a),
        tone(NOTE.A4, 0, 0.02, 0.12, 0.04 * a, { wave: "triangle" }),
        tone(NOTE.Fs4, 0.17, 0.025, 0.28, 0.13 * a, { f1: NOTE.Fs4 * 1.03, glide: 0.3 }),
        tone(NOTE.D5, 0.17, 0.03, 0.2, 0.03 * a),
      ];
    // نجمة: بريق خماسي صاعد سريع، ونفَس ضجيج عالٍ، وقرار دافئ
    case "star": {
      const sparkle = [NOTE.D6, NOTE.E6, NOTE.Fs6, NOTE.A6, NOTE.B6, NOTE.D7];
      return [
        ...sparkle.map((f, k) => tone(f, k * 0.055, 0.002, k === sparkle.length - 1 ? 0.45 : 0.2, 0.1 * a)),
        noise("highpass", 6000, 0.7, 0, 0.08, 0.5, 0.03 * a),
        tone(NOTE.D5, 0.27, 0.01, 0.48, 0.07 * a),
        tone(NOTE.A5, 0.27, 0.01, 0.44, 0.05 * a),
      ];
    }
    // لمسة واجهة: نقرة جيبية صغيرة
    case "ui-tap":
      return [tone(1050, 0, 0.002, 0.045, 0.11 * a, { f1: 800, glide: 0.04 })];
    default: {
      const never: never = name;
      return never;
    }
  }
}

// ───────────────────────── الخانق والضجيج (نقيّان) ─────────────────────────

/**
 * خانق دلو الرموز: يمتلئ بمعدل rate في الثانية حتى burst. الزمن يُمرَّر من الخارج (ساعة السياق الصوتي)،
 * فالدالة نقية وتُختبر. أقصى عدد في أي نافذة طولها ثانية = burst + rate.
 */
export function createThrottle(rate: number, burst: number): { allow(now: number): boolean } {
  const cap = Math.max(1, burst);
  let tokens = cap;
  let last: number | null = null;
  return {
    allow(now: number): boolean {
      if (last !== null) tokens = Math.min(cap, tokens + Math.max(0, now - last) * rate);
      last = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

/** ضجيج أبيض في −1..1 بمولّد xorshift32 مُبذَّر (للعرض فقط؛ لا صلة له بمولّد المحاكاة) */
export function fillNoise(out: Float32Array, seed = 0x2f6b4c1d): void {
  let s = seed >>> 0 || 1;
  for (let k = 0; k < out.length; k++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out[k] = s / 2147483648 - 1;
  }
}

/** الزحزحة التالية: متتالية النسبة الذهبية (متباعدة بلا عشوائية) */
export function nextVary(v: number): number {
  const n = v + 0.6180339887498949;
  return n >= 1 ? n - 1 : n;
}

// ───────────────────────── المحرك (المتصفح فقط) ─────────────────────────

export type SfxPlayOptions = { intensity?: number; pan?: number };
export type SfxOptions = { muted?: boolean; volume?: number };

export type Sfx = {
  play(name: SfxName, opts?: SfxPlayOptions): void;
  setMuted(m: boolean): void;
  readonly muted: boolean;
  /** يُستدعى داخل لمسة المستخدم (pointerdown/keydown): ينشئ السياق ويستأنفه. لا يرمي، ويُحسم خلال ثانية على الأكثر */
  unlock(): Promise<void>;
  dispose(): void;
};

type AudioCtor = new (options?: AudioContextOptions) => AudioContext;

type Graph = {
  ctx: AudioContext;
  /** مجمع الأصوات قبل الضاغط */
  bus: GainNode;
  /** الصوت الرئيسي والكتم بعد الضاغط */
  master: GainNode;
  /** مخزن الضجيج الواحد المشترك */
  noise: AudioBuffer;
  /** StereoPannerNode متاح؟ (Safari الأقدم من 14.1 بلا) */
  panner: boolean;
};

const DEFAULT_VOLUME = 0.7;
const NOISE_SECONDS = 1;
/** أدنى كسب للأغلفة الأسّية (لا تقبل الصفر) */
const FLOOR = 0.0001;
const MIN_ATTACK = 0.001;
/** هامش الإيقاف بعد نهاية الغلاف */
const STOP_PAD = 0.03;
/** مهلة جدولة صغيرة حتى لا تبدأ الطبقة في الماضي */
const LOOKAHEAD = 0.005;
/** أقصى أصوات تُقبل والسياق معلَّق (تُعزف عند الاستئناف)؛ الاصطدامات لا تُقبل فيه أصلًا */
const MAX_QUEUED = 2;
/** أقصى أصوات حية؛ الاصطدامات الزائدة تُسقط */
const MAX_VOICES = 24;
/** أدنى فاصل بين صوتين بالاسم نفسه، وأطول للأصوات الكبيرة */
const SAME_NAME_GAP = 0.03;
const BIG_GAP = 0.08;
const UNLOCK_TIMEOUT_MS = 1000;
/** ثابت زمن تلاشي الكتم (ثوانٍ) */
const MUTE_TC = 0.015;

const noop = (): void => {};

/** منشئ AudioContext إن وُجد (webkitAudioContext لـ Safari القديم)؛ يُقرأ عند الطلب فقط */
function audioCtor(): AudioCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** هل WebAudio متاح هنا؟ (false في الخادم و Node) */
export function audioSupported(): boolean {
  try {
    return audioCtor() !== null;
  } catch {
    return false;
  }
}

function makeContext(Ctor: AudioCtor): AudioContext {
  try {
    return new Ctor({ latencyHint: "interactive" });
  } catch {
    return new Ctor();
  }
}

/** وعد يُحسم مع p أو بعد ms، أيهما أسبق (Chrome يُبقي resume() معلّقًا حتى لمسة) */
function settleWithin(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((done) => {
    const timer = setTimeout(done, ms);
    const finish = () => {
      clearTimeout(timer);
      done();
    };
    p.then(finish, finish);
  });
}

function envelope(p: AudioParam, l: SfxLayer, t: number): void {
  const attack = Math.max(MIN_ATTACK, l.attack);
  const g = l.kind === "noise" ? l.grains : undefined;
  const count = g ? Math.max(1, Math.floor(g.count)) : 1;
  let peak = Math.max(FLOOR * 2, l.peak);
  p.value = 0;
  for (let k = 0; k < count; k++) {
    const s = t + (g ? k * g.gap : 0);
    // كل نبضة تنتهي قبل بداية التالية، فأحداث الأتمتة مرتبة زمنيًا دائمًا
    const decay = g && k < count - 1 ? Math.min(l.decay, g.gap - attack - 0.002) : l.decay;
    p.setValueAtTime(FLOOR, s);
    p.linearRampToValueAtTime(peak, s + attack);
    p.exponentialRampToValueAtTime(FLOOR, s + attack + Math.max(0.005, decay));
    if (g) peak = Math.max(FLOOR * 2, peak * g.fall);
  }
}

function sweep(p: AudioParam, l: SfxLayer, t: number): void {
  p.value = l.f0;
  p.setValueAtTime(l.f0, t);
  if (l.f1 !== undefined && l.f1 > 0 && l.f1 !== l.f0) p.exponentialRampToValueAtTime(l.f1, t + Math.max(0.005, l.glide ?? l.attack + l.decay));
}

function frac(x: number): number {
  return x - Math.floor(x);
}

export function createSfx(opts: SfxOptions = {}): Sfx {
  const volume = clamp01(opts.volume ?? DEFAULT_VOLUME);
  let muted = opts.muted === true;
  let disposed = false;
  /** فشل الإنشاء مرة (لا WebAudio أو رفضه المتصفح): لا نحاول عند كل صوت */
  let failed = false;
  let graph: Graph | null = null;
  let vary = 0.5;
  let live = 0;
  let liveImpacts = 0;
  let queued = 0;
  const throttle = createThrottle(IMPACT_RATE, IMPACT_BURST);
  const lastAt = new Map<SfxName, number>();

  function ensure(): Graph | null {
    if (graph) return graph;
    if (disposed || failed) return null;
    let ctx: AudioContext | null = null;
    try {
      const Ctor = audioCtor();
      if (!Ctor) {
        failed = true;
        return null;
      }
      ctx = makeContext(Ctor);
      const bus = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      const master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      bus.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS)), ctx.sampleRate);
      fillNoise(buffer.getChannelData(0));
      graph = { ctx, bus, master, noise: buffer, panner: typeof ctx.createStereoPanner === "function" };
      return graph;
    } catch {
      failed = true;
      if (ctx) close(ctx);
      return null;
    }
  }

  function close(ctx: AudioContext): void {
    try {
      const state: string = ctx.state;
      if (state !== "closed") ctx.close().catch(noop);
    } catch {
      // لا شيء
    }
  }

  function resume(ctx: AudioContext): Promise<unknown> {
    try {
      return ctx.resume().catch(noop);
    } catch {
      return Promise.resolve();
    }
  }

  /**
   * السياق جاهز للجدولة؟ المعلَّق (قبل أول لمسة، أو بعد مقاطعة iOS) يُطلب استئنافه. صوت الواجهة فيه يُقبل
   * (حتى اثنين) فيُعزف فور الاستئناف داخل اللمسة نفسها، والاصطدامات تُسقط حتى لا تتكدس ثم تنطلق دفعة واحدة.
   */
  function ready(impact: boolean): Graph | null {
    const g = ensure();
    if (!g) return null;
    const state: string = g.ctx.state;
    if (state === "running") {
      queued = 0;
      return g;
    }
    if (state === "closed") return null;
    void resume(g.ctx);
    if (impact || queued >= MAX_QUEUED) return null;
    queued++;
    return g;
  }

  function layer(g: Graph, l: SfxLayer, t0: number, out: AudioNode, nodes: AudioNode[]): AudioScheduledSourceNode {
    const { ctx } = g;
    const t = t0 + l.at;
    const env = ctx.createGain();
    nodes.push(env);
    envelope(env.gain, l, t);
    env.connect(out);
    if (l.kind === "tone") {
      const o = ctx.createOscillator();
      nodes.push(o);
      o.type = l.wave;
      sweep(o.frequency, l, t);
      o.connect(env);
      o.start(t);
      return o;
    }
    const f = ctx.createBiquadFilter();
    nodes.push(f);
    f.type = l.filter;
    f.Q.value = l.q;
    sweep(f.frequency, l, t);
    f.connect(env);
    const s = ctx.createBufferSource();
    nodes.push(s);
    s.buffer = g.noise;
    s.loop = true;
    s.connect(f);
    // بداية مختلفة في المخزن لكل طبقة، فلا يتطابق ضجيج صوتين متتاليين
    s.start(t, frac(vary * 0.73 + l.f0 * 0.0013) * NOISE_SECONDS);
    return s;
  }

  function voice(g: Graph, layers: readonly SfxLayer[], pan: number, gain: number, impact: boolean): void {
    const { ctx } = g;
    const t0 = ctx.currentTime + LOOKAHEAD;
    const nodes: AudioNode[] = [];
    try {
      const out = ctx.createGain();
      nodes.push(out);
      out.gain.value = gain;
      const p = clampPan(pan);
      if (p !== 0 && g.panner) {
        const sp = ctx.createStereoPanner();
        nodes.push(sp);
        sp.pan.value = p;
        sp.connect(g.bus);
        out.connect(sp);
      } else {
        out.connect(g.bus);
      }
      let tail: AudioScheduledSourceNode | null = null;
      let tailEnd = -1;
      for (const l of layers) {
        const src = layer(g, l, t0, out, nodes);
        const end = t0 + layerEnd(l) + STOP_PAD;
        src.stop(end);
        if (end > tailEnd) {
          tailEnd = end;
          tail = src;
        }
      }
      if (!tail) {
        for (const n of nodes) n.disconnect();
        return;
      }
      live++;
      if (impact) liveImpacts++;
      // آخر طبقة تنتهي تفكّ عقد الصوت كله
      tail.onended = () => {
        live--;
        if (impact) liveImpacts--;
        for (const n of nodes) n.disconnect();
      };
    } catch {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          // لا شيء
        }
      }
    }
  }

  function play(name: SfxName, o: SfxPlayOptions = {}): void {
    if (muted || disposed) return;
    try {
      const impact = isImpactSfx(name);
      const g = ready(impact);
      if (!g) return;
      const now = g.ctx.currentTime;
      const prev = lastAt.get(name);
      const gap = name === "lightbox-burst" || name === "splash" ? BIG_GAP : SAME_NAME_GAP;
      if (prev !== undefined && now - prev >= 0 && now - prev < gap) return;
      if (impact && (live >= MAX_VOICES || !throttle.allow(now))) return;
      lastAt.set(name, now);
      vary = nextVary(vary);
      // انهيار كبير: كل اصطدام حي إضافي يخفض الجديد قليلًا، والضاغط يتكفل بالباقي
      const duck = impact ? 1 / (1 + 0.08 * liveImpacts) : 1;
      voice(g, sfxRecipe(name, o.intensity ?? 1, vary), o.pan ?? 0, duck, impact);
    } catch {
      // الصوت زينة: لا يكسر اللعبة أبدًا
    }
  }

  function setMuted(m: boolean): void {
    muted = m;
    const g = graph;
    if (!g || disposed) return;
    try {
      const now = g.ctx.currentTime;
      g.master.gain.cancelScheduledValues(now);
      g.master.gain.setTargetAtTime(muted ? 0 : volume, now, MUTE_TC);
    } catch {
      // لا شيء
    }
  }

  function unlock(): Promise<void> {
    if (disposed) return Promise.resolve();
    try {
      const g = ensure();
      if (!g) return Promise.resolve();
      // iOS القديم: عيّنة صامتة تُعزف داخل اللمسة تفتح مسار الصوت
      const blip = g.ctx.createBufferSource();
      blip.buffer = g.ctx.createBuffer(1, 1, g.ctx.sampleRate);
      blip.connect(g.ctx.destination);
      blip.onended = () => blip.disconnect();
      blip.start(0);
      const state: string = g.ctx.state;
      if (state === "running") return Promise.resolve();
      // resume() يُستدعى متزامنًا هنا (داخل اللمسة) قبل أي انتظار
      return settleWithin(resume(g.ctx), UNLOCK_TIMEOUT_MS);
    } catch {
      return Promise.resolve();
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const g = graph;
    graph = null;
    if (!g) return;
    try {
      g.master.disconnect();
    } catch {
      // لا شيء
    }
    close(g.ctx);
  }

  return {
    play,
    setMuted,
    get muted() {
      return muted;
    },
    unlock,
    dispose,
  };
}
