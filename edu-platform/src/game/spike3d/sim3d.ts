/**
 * تجربة 3D: محاكاة حتمية فوق Rapier3D (الحزمة الحتمية)، تعمل بلا واجهة في Node وفي المتصفح.
 * القواعد نفسها المقترحة للإنتاج كما في تجربة 2D:
 *  - خطوة ثابتة 1/60 وأربع تكرارات للحل، وترتيب ثابت للأجسام (ترتيب التصميم ثم القذائف).
 *  - أحداث القوة تُجمَّع بعملية تبديلية (الحد الأقصى لكل جسم) ثم تُعالَج بترتيب الفهرس.
 *  - المدخلات أعداد صحيحة { ammo, yawStep, pitchStep, powerStep, activateAt }، والسرعة من جدول صحيح.
 *  - لا Math.sin/cos ولا Date ولا عشوائية؛ والبصمة FNV-1a على بتات float32 الخام للموضع والدوران (رباعي).
 * العرض يقرأ اللقطة وأحداث الكسر فقط ولا يكتب في المحاكاة، فالشظايا والغبار لا تمس الفيزياء.
 */
import { Fnv } from "../spike/det";
import { aimVelocity3 } from "./det3d";
import { AMMO3, LAUNCH3, MATERIALS3, type AmmoKey, type Body3, type Layout3, type MaterialKey, type Shot3 } from "./layouts3d";

/** واجهة Rapier3D التي نحتاجها (الحزمتان العادية و-compat تطابقانها) */
export type Rapier3 = typeof import("@dimforge/rapier3d-deterministic");
type World = InstanceType<Rapier3["World"]>;
type RigidBody = ReturnType<World["createRigidBody"]>;
type EventQueue = InstanceType<Rapier3["EventQueue"]>;

export const DT = 1 / 60;
export const QUIET_STEPS = 30;
export const MAX_STEPS_PER_SHOT = 900;
const QUIET_V2 = 0.05 * 0.05;
const QUIET_W2 = 0.1 * 0.1;
/** حدود الملعب (م): ما يخرج منها يُزال بترتيب الفهرس (يسقط في البحر أو يطير بعيدًا) */
const BOUNDS = { minX: -22, maxX: 22, minY: -5, minZ: -24, maxZ: 26 };
/** الجزيرة: نصف الأبعاد (م) */
export const ISLAND = { hx: 9, hz: 7 };
/** القذيفة تنطفئ إذا تدحرجت ببطء (أقل من 1 م/ث بعد ثلاثة أرباع ثانية) أو بعد 4 ثوانٍ، فلا تطول الرمية */
const PROJECTILE_SLOW_V2 = 1;
const PROJECTILE_SLOW_AFTER = 45;
const PROJECTILE_LIFETIME = 240;
/** القنديل يتحرر إذا ابتعد 0.6م عن مكانه بعد الاستقرار الأول */
const FREE_D2 = 0.6 * 0.6;
/** انقسام المذنّب: دوران سرعة القطعتين ±12° حول المحور الرأسي (جيب وتمام ثابتان) */
const SPLIT_C = 0.9781476007338057;
const SPLIT_S = 0.20791169081775934;

export type SimBody3 = {
  i: number;
  def: Body3 | null;
  kind: "block" | "lantern" | "projectile";
  rb: RigidBody | null;
  alive: boolean;
  /** الأبعاد بالمتر (للقذيفة: القطر) */
  w: number;
  h: number;
  d: number;
  mat: MaterialKey | "projectile";
  ball: boolean;
};

/** حدث كسر للعرض فقط (موضع ومادة وسرعة لحظة الكسر) */
export type BreakEvent = { i: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; m: MaterialKey; w: number; h: number; d: number };

export type ShotResult3 = { steps: number; hash: string; freed: number; broken: number };
export type Sim3 = ReturnType<typeof createSim3>;

/** للمعايرة فقط (سكربت tune3d): أعلى ذروة قوة لكل مادة قبل الرمي (الحمل الساكن) وبعده */
export type ForceTrace = { opening: Partial<Record<MaterialKey, number>>; shots: Partial<Record<MaterialKey, number>> };

export function createSim3(R: Rapier3, layout: Layout3, trace?: ForceTrace) {
  const world: World = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.numSolverIterations = 4;
  const events: EventQueue = new R.EventQueue(true);
  const colliderOwner = new Map<number, number>();
  const bodies: SimBody3[] = [];
  let projectiles: SimBody3[] = [];
  let currentAmmo: AmmoKey = "meteor";
  let breakingEnabled = false;
  let stepInShot = 0;
  let activated = false;
  let pendingActivate = -1;
  let totalSteps = 0;
  let brokenCount = 0;
  const lanternHome = new Map<number, { x: number; y: number; z: number }>();
  /** القنديل المحرَّر يبقى محرَّرًا (يُثبَّت داخل step بعد كل خطوة، فالمتصفح والخادم يمرّان بالمسار نفسه) */
  const freed = new Uint8Array(layout.bodies.length);
  /** يملؤها step() ويفرغها العرض */
  let breakLog: BreakEvent[] = [];
  let activationLog: { kind: AmmoKey | "fizzle"; x: number; y: number; z: number }[] = [];

  // الجزيرة (ثابتة)، سطحها y = 0
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(R.ColliderDesc.cuboid(ISLAND.hx, 0.5, ISLAND.hz).setFriction(0.9), ground);

  function addBody(def: Body3) {
    const mat = MATERIALS3[def.m];
    const ball = def.s === "ball";
    const rb = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(def.x / 100, def.y / 100, def.z / 100)
        .setLinearDamping(0.05)
        .setAngularDamping(ball ? 0.6 : 0.1),
    );
    const cd = (ball ? R.ColliderDesc.ball(def.w / 200) : R.ColliderDesc.cuboid(def.w / 200, def.h / 200, def.d / 200))
      .setDensity(mat.density)
      .setFriction(mat.friction)
      .setRestitution(mat.restitution);
    if (Number.isFinite(mat.breakForce)) {
      cd.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(mat.breakForce * 0.5);
    }
    const col = world.createCollider(cd, rb);
    const sb: SimBody3 = { i: bodies.length, def, kind: def.m === "lantern" ? "lantern" : "block", rb, alive: true, w: def.w / 100, h: def.h / 100, d: def.d / 100, mat: def.m, ball };
    colliderOwner.set(col.handle, sb.i);
    bodies.push(sb);
  }
  for (const def of layout.bodies) addBody(def);
  const layoutCount = bodies.length;

  function spawnProjectile(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const a = AMMO3[currentAmmo];
    const rb = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinvel(vx, vy, vz).setCcdEnabled(true).setAngularDamping(0.8).setLinearDamping(0.02));
    const col = world.createCollider(
      R.ColliderDesc.ball(a.radius).setDensity(a.density).setFriction(0.6).setRestitution(0.15).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(20),
      rb,
    );
    const sb: SimBody3 = { i: bodies.length, def: null, kind: "projectile", rb, alive: true, w: a.radius * 2, h: a.radius * 2, d: a.radius * 2, mat: "projectile", ball: true };
    colliderOwner.set(col.handle, sb.i);
    bodies.push(sb);
    projectiles.push(sb);
  }

  function kill(sb: SimBody3) {
    if (!sb.alive || !sb.rb) return;
    world.removeRigidBody(sb.rb);
    sb.rb = null;
    sb.alive = false;
  }

  /** نبضة شعاعية: تمر على الأجسام بترتيبها الثابت، والمسافة بمربعها ثم sqrt مرة واحدة */
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
    // 1) أحداث القوة: الحد الأقصى لكل جسم (تبديلية، فترتيب الأحداث لا يؤثر)
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
        const m = bodies[i].kind === "projectile" ? null : (bodies[i].mat as MaterialKey);
        if (m) bucket[m] = Math.max(bucket[m] ?? 0, p.f);
      }
    }
    // 2) الكسر بترتيب الفهرس
    if (breakingEnabled && peak.size) {
      const idx = [...peak.keys()].sort((x, y) => x - y);
      for (const i of idx) {
        const sb = bodies[i];
        if (!sb.alive || sb.kind !== "block" || !sb.def) continue;
        const mat = MATERIALS3[sb.def.m];
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
        spawnProjectile(pos.x - 0.3, pos.y, pos.z, v.x * SPLIT_C - v.z * SPLIT_S, v.y, v.x * SPLIT_S + v.z * SPLIT_C);
        spawnProjectile(pos.x + 0.3, pos.y, pos.z, v.x * SPLIT_C + v.z * SPLIT_S, v.y, -v.x * SPLIT_S + v.z * SPLIT_C);
      } else if (currentAmmo === "pulse") {
        radialPulse(pos.x, pos.y, pos.z, 3.4, 2.4, projectiles[0].i);
      }
    }
    // 4) انطفاء القذائف البطيئة أو القديمة (بترتيب الإطلاق)
    for (const p of projectiles) {
      if (!p.alive || !p.rb) continue;
      const v = p.rb.linvel();
      if (stepInShot >= PROJECTILE_LIFETIME || (stepInShot >= PROJECTILE_SLOW_AFTER && v.x * v.x + v.y * v.y + v.z * v.z < PROJECTILE_SLOW_V2)) {
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
      for (let i = 0; i < layoutCount; i++) {
        const b = bodies[i];
        if (b.kind !== "lantern" || freed[i]) continue;
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
      if (v.x * v.x + v.y * v.y + v.z * v.z > QUIET_V2 || w.x * w.x + w.y * w.y + w.z * w.z > QUIET_W2) return false;
    }
    return true;
  }

  /** يخطو حتى السكون (QUIET_STEPS متتالية) أو الحد الأقصى؛ يعيد عدد الخطوات */
  function settle(maxSteps = MAX_STEPS_PER_SHOT): number {
    let quiet = 0;
    let n = 0;
    while (n < maxSteps) {
      step();
      n++;
      quiet = isQuiet() ? quiet + 1 : 0;
      if (quiet >= QUIET_STEPS) break;
    }
    return n;
  }

  function freedCount(): number {
    let n = 0;
    for (let i = 0; i < layoutCount; i++) if (bodies[i].kind === "lantern" && freed[i]) n++;
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
      h.float(p.x);
      h.float(p.y);
      h.float(p.z);
      h.float(q.x);
      h.float(q.y);
      h.float(q.z);
      h.float(q.w);
    }
    h.word(freedCount());
    return h.hex();
  }

  /** الافتتاح: استقرار أولي بلا كسر، ثم تسجيل أماكن القناديل */
  const openingSteps = settle();
  for (const b of bodies) if (b.kind === "lantern" && b.rb) lanternHome.set(b.i, { ...b.rb.translation() });
  breakingEnabled = true;

  function fire(s: Shot3) {
    for (const p of projectiles) kill(p);
    projectiles = [];
    currentAmmo = s.ammo;
    stepInShot = 0;
    activated = false;
    pendingActivate = s.activateAt;
    const v = aimVelocity3(s.yawStep, s.pitchStep, s.powerStep);
    const k = AMMO3[s.ammo].speedScale;
    spawnProjectile(LAUNCH3.x, LAUNCH3.y, LAUNCH3.z, v.x * k, v.y * k, v.z * k);
  }

  /** تفعيل القذيفة الآن (لمسة أثناء الطيران): يُسجَّل كخطوة صحيحة activateAt = stepInShot + 1، فيُعاد بالضبط */
  function activateNext(): number {
    if (activated || pendingActivate >= 0 || !projectiles[0]?.alive) return -1;
    if (currentAmmo !== "comet" && currentAmmo !== "pulse") return -1;
    pendingActivate = stepInShot + 1;
    return pendingActivate;
  }

  function runShot(s: Shot3): ShotResult3 {
    fire(s);
    const steps = settle();
    return { steps, hash: hash(), freed: freedCount(), broken: brokenCount };
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
    layout,
    bodies,
    layoutCount,
    openingSteps,
    step,
    isQuiet,
    settle,
    fire,
    activateNext,
    runShot,
    hash,
    freedCount,
    snapshot,
    lanternCount: bodies.filter((b) => b.kind === "lantern").length,
    /** أحداث الكسر والتفعيل منذ آخر استدعاء (للشظايا والوميض في العرض) */
    takeEvents() {
      const out = { breaks: breakLog, activations: activationLog };
      breakLog = [];
      activationLog = [];
      return out;
    },
    /** موضع القذيفة الأولى الحية (لتتبع الكاميرا)، أو null */
    leadProjectile(): { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null {
      const p = projectiles.find((x) => x.alive && x.rb);
      if (!p?.rb) return null;
      const t = p.rb.translation();
      const v = p.rb.linvel();
      return { x: t.x, y: t.y, z: t.z, vx: v.x, vy: v.y, vz: v.z };
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

export type HeadlessResult3 = { key: string; hashes: string[]; finalHash: string; steps: number; freed: number; lanterns: number; broken: number; bodies: number; ms: number };

/** إعادة جولة كاملة بلا عرض: الأساس الذي سيستخدمه الخادم في /finish */
export function runHeadless3(R: Rapier3, layout: Layout3, now: () => number = () => 0): HeadlessResult3 {
  const t0 = now();
  const sim = createSim3(R, layout);
  const hashes = [sim.hash()];
  for (const s of layout.shots) hashes.push(sim.runShot(s).hash);
  const res = {
    key: layout.key,
    hashes,
    finalHash: hashes[hashes.length - 1],
    steps: sim.totalSteps,
    freed: sim.freedCount(),
    lanterns: sim.lanternCount,
    broken: sim.broken,
    bodies: layout.bodies.length,
    ms: 0,
  };
  sim.free();
  res.ms = now() - t0;
  return res;
}
