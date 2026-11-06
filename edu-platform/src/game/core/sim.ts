/**
 * المحاكاة الحتمية فوق Rapier3D (GAME_DESIGN.md §4). تعمل بلا واجهة في Node وفي المتصفح وفي Worker لاحقًا.
 *  - خطوة ثابتة 1/60 وأربع تكرارات للحل، وترتيب ثابت: أجسام التصميم، ثم القناديل، ثم القذائف بترتيب الإطلاق.
 *  - أحداث القوة تُجمَّع بالحد الأقصى لكل جسم (تبديلية) ثم تُعالَج بترتيب الفهرس.
 *  - المدخلات أعداد صحيحة (Shot)، والسرعة من جدول صحيح؛ لا Math.sin/cos ولا Date ولا عشوائية.
 * العرض يقرأ اللقطة وأحداث الكسر فقط ولا يكتب في المحاكاة.
 */
import type { Rapier } from "../physics/types";
import { aimVelocity } from "./aim-table";
import { AMMO, COMET_SPLIT, PROJECTILE_FORCE_EVENT, PULSE_BURST, type AmmoKey } from "./ammo";
import { Fnv } from "./hash";
import type { Level, LevelBody } from "./level-schema";
import { LANTERN_MATERIAL, MATERIALS, type MaterialKey } from "./materials";
import { BOUNDS, DT, FREE_D2, GRAVITY, ISLAND, LANTERN_SIZE, LAUNCH, PROJECTILE_LIFE, QUIET, SOLVER_ITERATIONS } from "./world";

type World = InstanceType<Rapier["World"]>;
type RigidBody = ReturnType<World["createRigidBody"]>;
type EventQueue = InstanceType<Rapier["EventQueue"]>;

/** الطلقة: كل الحقول أعداد صحيحة (GAME_DESIGN.md §3) */
export type Shot = { idx: number; ammo: AmmoKey; yawStep: number; angleStep: number; powerStep: number; activateAt: number };

export type SimBody = {
  i: number;
  kind: "block" | "lantern" | "projectile";
  def: LevelBody | null;
  rb: RigidBody | null;
  alive: boolean;
  /** الأبعاد بالمتر (للقذيفة: القطر) */
  w: number;
  h: number;
  d: number;
  mat: MaterialKey | "lantern" | "projectile";
  ball: boolean;
};

/** حدث كسر للعرض فقط */
export type BreakEvent = { i: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; m: MaterialKey; w: number; h: number; d: number };
export type ActivationEvent = { kind: AmmoKey | "fizzle"; x: number; y: number; z: number };
export type ShotResult = { steps: number; hash: string; freed: number; broken: number; cleared: boolean };
/** للمعايرة فقط: أعلى ذروة قوة لكل خامة قبل الرمي (الحمل الساكن) وبعده */
export type ForceTrace = { opening: Partial<Record<MaterialKey, number>>; shots: Partial<Record<MaterialKey, number>> };

export type Sim = ReturnType<typeof createSim>;

const NO_EVENTS: { breaks: readonly BreakEvent[]; activations: readonly ActivationEvent[] } = Object.freeze({ breaks: Object.freeze([]), activations: Object.freeze([]) });

export function createSim(R: Rapier, level: Level, opts: { trace?: ForceTrace } = {}) {
  const trace = opts.trace;
  const world: World = new R.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = SOLVER_ITERATIONS;
  const events: EventQueue = new R.EventQueue(true);
  const colliderOwner = new Map<number, number>();
  const bodies: SimBody[] = [];
  let projectiles: SimBody[] = [];
  let currentAmmo: AmmoKey = "meteor";
  let breakingEnabled = false;
  let stepInShot = 0;
  let activated = false;
  let pendingActivate = -1;
  let totalSteps = 0;
  let brokenCount = 0;
  let breakLog: BreakEvent[] = [];
  let activationLog: ActivationEvent[] = [];

  // الجزيرة (ثابتة)، سطحها y = 0
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -ISLAND.hy, 0));
  world.createCollider(R.ColliderDesc.cuboid(ISLAND.hx, ISLAND.hy, ISLAND.hz).setFriction(0.9), ground);

  function addBox(kind: "block" | "lantern", def: LevelBody | null, x: number, y: number, z: number, w: number, h: number, d: number, mat: MaterialKey | "lantern") {
    const rb = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.05).setAngularDamping(0.1));
    const m = mat === "lantern" ? { ...LANTERN_MATERIAL, breakForce: Infinity } : MATERIALS[mat];
    const cd = R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setDensity(m.density).setFriction(m.friction).setRestitution(m.restitution);
    if (Number.isFinite(m.breakForce)) cd.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(m.breakForce * 0.5);
    const col = world.createCollider(cd, rb);
    const sb: SimBody = { i: bodies.length, kind, def, rb, alive: true, w, h, d, mat, ball: false };
    colliderOwner.set(col.handle, sb.i);
    bodies.push(sb);
  }
  for (const b of level.bodies) addBox("block", b, b.x / 100, b.y / 100, b.z / 100, b.w / 100, b.h / 100, b.d / 100, b.m);
  const lanternStart = bodies.length;
  for (const l of level.lanterns) addBox("lantern", null, l.x / 100, l.y / 100, l.z / 100, LANTERN_SIZE.w / 100, LANTERN_SIZE.h / 100, LANTERN_SIZE.d / 100, "lantern");
  const layoutCount = bodies.length;
  const lanternHome = new Map<number, { x: number; y: number; z: number }>();
  /** القنديل المحرَّر يبقى محرَّرًا (يُثبَّت داخل step، فالمتصفح والخادم يمرّان بالمسار نفسه) */
  const freed = new Uint8Array(layoutCount);

  function spawnProjectile(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const a = AMMO[currentAmmo];
    const rb = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinvel(vx, vy, vz).setCcdEnabled(true).setAngularDamping(0.8).setLinearDamping(0.02));
    const col = world.createCollider(
      R.ColliderDesc.ball(a.radius)
        .setDensity(a.density)
        .setFriction(0.6)
        .setRestitution(0.15)
        .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(PROJECTILE_FORCE_EVENT),
      rb,
    );
    const sb: SimBody = { i: bodies.length, kind: "projectile", def: null, rb, alive: true, w: a.radius * 2, h: a.radius * 2, d: a.radius * 2, mat: "projectile", ball: true };
    colliderOwner.set(col.handle, sb.i);
    bodies.push(sb);
    projectiles.push(sb);
  }

  function kill(sb: SimBody) {
    if (!sb.alive || !sb.rb) return;
    world.removeRigidBody(sb.rb);
    sb.rb = null;
    sb.alive = false;
  }

  /** نبضة شعاعية بترتيب الأجسام الثابت؛ المسافة بمربعها ثم sqrt مرة واحدة */
  function radialPulse(cx: number, cy: number, cz: number, radius: number, impulse: number, skip: number) {
    const r2 = radius * radius;
    for (const b of bodies) {
      if (!b.alive || !b.rb || b.i === skip) continue;
      const p = b.rb.translation();
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const k = (impulse * (1 - d2 / r2)) / d;
      b.rb.applyImpulse({ x: dx * k, y: dy * k + impulse * 0.15, z: dz * k }, true);
    }
  }

  function step() {
    world.step(events);
    totalSteps++;
    stepInShot++;
    // 1) أحداث القوة: الحد الأقصى لكل جسم (تبديلية)
    const peak = new Map<number, { f: number; heavy: boolean }>();
    events.drainContactForceEvents((e) => {
      const a = colliderOwner.get(e.collider1());
      const b = colliderOwner.get(e.collider2());
      const f = e.totalForceMagnitude();
      for (const [me, other] of [
        [a, b],
        [b, a],
      ] as const) {
        if (me === undefined) continue;
        const heavy = other !== undefined && bodies[other].kind === "projectile" && currentAmmo === "heavy";
        const prev = peak.get(me);
        peak.set(me, { f: prev ? Math.max(prev.f, f) : f, heavy: heavy || (prev?.heavy ?? false) });
      }
    });
    if (trace) {
      const bucket = breakingEnabled ? trace.shots : trace.opening;
      for (const [i, p] of peak) {
        const m = bodies[i].kind === "block" ? (bodies[i].mat as MaterialKey) : null;
        if (m) bucket[m] = Math.max(bucket[m] ?? 0, p.f);
      }
    }
    // 2) الكسر بترتيب الفهرس
    if (breakingEnabled && peak.size) {
      const idx = [...peak.keys()].sort((x, y) => x - y);
      for (const i of idx) {
        const sb = bodies[i];
        if (!sb.alive || sb.kind !== "block" || !sb.def) continue;
        const mat = MATERIALS[sb.def.m];
        const p = peak.get(i)!;
        if (mat.heavyOnly && !p.heavy) continue;
        if (p.f < mat.breakForce) continue;
        const pos = sb.rb!.translation();
        const v = sb.rb!.linvel();
        breakLog.push({ i, x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z, m: sb.def.m, w: sb.w, h: sb.h, d: sb.d });
        kill(sb);
        brokenCount++;
        if (mat.pulse) radialPulse(pos.x, pos.y, pos.z, mat.pulse.radius, mat.pulse.impulse, sb.i);
      }
    }
    // 3) التفعيل أثناء الطيران (مذنّب ينقسم، نبضة الفجر)
    if (!activated && pendingActivate >= 0 && stepInShot >= pendingActivate && projectiles[0]?.alive) {
      activated = true;
      const p = projectiles[0].rb!;
      const pos = p.translation();
      const v = p.linvel();
      activationLog.push({ kind: currentAmmo, x: pos.x, y: pos.y, z: pos.z });
      if (currentAmmo === "comet") {
        const { c, s, offset } = COMET_SPLIT;
        // العمودي الأفقي على المسار: (−vz, 0, vx)/|v_h|. القطعة المستدارة +12° تتجه نحوه، فتوضع على جانبه
        const hv = Math.sqrt(v.x * v.x + v.z * v.z);
        const px = hv > 1e-6 ? -v.z / hv : 1;
        const pz = hv > 1e-6 ? v.x / hv : 0;
        spawnProjectile(pos.x + px * offset, pos.y, pos.z + pz * offset, v.x * c - v.z * s, v.y, v.x * s + v.z * c);
        spawnProjectile(pos.x - px * offset, pos.y, pos.z - pz * offset, v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
      } else if (currentAmmo === "pulse") {
        radialPulse(pos.x, pos.y, pos.z, PULSE_BURST.radius, PULSE_BURST.impulse, projectiles[0].i);
      }
    }
    // 4) انطفاء القذائف البطيئة أو القديمة (بترتيب الإطلاق)
    for (const p of projectiles) {
      if (!p.alive || !p.rb) continue;
      const v = p.rb.linvel();
      if (stepInShot >= PROJECTILE_LIFE.maxSteps || (stepInShot >= PROJECTILE_LIFE.slowAfter && v.x * v.x + v.y * v.y + v.z * v.z < PROJECTILE_LIFE.slowV2)) {
        const t = p.rb.translation();
        activationLog.push({ kind: "fizzle", x: t.x, y: t.y, z: t.z });
        kill(p);
      }
    }
    // 5) الخروج من الحدود
    for (const b of bodies) {
      if (!b.alive || !b.rb) continue;
      const p = b.rb.translation();
      if (p.x < BOUNDS.minX || p.x > BOUNDS.maxX || p.y < BOUNDS.minY || p.z < BOUNDS.minZ || p.z > BOUNDS.maxZ) kill(b);
    }
    // 6) تثبيت القناديل المحررة بترتيب الفهرس (بعد الافتتاح فقط)
    if (breakingEnabled) {
      for (let i = lanternStart; i < layoutCount; i++) {
        if (freed[i]) continue;
        const b = bodies[i];
        const home = lanternHome.get(i);
        if (!home || !b.alive || !b.rb) {
          freed[i] = 1;
          continue;
        }
        const p = b.rb.translation();
        const dx = p.x - home.x;
        const dy = p.y - home.y;
        const dz = p.z - home.z;
        if (dx * dx + dy * dy + dz * dz > FREE_D2) freed[i] = 1;
      }
    }
  }

  function isQuiet(): boolean {
    for (const b of bodies) {
      if (!b.alive || !b.rb) continue;
      const v = b.rb.linvel();
      const w = b.rb.angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > QUIET.v2 || w.x * w.x + w.y * w.y + w.z * w.z > QUIET.w2) return false;
    }
    return true;
  }

  /** يخطو حتى السكون (QUIET.steps متتالية) أو الحد الأقصى؛ يعيد عدد الخطوات */
  function settle(maxSteps: number = QUIET.maxStepsPerShot): number {
    let quiet = 0;
    let n = 0;
    while (n < maxSteps) {
      step();
      n++;
      quiet = isQuiet() ? quiet + 1 : 0;
      if (quiet >= QUIET.steps) break;
    }
    return n;
  }

  function freedCount(): number {
    let n = 0;
    for (let i = lanternStart; i < layoutCount; i++) if (freed[i]) n++;
    return n;
  }

  function hash(): string {
    const h = new Fnv();
    h.word(totalSteps);
    h.word(brokenCount);
    for (const b of bodies) {
      h.word(b.i);
      if (!b.alive || !b.rb) {
        h.word(0xdead);
        continue;
      }
      const p = b.rb.translation();
      const q = b.rb.rotation();
      h.float(p.x).float(p.y).float(p.z).float(q.x).float(q.y).float(q.z).float(q.w);
    }
    h.word(freedCount());
    return h.hex();
  }

  // الافتتاح: استقرار أولي بلا كسر، ثم تسجيل أماكن القناديل
  const openingSteps = settle();
  for (let i = lanternStart; i < layoutCount; i++) {
    const b = bodies[i];
    if (b.rb) lanternHome.set(i, { ...b.rb.translation() });
  }
  breakingEnabled = true;
  stepInShot = 0;

  function fire(s: Shot) {
    for (const p of projectiles) kill(p);
    projectiles = [];
    currentAmmo = s.ammo;
    stepInShot = 0;
    activated = false;
    pendingActivate = AMMO[s.ammo].activatable ? s.activateAt : -1;
    const v = aimVelocity(s.yawStep, s.angleStep, s.powerStep);
    const k = AMMO[s.ammo].speedScale;
    spawnProjectile(LAUNCH.x, LAUNCH.y, LAUNCH.z, v.x * k, v.y * k, v.z * k);
  }

  /** تفعيل الخاصة الآن (لمسة أثناء الطيران): يعيد الخطوة الصحيحة المسجلة، أو −1 */
  function activateNext(): number {
    if (activated || pendingActivate >= 0 || !projectiles[0]?.alive || !AMMO[currentAmmo].activatable) return -1;
    pendingActivate = stepInShot + 1;
    return pendingActivate;
  }

  function runShot(s: Shot): ShotResult {
    fire(s);
    const steps = settle();
    const f = freedCount();
    return { steps, hash: hash(), freed: f, broken: brokenCount, cleared: f === layoutCount - lanternStart };
  }

  /** لقطة للعرض: [x, y, z, qx, qy, qz, qw, alive] لكل جسم */
  function snapshot(out: Float32Array) {
    for (const b of bodies) {
      const o = b.i * 8;
      if (o + 7 >= out.length) break;
      if (!b.alive || !b.rb) {
        out[o + 7] = 0;
        continue;
      }
      const p = b.rb.translation();
      const q = b.rb.rotation();
      out[o] = p.x;
      out[o + 1] = p.y;
      out[o + 2] = p.z;
      out[o + 3] = q.x;
      out[o + 4] = q.y;
      out[o + 5] = q.z;
      out[o + 6] = q.w;
      out[o + 7] = 1;
    }
  }

  return {
    level,
    bodies,
    layoutCount,
    lanternStart,
    openingSteps,
    lanternCount: layoutCount - lanternStart,
    step,
    isQuiet,
    settle,
    fire,
    activateNext,
    runShot,
    hash,
    freedCount,
    snapshot,
    /** هل تحررت كل القناديل؟ */
    isCleared(): boolean {
      return freedCount() === layoutCount - lanternStart;
    },
    /** هل القنديل i محرَّر؟ (للعرض: يصعد نجمًا) */
    isFreed(i: number): boolean {
      return freed[i] === 1;
    },
    /** أحداث الكسر والتفعيل منذ آخر استدعاء (للعرض فقط) */
    takeEvents(): { breaks: readonly BreakEvent[]; activations: readonly ActivationEvent[] } {
      // بلا تخصيص في الإطارات الهادئة: المصفوفتان الفارغتان المشتركتان للقراءة فقط
      if (!breakLog.length && !activationLog.length) return NO_EVENTS;
      const out = { breaks: breakLog, activations: activationLog };
      breakLog = [];
      activationLog = [];
      return out;
    },
    /** القذيفة الأولى الحية (لتتبع الكاميرا)، أو null */
    leadProjectile(): { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null {
      const p = projectiles.find((x) => x.alive && x.rb);
      if (!p?.rb) return null;
      const t = p.rb.translation();
      const v = p.rb.linvel();
      return { x: t.x, y: t.y, z: t.z, vx: v.x, vy: v.y, vz: v.z };
    },
    get currentAmmo() {
      return currentAmmo;
    },
    get totalSteps() {
      return totalSteps;
    },
    get stepInShot() {
      return stepInShot;
    },
    get broken() {
      return brokenCount;
    },
    free() {
      events.free();
      world.free();
    },
  };
}
