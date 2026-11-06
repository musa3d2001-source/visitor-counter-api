/**
 * محرك «شُهُب فرقد» للعميل: يربط المحاكاة الحتمية (core/sim) بالعرض (render، اختياري) وبواجهة React.
 *
 * README — مسار الجولة:
 *   1. createGame({ R, level, seed, canvas?, quality?, reducedMotion?, guidePoints? }) ينشئ المحاكاة، فيستقر
 *      التصميم في الافتتاح (createSim)، والحالة "aim". مع canvas يُحمَّل العرض بـ import() (three لا يُستورد
 *      أبدًا بلا canvas، فالمحرك يعمل في Node و vitest)، وتبدأ حلقة requestAnimationFrame.
 *   2. { type: "aim" } يحرّك المرقاب ودليل التصويب فقط (لا يمس المحاكاة).
 *   3. { type: "fire", shot } يطلق (مرفوض أثناء الطيران أو بعد cleared)، والحالة "flight". المحاكاة تخطو بخطوة
 *      ثابتة 1/60 حتى السكون (QUIET.steps خطوات ساكنة متتالية) أو QUIET.maxStepsPerShot، بالقاعدة نفسها في
 *      sim.settle()، فبصمة العميل تساوي runHeadless على الخادم. ثم الحالة "settled" والحدث settled مرة واحدة.
 *   4. { type: "activate" } لمسة أثناء الطيران: تسجَّل activateAt = stepInShot + 1 في الطلقة المرسلة مع settled.
 *   5. الجلسة (session/) تقرر ما بعد السكون: سؤال، ثم aim و fire للخانة التالية. setDawn يلوّن السماء.
 *   6. destroy() يحرر كل شيء (المحاكاة، الهندسات، الخامات، السياق، المستمعين، rAF). آمن مع StrictMode:
 *      أنشئ محركًا جديدًا (وcanvas جديدًا) في كل تركيب، وحرّره في التنظيف.
 * React: useSyncExternalStore(game.subscribe, game.getSnapshot). اللقطة كائن ثابت لا يُستبدل إلا عند تغيّر حقل.
 * بلا canvas (الاختبارات): لا حلقة؛ { type: "step", steps } يخطو يدويًا.
 */
import { aimAt, ANGLE_STEPS, POWER_STEPS, YAW_STEPS } from "./core/aim-table";
import { AMMO, type AmmoKey } from "./core/ammo";
import type { Level } from "./core/level-schema";
import { clampStep } from "./core/math";
import { createSim, type Shot } from "./core/sim";
import { LAUNCH, QUIET } from "./core/world";
import type { Rapier } from "./physics/types";
import type { GameScene } from "./render/scene";

export type QualityMode = "high" | "low" | "auto";
export type EngineStatus = "aim" | "flight" | "settled";
export type AimState = Readonly<{ yawStep: number; angleStep: number; powerStep: number }>;

export type EngineCommand =
  /** ammo اختياري: نوع القذيفة التالية لرسم الدليل بسرعتها ولونها (العرض فقط) */
  | { type: "aim"; yawStep: number; angleStep: number; powerStep: number; ammo?: AmmoKey }
  | { type: "fire"; shot: Shot }
  | { type: "activate" }
  | { type: "setQuality"; quality: QualityMode }
  | { type: "setDawn"; progress: number }
  | { type: "pause" }
  | { type: "resume" }
  /** للاختبارات بلا واجهة: يخطو حتى steps خطوة من الرمية الحالية (يتوقف عند السكون) */
  | { type: "step"; steps: number };

export type EngineSnapshot = Readonly<{
  status: EngineStatus;
  aim: AimState;
  shotsFired: number;
  freed: number;
  lanterns: number;
  broken: number;
  cleared: boolean;
  quality: "high" | "low";
  /** بصمة آخر سكون بعد رمية (null قبل أول رمية) */
  lastHash: string | null;
  /** تفعيل الخاصة متاح الآن (مذنّب أو نبضة في الطيران ولم تُفعَّل) */
  activatable: boolean;
}>;

export type EngineEvents = {
  settled: { shot: Shot; hash: string; freed: number; cleared: boolean; steps: number };
  activated: { step: number };
  /** فُقد سياق WebGL أو تعذّر إنشاؤه: توقف الرسم، والصفحة تنتقل إلى وضع الأسئلة فقط */
  contextLost: Record<string, never>;
  /** وسيط زمن الإطار (م.ث) كل 30 إطارًا */
  frame: { ms: number };
};

export type GameOptions = {
  R: Rapier;
  level: Level;
  seed: number;
  canvas?: HTMLCanvasElement;
  quality?: QualityMode;
  reducedMotion?: boolean;
  /** عدد نقاط دليل التصويب (rules/guidePoints) */
  guidePoints?: number;
  /** التصويب الابتدائي؛ افتراضيًا نحو وسط الجزيرة على ارتفاع متر */
  aim?: { yawStep: number; angleStep: number; powerStep: number };
  /** تقدم الفجر الابتدائي 0..1 */
  dawn?: number;
};

export type Game = {
  dispatch(cmd: EngineCommand): void;
  subscribe(cb: () => void): () => void;
  getSnapshot(): EngineSnapshot;
  on<E extends keyof EngineEvents>(e: E, cb: (p: EngineEvents[E]) => void): () => void;
  destroy(): void;
};

const STEP_MS = 1000 / 60;
/** أقصى خطوات محاكاة في إطار واحد (بعدها يُسقط المتراكم بدل اللحاق المتسلسل) */
const MAX_STEPS_PER_FRAME = 4;
/** الجودة التلقائية: تنزل إلى منخفضة إذا تجاوز وسيط زمن الإطار هذا الحد على آخر 120 إطارًا */
export const AUTO_QUALITY = { frames: 120, medianMs: 22, checkEvery: 30 } as const;
/** حركة بطيئة لحظة تحرر آخر قنديل (إيقاع العرض فقط؛ الخطوات نفسها فلا تتغير البصمة) */
const SLOW_MO = { scale: 0.35, ms: 1400 } as const;

/** مراقب زمن الإطار: حلقة ثابتة الحجم ووسيط بلا تخصيص (نسخة وفرز في مخزن مسبق) */
export function createFrameMonitor(size: number = AUTO_QUALITY.frames, thresholdMs: number = AUTO_QUALITY.medianMs) {
  const buf = new Float64Array(size);
  const scratch = new Float64Array(size);
  let n = 0;
  let head = 0;
  return {
    push(ms: number) {
      if (!(ms >= 0) || !Number.isFinite(ms)) return;
      buf[head] = ms;
      head = (head + 1) % size;
      if (n < size) n++;
    },
    median(): number {
      if (!n) return 0;
      for (let i = 0; i < n; i++) scratch[i] = buf[i];
      // فرز بالإدراج على n ≤ 120 (بلا subarray ولا مقارِن مُخصَّص)
      for (let i = 1; i < n; i++) {
        const v = scratch[i];
        let j = i - 1;
        while (j >= 0 && scratch[j] > v) {
          scratch[j + 1] = scratch[j];
          j--;
        }
        scratch[j + 1] = v;
      }
      return n % 2 ? scratch[(n - 1) >> 1] : (scratch[n / 2 - 1] + scratch[n / 2]) / 2;
    },
    /** امتلأت النافذة ووسيطها فوق الحد */
    overBudget(): boolean {
      return n === size && this.median() > thresholdMs;
    },
    get count() {
      return n;
    },
    reset() {
      n = 0;
      head = 0;
    },
  };
}

function freezeAim(yawStep: number, angleStep: number, powerStep: number): AimState {
  return Object.freeze({ yawStep: clampStep(yawStep, YAW_STEPS), angleStep: clampStep(angleStep, ANGLE_STEPS), powerStep: clampStep(powerStep, POWER_STEPS) });
}

function validShot(s: Shot | null | undefined): s is Shot {
  return (
    !!s &&
    Number.isInteger(s.idx) &&
    s.idx >= 0 &&
    Object.prototype.hasOwnProperty.call(AMMO, s.ammo) &&
    Number.isFinite(s.yawStep) &&
    Number.isFinite(s.angleStep) &&
    Number.isFinite(s.powerStep) &&
    Number.isInteger(s.activateAt) &&
    s.activateAt >= -1
  );
}

export function createGame(opts: GameOptions): Game {
  const { level, canvas } = opts;
  const sim = createSim(opts.R, level);
  const lanterns = sim.lanternCount;
  const hasWindow = typeof window !== "undefined";
  const reducedMotion = opts.reducedMotion ?? (hasWindow && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const guidePoints = opts.guidePoints ?? 30;
  let qualityMode: QualityMode = opts.quality ?? "auto";
  let quality: "high" | "low" = qualityMode === "low" ? "low" : "high";
  let dawn = Math.min(1, Math.max(0, Number.isFinite(opts.dawn) ? (opts.dawn as number) : 0));

  // ── الحالة
  let status: EngineStatus = "aim";
  const a0 = opts.aim ?? aimAt(LAUNCH, { x: 0, y: 1, z: 0 });
  let aim = freezeAim(a0.yawStep, a0.angleStep, a0.powerStep);
  let guideAmmo: AmmoKey = "meteor";
  let shotsFired = 0;
  let lastHash: string | null = null;
  let current: Shot | null = null;
  let activated = false;
  /** فهرس القذيفة الأولى للرمية الحالية في sim.bodies (لمعرفة حياتها بلا تخصيص) */
  let leadIndex = -1;
  let shotSteps = 0;
  let quiet = 0;
  let clearedSeen = sim.isCleared();
  let justCleared = false;
  let paused = false;
  let destroyed = false;
  let contextLost = false;

  // ── المستمعون
  const listeners = new Set<() => void>();
  const handlers: { [E in keyof EngineEvents]: Set<(p: EngineEvents[E]) => void> } = {
    settled: new Set(),
    activated: new Set(),
    contextLost: new Set(),
    frame: new Set(),
  };
  function emit<E extends keyof EngineEvents>(e: E, p: EngineEvents[E]) {
    for (const cb of [...handlers[e]]) cb(p);
  }

  // ── اللقطة: تُستبدل فقط عند تغيّر حقل (useSyncExternalStore)
  let snap: EngineSnapshot = Object.freeze({
    status,
    aim,
    shotsFired,
    freed: sim.freedCount(),
    lanterns,
    broken: sim.broken,
    cleared: sim.isCleared(),
    quality,
    lastHash,
    activatable: false,
  });

  function leadAlive(): boolean {
    return leadIndex >= 0 && leadIndex < sim.bodies.length && sim.bodies[leadIndex].alive;
  }

  function refresh() {
    if (destroyed) return;
    const freed = sim.freedCount();
    const broken = sim.broken;
    const cleared = freed === lanterns;
    const activatable = status === "flight" && !activated && current !== null && AMMO[current.ammo].activatable && leadAlive();
    const s = snap;
    if (
      s.status === status &&
      s.aim === aim &&
      s.shotsFired === shotsFired &&
      s.freed === freed &&
      s.broken === broken &&
      s.cleared === cleared &&
      s.quality === quality &&
      s.lastHash === lastHash &&
      s.activatable === activatable
    )
      return;
    snap = Object.freeze({ status, aim, shotsFired, freed, lanterns, broken, cleared, quality, lastHash, activatable });
    for (const cb of [...listeners]) cb();
  }

  // ── العرض (اختياري)
  let scene: GameScene | null = null;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let slowUntil = 0;
  let frames = 0;
  const monitor = createFrameMonitor();
  const hasRaf = hasWindow && typeof window.requestAnimationFrame === "function";

  function syncSceneAim() {
    scene?.setAim(aim.yawStep, aim.angleStep, aim.powerStep, status === "flight" ? null : guideAmmo);
  }

  /** أحداث الكسر تتراكم في المحاكاة حتى يقرأها العرض؛ بلا عرض نفرغها كي لا تكبر */
  function drainIfHeadless() {
    if (!scene || contextLost) sim.takeEvents();
  }

  function finishShot() {
    status = "settled";
    const hash = sim.hash();
    const freed = sim.freedCount();
    const cleared = freed === lanterns;
    lastHash = hash;
    const shot: Shot = { ...(current as Shot) };
    const steps = shotSteps;
    drainIfHeadless();
    syncSceneAim();
    refresh();
    emit("settled", { shot, hash, freed, cleared, steps });
  }

  /** خطوة واحدة بقاعدة sim.settle() نفسها: سكون QUIET.steps متتالية أو الحد الأقصى للطلقة */
  function stepOnce() {
    sim.step();
    shotSteps++;
    quiet = sim.isQuiet() ? quiet + 1 : 0;
    if (!clearedSeen && sim.isCleared()) {
      clearedSeen = true;
      justCleared = true;
    }
    if (quiet >= QUIET.steps || shotSteps >= QUIET.maxStepsPerShot) finishShot();
  }

  function shouldRun(): boolean {
    if (destroyed || paused || !hasRaf || !canvas) return false;
    const quietScene = status !== "flight";
    if (contextLost && quietScene) return false;
    if (typeof document !== "undefined" && document.hidden && quietScene) return false;
    return true;
  }

  function schedule() {
    if (raf || !shouldRun()) return;
    raf = window.requestAnimationFrame(frame);
  }

  function frame(now: number) {
    raf = 0;
    if (destroyed) return;
    const fresh = last === 0;
    const dtMs = fresh ? STEP_MS : Math.min(100, Math.max(0, now - last));
    last = now;
    if (!paused) {
      if (status === "flight") {
        acc += dtMs * (now < slowUntil ? SLOW_MO.scale : 1);
        let n = 0;
        while (status === "flight" && acc >= STEP_MS && n < MAX_STEPS_PER_FRAME) {
          stepOnce();
          if (destroyed) return;
          acc -= STEP_MS;
          n++;
        }
        if (status !== "flight" || n === MAX_STEPS_PER_FRAME) acc = 0;
        if (justCleared) {
          justCleared = false;
          slowUntil = now + SLOW_MO.ms;
        }
      }
      if (scene && !contextLost) {
        scene.draw(dtMs / 1000, status === "flight");
        if (!fresh) monitor.push(dtMs);
        if (++frames % AUTO_QUALITY.checkEvery === 0 && monitor.count) {
          const med = monitor.median();
          if (qualityMode === "auto" && quality === "high" && monitor.overBudget()) {
            quality = "low";
            scene.setQuality("low");
          }
          if (handlers.frame.size) emit("frame", { ms: Math.round(med * 100) / 100 });
        }
      } else drainIfHeadless();
      refresh();
    }
    schedule();
  }

  const onLost = () => {
    if (destroyed || contextLost) return;
    contextLost = true;
    emit("contextLost", {});
  };
  const onVisibility = () => {
    if (destroyed) return;
    if (!document.hidden) {
      last = 0;
      schedule();
    }
  };
  const onResize = () => scene?.resize();
  let ro: ResizeObserver | null = null;

  if (canvas) {
    canvas.addEventListener("webglcontextlost", onLost);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(onResize);
      ro.observe(canvas);
    } else if (hasWindow) window.addEventListener("resize", onResize);
    // three يُحمَّل كسولًا: لا يُنفَّذ أبدًا بلا canvas
    import("./render/scene")
      .then(({ createScene }) => {
        if (destroyed || contextLost) return;
        scene = createScene(canvas, sim, { quality, reducedMotion, guidePoints, seed: opts.seed, dawn });
        syncSceneAim();
        schedule();
      })
      .catch(() => onLost());
    schedule();
  }

  function dispatch(cmd: EngineCommand) {
    if (destroyed) return;
    switch (cmd.type) {
      case "aim": {
        if (cmd.ammo && Object.prototype.hasOwnProperty.call(AMMO, cmd.ammo)) guideAmmo = cmd.ammo;
        const next = freezeAim(cmd.yawStep, cmd.angleStep, cmd.powerStep);
        if (next.yawStep !== aim.yawStep || next.angleStep !== aim.angleStep || next.powerStep !== aim.powerStep) aim = next;
        if (status === "settled") status = "aim";
        syncSceneAim();
        refresh();
        return;
      }
      case "fire": {
        if (status === "flight" || clearedSeen || sim.isCleared() || !validShot(cmd.shot)) return;
        const s = cmd.shot;
        const shot: Shot = {
          idx: s.idx,
          ammo: s.ammo,
          yawStep: clampStep(s.yawStep, YAW_STEPS),
          angleStep: clampStep(s.angleStep, ANGLE_STEPS),
          powerStep: clampStep(s.powerStep, POWER_STEPS),
          activateAt: s.activateAt,
        };
        sim.fire(shot);
        leadIndex = sim.bodies.length - 1;
        current = shot;
        activated = AMMO[shot.ammo].activatable && shot.activateAt >= 0;
        shotsFired++;
        status = "flight";
        quiet = 0;
        shotSteps = 0;
        acc = 0;
        guideAmmo = shot.ammo;
        if (shot.yawStep !== aim.yawStep || shot.angleStep !== aim.angleStep || shot.powerStep !== aim.powerStep) aim = freezeAim(shot.yawStep, shot.angleStep, shot.powerStep);
        syncSceneAim();
        refresh();
        schedule();
        return;
      }
      case "activate": {
        if (status !== "flight" || !current || activated || !AMMO[current.ammo].activatable) return;
        const at = sim.activateNext();
        if (at < 0) return;
        activated = true;
        current.activateAt = at;
        refresh();
        emit("activated", { step: at });
        return;
      }
      case "setQuality": {
        if (cmd.quality !== "high" && cmd.quality !== "low" && cmd.quality !== "auto") return;
        qualityMode = cmd.quality;
        quality = cmd.quality === "low" ? "low" : "high";
        monitor.reset();
        scene?.setQuality(quality);
        refresh();
        return;
      }
      case "setDawn": {
        dawn = Number.isFinite(cmd.progress) ? Math.min(1, Math.max(0, cmd.progress)) : 0;
        scene?.setDawn(dawn);
        return;
      }
      case "pause": {
        paused = true;
        if (raf) window.cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      case "resume": {
        if (!paused) return;
        paused = false;
        last = 0;
        acc = 0;
        schedule();
        return;
      }
      case "step": {
        const n = Number.isFinite(cmd.steps) ? Math.max(0, Math.trunc(cmd.steps)) : 0;
        for (let i = 0; i < n && status === "flight" && !destroyed; i++) stepOnce();
        justCleared = false;
        refresh();
        return;
      }
    }
  }

  return {
    dispatch,
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getSnapshot() {
      return snap;
    },
    on<E extends keyof EngineEvents>(e: E, cb: (p: EngineEvents[E]) => void) {
      const set = handlers[e] as Set<(p: EngineEvents[E]) => void>;
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf && hasRaf) window.cancelAnimationFrame(raf);
      raf = 0;
      if (canvas) {
        // يُزال قبل forceContextLoss: فقد السياق المتعمد ليس «فقدًا» يُبلَّغ عنه
        canvas.removeEventListener("webglcontextlost", onLost);
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
        if (ro) ro.disconnect();
        else if (hasWindow) window.removeEventListener("resize", onResize);
      }
      scene?.dispose();
      scene = null;
      sim.free();
      listeners.clear();
      for (const k of Object.keys(handlers) as (keyof EngineEvents)[]) handlers[k].clear();
    },
  };
}
