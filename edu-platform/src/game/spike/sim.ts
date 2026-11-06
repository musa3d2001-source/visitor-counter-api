/**
 * نموذج المرحلة 0: محاكاة حتمية فوق Rapier2D (الحزمة الحتمية)، تعمل بلا واجهة في Node وفي المتصفح.
 * القواعد التي نختبرها هنا هي نفسها المقترحة للإنتاج:
 *  - خطوة ثابتة 1/60، وترتيب ثابت للأجسام (ترتيب التصميم)، ومعالجة الأحداث مجمّعة ثم بترتيب الفهرس.
 *  - المدخلات أعداد صحيحة { ammo, angleStep, powerStep, activateAt }، والتحويل إلى سرعة من جدول صحيح.
 *  - لا Math.sin/cos ولا Date ولا عشوائية خارج المولّد المبذّر؛ والبصمة FNV-1a على بتات float32 الخام.
 */
import { AMMO, MATERIALS, type LayoutBody, type SpikeLayout, type SpikeShot } from "./layouts";
import { Fnv, aimVelocity } from "./det";

/** واجهة Rapier التي نحتاجها (الحزمتان العادية و-compat تطابقانها) */
export type Rapier = typeof import("@dimforge/rapier2d-deterministic");
type World = InstanceType<Rapier["World"]>;
type RigidBody = ReturnType<World["createRigidBody"]>;
type EventQueue = InstanceType<Rapier["EventQueue"]>;

export const DT = 1 / 60;
export const QUIET_STEPS = 30;
export const MAX_STEPS_PER_SHOT = 900;
const QUIET_V2 = 0.05 * 0.05;
const QUIET_W2 = 0.1 * 0.1;
const LAUNCH = { x: 34, y: 2.2 };
const BOUNDS = { minX: -8, maxX: 45, minY: -6 };
/** القنديل يتحرر إذا ابتعد 0.6م عن مكانه بعد الاستقرار الأول */
const FREE_D2 = 0.6 * 0.6;
/** دوران سرعة المذنّب ±12° (جيب وتمام ثابتان محسوبان مسبقًا) */
const SPLIT_C = 0.9781476007338057;
const SPLIT_S = 0.20791169081775934;

export type SimBody = {
  i: number;
  def: LayoutBody | null;
  kind: "block" | "lantern" | "projectile";
  rb: RigidBody | null;
  alive: boolean;
  w: number;
  h: number;
  mat: LayoutBody["m"] | "projectile";
};

export type ShotResult = { steps: number; hash: string; freed: number; broken: number };

export type Sim = ReturnType<typeof createSim>;

export function createSim(R: Rapier, layout: SpikeLayout) {
  const world: World = new R.World({ x: 0, y: -9.81 });
  world.timestep = DT;
  world.numSolverIterations = 4;
  const events: EventQueue = new R.EventQueue(true);
  const colliderOwner = new Map<number, number>();
  const bodies: SimBody[] = [];
  let projectiles: SimBody[] = [];
  let currentAmmo: SpikeShot["ammo"] = "meteor";
  let breakingEnabled = false;
  let stepInShot = 0;
  let activated = false;
  let pendingActivate = -1;
  let totalSteps = 0;
  let brokenCount = 0;
  const lanternHome = new Map<number, { x: number; y: number }>();

  // الأرض (ثابتة)
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(15, -0.5));
  world.createCollider(R.ColliderDesc.cuboid(40, 0.5).setFriction(0.9), ground);

  function addBody(def: LayoutBody) {
    const mat = MATERIALS[def.m];
    const rb = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(def.x / 100, def.y / 100)
        .setLinearDamping(0.05)
        .setAngularDamping(def.s === "ball" ? 0.6 : 0.1),
    );
    const cd = (def.s === "ball" ? R.ColliderDesc.ball(def.w / 200) : R.ColliderDesc.cuboid(def.w / 200, def.h / 200))
      .setDensity(mat.density)
      .setFriction(mat.friction)
      .setRestitution(mat.restitution);
    if (Number.isFinite(mat.breakForce)) {
      cd.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(mat.breakForce * 0.5);
    }
    const col = world.createCollider(cd, rb);
    const sb: SimBody = { i: bodies.length, def, kind: def.m === "lantern" ? "lantern" : "block", rb, alive: true, w: def.w / 100, h: def.h / 100, mat: def.m };
    colliderOwner.set(col.handle, sb.i);
    bodies.push(sb);
  }
  for (const def of layout.bodies) addBody(def);
  const layoutCount = bodies.length;

  function spawnProjectile(x: number, y: number, vx: number, vy: number) {
    const a = AMMO[currentAmmo];
    const rb = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y).setLinvel(vx, vy).setCcdEnabled(true).setAngularDamping(0.8).setLinearDamping(0.02));
    const col = world.createCollider(
      R.ColliderDesc.ball(a.radius).setDensity(a.density).setFriction(0.6).setRestitution(0.15).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(60),
      rb,
    );
    const sb: SimBody = { i: bodies.length, def: null, kind: "projectile", rb, alive: true, w: a.radius * 2, h: a.radius * 2, mat: "projectile" };
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

  /** نبضة شعاعية: تمر على الأجسام بترتيبها الثابت، والمسافة بمربعها ثم sqrt مرة واحدة */
  function radialPulse(cx: number, cy: number, radius: number, impulse: number, skip: number) {
    const r2 = radius * radius;
    for (const b of bodies) {
      if (!b.alive || !b.rb || b.i === skip) continue;
      const p = b.rb.translation();
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const k = (impulse * (1 - d2 / r2)) / d;
      b.rb.applyImpulse({ x: dx * k, y: dy * k }, true);
    }
  }

  function step() {
    world.step(events);
    totalSteps++;
    stepInShot++;
    // 1) أحداث القوة: تجميع الحد الأقصى لكل جسم (عملية تبديلية، فترتيب الأحداث لا يؤثر)
    const peak = new Map<number, { f: number; heavy: boolean }>();
    events.drainContactForceEvents((e) => {
      const a = colliderOwner.get(e.collider1());
      const b = colliderOwner.get(e.collider2());
      const f = e.totalForceMagnitude();
      for (const [me, other] of [[a, b], [b, a]] as const) {
        if (me === undefined) continue;
        const heavy = other !== undefined && bodies[other].kind === "projectile" && currentAmmo === "heavy";
        const prev = peak.get(me);
        if (!prev || f > prev.f || (heavy && !prev.heavy)) peak.set(me, { f: prev ? Math.max(prev.f, f) : f, heavy: heavy || (prev?.heavy ?? false) });
      }
    });
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
        kill(sb);
        brokenCount++;
        if (mat.pulse) radialPulse(pos.x, pos.y, mat.pulse.radius, mat.pulse.impulse, sb.i);
      }
    }
    // 3) التفعيل أثناء الطيران (مذنّب ينقسم، نبضة الفجر)
    if (!activated && pendingActivate >= 0 && stepInShot >= pendingActivate && projectiles[0]?.alive) {
      activated = true;
      const p = projectiles[0].rb!;
      const pos = p.translation();
      const v = p.linvel();
      if (currentAmmo === "comet") {
        spawnProjectile(pos.x, pos.y + 0.3, v.x * SPLIT_C - v.y * SPLIT_S, v.x * SPLIT_S + v.y * SPLIT_C);
        spawnProjectile(pos.x, pos.y - 0.3, v.x * SPLIT_C + v.y * SPLIT_S, -v.x * SPLIT_S + v.y * SPLIT_C);
      } else if (currentAmmo === "pulse") {
        radialPulse(pos.x, pos.y, 3.2, 7, projectiles[0].i);
      }
    }
    // 4) الخروج من الحدود
    for (const b of bodies) {
      if (!b.alive || !b.rb) continue;
      const p = b.rb.translation();
      if (p.x < BOUNDS.minX || p.x > BOUNDS.maxX || p.y < BOUNDS.minY) kill(b);
    }
  }

  function isQuiet(): boolean {
    for (const b of bodies) {
      if (!b.alive || !b.rb) continue;
      const v = b.rb.linvel();
      const w = b.rb.angvel();
      if (v.x * v.x + v.y * v.y > QUIET_V2 || w * w > QUIET_W2) return false;
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
    for (const b of bodies) {
      if (b.kind !== "lantern") continue;
      const home = lanternHome.get(b.i);
      if (!b.alive || !b.rb || !home) {
        n++;
        continue;
      }
      const p = b.rb.translation();
      const dx = p.x - home.x;
      const dy = p.y - home.y;
      if (dx * dx + dy * dy > FREE_D2) n++;
    }
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
      h.float(p.x);
      h.float(p.y);
      h.float(b.rb.rotation());
    }
    h.word(freedCount());
    return h.hex();
  }

  /** الافتتاح: استقرار أولي بلا كسر، ثم تسجيل أماكن القناديل */
  const openingSteps = settle();
  for (const b of bodies) if (b.kind === "lantern" && b.rb) lanternHome.set(b.i, { ...b.rb.translation() });
  breakingEnabled = true;

  function fire(s: SpikeShot) {
    for (const p of projectiles) kill(p);
    projectiles = [];
    currentAmmo = s.ammo;
    stepInShot = 0;
    activated = false;
    pendingActivate = s.activateAt;
    const v = aimVelocity(s.angleStep, s.powerStep);
    const k = AMMO[s.ammo].speedScale;
    spawnProjectile(LAUNCH.x, LAUNCH.y, v.vx * k, v.vy * k);
  }

  function runShot(s: SpikeShot): ShotResult {
    fire(s);
    const steps = settle();
    return { steps, hash: hash(), freed: freedCount(), broken: brokenCount };
  }

  /** لقطة للعرض: [x, y, angle, alive] لكل جسم (العرض يقرأ فقط ولا يكتب في المحاكاة) */
  function snapshot(out: Float32Array) {
    for (const b of bodies) {
      const o = b.i * 4;
      if (o + 3 >= out.length) break;
      if (!b.alive || !b.rb) {
        out[o + 3] = 0;
        continue;
      }
      const p = b.rb.translation();
      out[o] = p.x;
      out[o + 1] = p.y;
      out[o + 2] = b.rb.rotation();
      out[o + 3] = 1;
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
    runShot,
    hash,
    freedCount,
    snapshot,
    lanternCount: bodies.filter((b) => b.kind === "lantern").length,
    get totalSteps() {
      return totalSteps;
    },
    get stepInShot() {
      return stepInShot;
    },
    free() {
      events.free();
      world.free();
    },
  };
}

export type HeadlessResult = { key: string; hashes: string[]; finalHash: string; steps: number; freed: number; lanterns: number; ms: number };

/** إعادة جولة كاملة بلا عرض: الأساس الذي سيستخدمه الخادم في /finish */
export function runHeadless(R: Rapier, layout: SpikeLayout, now: () => number = () => 0): HeadlessResult {
  const t0 = now();
  const sim = createSim(R, layout);
  const hashes = [sim.hash()];
  for (const s of layout.shots) hashes.push(sim.runShot(s).hash);
  const res = { key: layout.key, hashes, finalHash: hashes[hashes.length - 1], steps: sim.totalSteps, freed: sim.freedCount(), lanterns: sim.lanternCount, ms: 0 };
  sim.free();
  res.ms = now() - t0;
  return res;
}
