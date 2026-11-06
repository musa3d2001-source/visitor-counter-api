/**
 * [تجربة المرحلة 0 - كود مؤقت]
 * PhysicsAdapter: الواجهة الوحيدة بين المحاكاة وRapier2D الحتمي.
 * - الخطوة ثابتة 1/60، وعدد تكرارات الحل مثبّت.
 * - "الخانات" (slots) أرقام بترتيب الإضافة، وهي الترتيب الثابت للأجسام في كل مكان.
 * - أحداث قوة التماس تُجمع ثم تُرتّب بالخانات (لا نعتمد على ترتيب طابور Rapier).
 * - الحزمة (العادية أو -compat) تُحقن من الخارج، فالمحرك لا يستورد أيًّا منهما.
 */
import type * as RapierNS from "@dimforge/rapier2d-deterministic";

export type RapierModule = typeof RapierNS;

export const FIXED_DT = 1 / 60;
export const SOLVER_ITERATIONS = 4;

export interface BodyInit {
  kind: "dynamic" | "fixed";
  shape: "box" | "ball";
  /** نصف العرض/الارتفاع بالمتر (للصندوق) */
  hx?: number;
  hy?: number;
  /** نصف القطر بالمتر (للكرة) */
  r?: number;
  x: number;
  y: number;
  rot: number;
  density: number;
  friction: number;
  restitution: number;
  restitutionMax: boolean;
  ccd: boolean;
  /** عتبة أحداث قوة التماس، أو null لعدم الاشتراك */
  forceEventThreshold: number | null;
  linvel?: { x: number; y: number };
  angvel?: number;
}

/** [slotA, slotB, totalForce] مع slotA < slotB */
export type ForceEvent = [number, number, number];

export interface PhysicsAdapter {
  add(init: BodyInit): number;
  remove(slot: number): void;
  step(): void;
  /** أحداث قوة التماس من آخر خطوة، مرتبة ترتيبًا ثابتًا */
  takeForceEvents(): ForceEvent[];
  /** يكتب x, y, rot, vx, vy, w في out */
  read(slot: number, out: Float64Array): void;
  isSleeping(slot: number): boolean;
  mass(slot: number): number;
  applyImpulse(slot: number, ix: number, iy: number): void;
  free(): void;
}

export function createRapierAdapter(R: RapierModule, gravityY: number): PhysicsAdapter {
  const world = new R.World({ x: 0, y: gravityY });
  world.timestep = FIXED_DT;
  world.numSolverIterations = SOLVER_ITERATIONS;
  const queue = new R.EventQueue(true);
  const bodies: (RapierNS.RigidBody | null)[] = [];
  const slotByCollider = new Map<number, number>();
  let pending: ForceEvent[] = [];

  return {
    add(init) {
      const desc = init.kind === "fixed" ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic();
      desc.setTranslation(init.x, init.y).setRotation(init.rot).setCcdEnabled(init.ccd);
      if (init.linvel) desc.setLinvel(init.linvel.x, init.linvel.y);
      if (init.angvel !== undefined) desc.setAngvel(init.angvel);
      const body = world.createRigidBody(desc);
      const cd = init.shape === "box" ? R.ColliderDesc.cuboid(init.hx ?? 0.1, init.hy ?? 0.1) : R.ColliderDesc.ball(init.r ?? 0.1);
      cd.setDensity(init.density).setFriction(init.friction).setRestitution(init.restitution);
      if (init.restitutionMax) cd.setRestitutionCombineRule(R.CoefficientCombineRule.Max);
      if (init.forceEventThreshold !== null) {
        cd.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(init.forceEventThreshold);
      }
      const collider = world.createCollider(cd, body);
      const slot = bodies.length;
      bodies.push(body);
      slotByCollider.set(collider.handle, slot);
      return slot;
    },
    remove(slot) {
      const b = bodies[slot];
      if (!b) return;
      for (let i = 0; i < b.numColliders(); i++) slotByCollider.delete(b.collider(i).handle);
      world.removeRigidBody(b);
      bodies[slot] = null;
    },
    step() {
      world.step(queue);
      const evs: ForceEvent[] = [];
      queue.drainContactForceEvents((e) => {
        const a = slotByCollider.get(e.collider1());
        const b = slotByCollider.get(e.collider2());
        if (a === undefined || b === undefined) return;
        const f = e.totalForceMagnitude();
        evs.push(a < b ? [a, b, f] : [b, a, f]);
      });
      evs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
      pending = evs;
    },
    takeForceEvents() {
      const out = pending;
      pending = [];
      return out;
    },
    read(slot, out) {
      const b = bodies[slot];
      if (!b) {
        out.fill(0);
        return;
      }
      const t = b.translation();
      const v = b.linvel();
      out[0] = t.x;
      out[1] = t.y;
      out[2] = b.rotation();
      out[3] = v.x;
      out[4] = v.y;
      out[5] = b.angvel();
    },
    isSleeping(slot) {
      const b = bodies[slot];
      return !b || b.isSleeping();
    },
    mass(slot) {
      const b = bodies[slot];
      return b ? b.mass() : 0;
    },
    applyImpulse(slot, ix, iy) {
      const b = bodies[slot];
      if (b) b.applyImpulse({ x: ix, y: iy }, true);
    },
    free() {
      queue.free();
      world.free();
    },
  };
}
