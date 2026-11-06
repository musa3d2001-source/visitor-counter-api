/**
 * [تجربة المرحلة 0 - كود مؤقت، ليس إنتاجيًا]
 * المحاكاة الحتمية فوق PhysicsAdapter:
 * - الترتيب الثابت: الأرضية (خانة 0) ثم أجسام التصميم بترتيبها ثم القناديل ثم القذائف بترتيب إطلاقها.
 * - قاعدة السكون: لا إطلاق حتى تنام كل الأجسام الديناميكية 30 خطوة متتالية، أو 900 خطوة حدًا أقصى.
 * - الكسر (زجاج، صندوق ضوء، حجر بالنيزك الثقيل) من أحداث قوة التماس المرتبة؛ الشظايا مرئية فقط.
 * - صندوق الضوء ينفجر نبضة تدفع ما حوله وتشعل الصناديق القريبة بعد 6 خطوات (تفاعل متسلسل).
 * - القنديل يتحرر حين يبتعد عن موضعه 0.9 م (بالمربعات، بلا جذر) أو يخرج من المشهد.
 * - تيار "sim" من المولّد يحدد دوران القذيفة الابتدائي؛ تيار "render" للعرض فقط.
 * القائمة البيضاء: من Math فقط abs/min/max/floor/ceil/round/trunc/sign/sqrt/imul/fround.
 */
import { aimVelocity } from "./aim-table";
import { Fnv1a } from "./hash";
import type { Level, Shot } from "./level-schema";
import { AMMO, MATERIALS, type AmmoId, type MaterialId } from "./materials";
import { createRapierAdapter, type PhysicsAdapter, type RapierModule } from "./physics-adapter";
import { createStreams, type Rng } from "./rng";

export const GRAVITY_Y = -9.81;
export const SETTLE_QUIET_STEPS = 30;
export const SETTLE_MAX_STEPS = 900;
export const LANTERN_FREE_DIST2 = 0.81;
export const PULSE_CHAIN_DELAY = 6;
const DEG = 0.017453292519943295;
const CM = 0.01;
const MIN_X = -20;
const MAX_X = 60;
const MIN_Y = -4;

export type BodyRole = "ground" | "block" | "lantern" | "projectile";

export interface SimBody {
  slot: number;
  role: BodyRole;
  key: string;
  material: MaterialId | null;
  ammo: AmmoId | null;
  shape: "box" | "ball";
  hx: number;
  hy: number;
  r: number;
  fixed: boolean;
  alive: boolean;
  broken: boolean;
  freed: boolean;
  x0: number;
  y0: number;
}

export interface SimEvent {
  type: "break" | "pulse" | "freed" | "fire" | "out";
  body: number;
  x: number;
  y: number;
  step: number;
}

export class Simulation {
  readonly bodies: SimBody[] = [];
  /** أحداث للعرض (شظايا، نبضات، قناديل) يستهلكها العارض؛ لا تؤثر في الفيزياء */
  readonly events: SimEvent[] = [];
  readonly renderRng: Rng;
  steps = 0;
  shotsFired = 0;
  sinceShot = 0;
  quiet = 0;
  private readonly phys: PhysicsAdapter;
  private readonly simRng: Rng;
  private readonly tmp = new Float64Array(6);
  private readonly pulseQueue: { body: number; at: number }[] = [];
  private readonly lanternIdx: number[] = [];

  constructor(
    R: RapierModule,
    readonly level: Level,
    readonly seed: number,
  ) {
    const streams = createStreams(seed);
    this.simRng = streams.sim;
    this.renderRng = streams.render;
    this.phys = createRapierAdapter(R, GRAVITY_Y);
    // الأرضية: صندوق ثابت سطحه عند y = 0
    this.addBody({ role: "ground", key: "ground", material: null, ammo: null, shape: "box", hx: 40, hy: 0.5, r: 0, fixed: true, x: 20, y: -0.5, rot: 0, density: 1, friction: 0.8, restitution: 0, restitutionMax: false, ccd: false, threshold: null });
    for (const b of level.bodies) {
      const m = MATERIALS[b.material];
      const isBox = b.shape === "box";
      this.addBody({
        role: "block",
        key: b.id,
        material: b.material,
        ammo: null,
        shape: b.shape,
        hx: isBox ? ((b.w ?? 0) * CM) / 2 : 0,
        hy: isBox ? ((b.h ?? 0) * CM) / 2 : 0,
        r: isBox ? 0 : (b.r ?? 0) * CM,
        fixed: b.fixed,
        x: b.x * CM,
        y: b.y * CM,
        rot: b.rot * DEG,
        density: m.density,
        friction: m.friction,
        restitution: m.restitution,
        restitutionMax: m.restitutionMax,
        ccd: false,
        threshold: m.breakForce,
      });
    }
    for (const l of level.lanterns) {
      const m = MATERIALS.lantern;
      const i = this.addBody({ role: "lantern", key: l.id, material: "lantern", ammo: null, shape: "ball", hx: 0, hy: 0, r: l.r * CM, fixed: false, x: l.x * CM, y: l.y * CM, rot: 0, density: m.density, friction: m.friction, restitution: m.restitution, restitutionMax: false, ccd: false, threshold: null });
      this.lanternIdx.push(i);
    }
  }

  private addBody(o: {
    role: BodyRole;
    key: string;
    material: MaterialId | null;
    ammo: AmmoId | null;
    shape: "box" | "ball";
    hx: number;
    hy: number;
    r: number;
    fixed: boolean;
    x: number;
    y: number;
    rot: number;
    density: number;
    friction: number;
    restitution: number;
    restitutionMax: boolean;
    ccd: boolean;
    threshold: number | null;
    linvel?: { x: number; y: number };
    angvel?: number;
  }): number {
    const slot = this.phys.add({
      kind: o.fixed ? "fixed" : "dynamic",
      shape: o.shape,
      hx: o.hx,
      hy: o.hy,
      r: o.r,
      x: o.x,
      y: o.y,
      rot: o.rot,
      density: o.density,
      friction: o.friction,
      restitution: o.restitution,
      restitutionMax: o.restitutionMax,
      ccd: o.ccd,
      forceEventThreshold: o.threshold,
      linvel: o.linvel,
      angvel: o.angvel,
    });
    this.bodies.push({ slot, role: o.role, key: o.key, material: o.material, ammo: o.ammo, shape: o.shape, hx: o.hx, hy: o.hy, r: o.r, fixed: o.fixed, alive: true, broken: false, freed: false, x0: o.x, y0: o.y });
    return slot;
  }

  /** يكتب x, y, rot, vx, vy, w للجسم i */
  read(i: number, out: Float64Array): void {
    this.phys.read(this.bodies[i].slot, out);
  }

  /** إطلاق قذيفة: الفهرس يجب أن يكون التالي بالضبط */
  fire(shot: Shot): void {
    if (shot.idx !== this.shotsFired) throw new Error(`shot idx ${shot.idx} != ${this.shotsFired}`);
    const v = aimVelocity(shot.angleStep, shot.powerStep);
    const a = AMMO[shot.ammo];
    const spin = this.simRng.nextInt(-20, 20) / 10;
    const lx = this.level.launcher.x * CM;
    const ly = this.level.launcher.y * CM;
    const i = this.addBody({ role: "projectile", key: `shot-${shot.idx}`, material: null, ammo: shot.ammo, shape: "ball", hx: 0, hy: 0, r: a.radius, fixed: false, x: lx, y: ly, rot: 0, density: a.density, friction: a.friction, restitution: a.restitution, restitutionMax: false, ccd: true, threshold: null, linvel: { x: v.vx, y: v.vy }, angvel: spin });
    this.events.push({ type: "fire", body: i, x: lx, y: ly, step: this.steps });
    this.shotsFired++;
    this.sinceShot = 0;
    this.quiet = 0;
  }

  private breakBody(i: number): void {
    const b = this.bodies[i];
    if (!b.alive) return;
    this.read(i, this.tmp);
    const x = this.tmp[0];
    const y = this.tmp[1];
    this.phys.remove(b.slot);
    b.alive = false;
    b.broken = true;
    this.events.push({ type: "break", body: i, x, y, step: this.steps });
    const pulse = b.material ? MATERIALS[b.material].pulse : null;
    if (pulse) this.pulse(i, x, y, pulse.radius, pulse.strength);
  }

  private pulse(src: number, px: number, py: number, radius: number, strength: number): void {
    this.events.push({ type: "pulse", body: src, x: px, y: py, step: this.steps });
    const r2 = radius * radius;
    for (let j = 0; j < this.bodies.length; j++) {
      const b = this.bodies[j];
      if (!b.alive || b.fixed || j === src) continue;
      this.read(j, this.tmp);
      const dx = this.tmp[0] - px;
      const dy = this.tmp[1] - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2 || d2 < 1e-8) continue;
      if (b.material === "lightbox") {
        if (!this.pulseQueue.some((q) => q.body === j)) this.pulseQueue.push({ body: j, at: this.steps + PULSE_CHAIN_DELAY });
        continue;
      }
      const d = Math.sqrt(d2);
      const imp = (strength * this.phys.mass(b.slot) * (1 - d2 / r2)) / d;
      this.phys.applyImpulse(b.slot, dx * imp, dy * imp);
    }
  }

  private tryBreak(target: number, other: number, force: number): void {
    const b = this.bodies[target];
    if (!b || !b.alive || b.role !== "block" || !b.material) return;
    const m = MATERIALS[b.material];
    if (m.breakForce === null || force < m.breakForce) return;
    if (m.breakOnlyBy !== null && this.bodies[other]?.ammo !== m.breakOnlyBy) return;
    this.breakBody(target);
  }

  /** خطوة ثابتة واحدة مع الكسر والنبضات والحدود والقناديل */
  step(): void {
    this.phys.step();
    this.steps++;
    this.sinceShot++;
    for (const [a, b, f] of this.phys.takeForceEvents()) {
      this.tryBreak(a, b, f);
      this.tryBreak(b, a, f);
    }
    if (this.pulseQueue.length) {
      for (let k = 0; k < this.pulseQueue.length; ) {
        const q = this.pulseQueue[k];
        if (q.at <= this.steps) {
          this.pulseQueue.splice(k, 1);
          this.breakBody(q.body);
        } else k++;
      }
    }
    for (let i = 1; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b.alive || b.fixed) continue;
      this.read(i, this.tmp);
      const x = this.tmp[0];
      const y = this.tmp[1];
      if (x < MIN_X || x > MAX_X || y < MIN_Y) {
        this.phys.remove(b.slot);
        b.alive = false;
        this.events.push({ type: "out", body: i, x, y, step: this.steps });
        if (b.role === "lantern" && !b.freed) {
          b.freed = true;
          this.events.push({ type: "freed", body: i, x, y, step: this.steps });
        }
        continue;
      }
      if (b.role === "lantern" && !b.freed) {
        const dx = x - b.x0;
        const dy = y - b.y0;
        if (dx * dx + dy * dy >= LANTERN_FREE_DIST2) {
          b.freed = true;
          this.events.push({ type: "freed", body: i, x, y, step: this.steps });
        }
      }
    }
    this.quiet = this.allAsleep() ? this.quiet + 1 : 0;
  }

  allAsleep(): boolean {
    if (this.pulseQueue.length) return false;
    for (let i = 1; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.alive && !b.fixed && !this.phys.isSleeping(b.slot)) return false;
    }
    return true;
  }

  /** هل اكتمل السكون بعد آخر إطلاق؟ (30 خطوة نوم متتالية أو 900 خطوة) */
  isSettled(): boolean {
    return this.quiet >= SETTLE_QUIET_STEPS || this.sinceShot >= SETTLE_MAX_STEPS;
  }

  settle(maxTotalSteps: number): void {
    while (!this.isSettled()) {
      if (this.steps >= maxTotalSteps) throw new Error("step cap exceeded");
      this.step();
    }
  }

  isCleared(): boolean {
    for (const i of this.lanternIdx) if (!this.bodies[i].freed) return false;
    return true;
  }

  freedCount(): number {
    let n = 0;
    for (const i of this.lanternIdx) if (this.bodies[i].freed) n++;
    return n;
  }

  /** بصمة FNV-1a على كل الأجسام بالترتيب الثابت (دون الأرضية) */
  stateHash(): string {
    const h = new Fnv1a();
    h.u32(this.steps).u32(this.bodies.length).u32(this.shotsFired);
    for (let i = 1; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      h.u32((b.alive ? 1 : 0) | (b.freed ? 2 : 0) | (b.broken ? 4 : 0));
      if (!b.alive) continue;
      this.read(i, this.tmp);
      for (let k = 0; k < 6; k++) h.f32(this.tmp[k]);
    }
    return h.hex();
  }

  destroy(): void {
    this.phys.free();
  }
}
