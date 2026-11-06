"use client";

import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { createPortal } from "react-dom";
import { POWER_STEPS, PITCH_STEPS, YAW_STEPS, aimAt } from "@/game/spike3d/det3d";
import { LAUNCH3, SPIKE3D_LAYOUTS, type AmmoKey } from "@/game/spike3d/layouts3d";
import type { Sim3, Rapier3 } from "@/game/spike3d/sim3d";
import type { Quality3 } from "@/game/spike3d/render3d";

/**
 * مشغّل تجربة 3D في المتصفح. لا يستورد three ولا Rapier استيرادًا ثابتًا: كلاهما بـ import() عند الضغط،
 * فلا يدخلان في حزمة أي صفحة أخرى. يقرأ ‎?auto=1‎ و‎?flavors=split,compat‎ و‎?visual=0‎ و‎?seconds=8‎ للقياس الآلي.
 * المحاكاة تخطو فقط من الرمي حتى السكون (كما في settle على الخادم)، فبصمة الجولة لا تتأثر بزمن الانتظار.
 */
export type ServerReplay3 = { node: string; initMs: number; layouts: Record<string, { hashes: string[]; ms: number; steps: number; bodies: number }> };

type Bytes = { transfer: number; encoded: number; decoded: number; files: string[] };
type FlavorResult = {
  flavor: "split" | "compat";
  ok: boolean;
  error?: string;
  loadMs: number;
  bytes: Bytes;
  allMatch: boolean;
  replay: { key: string; bodies: number; ms: number; match: boolean; firstMismatchShot: number }[];
  usPerStep: number;
};
type VisualResult = {
  quality: Quality3;
  seconds: number;
  fps: number;
  medianMs: number;
  p95Ms: number;
  drawCalls: number;
  triangles: number;
  dpr: number;
  frames: number;
  canvas: string;
  maxShards: number;
  simMsPerFrameP95: number;
};
type Results = {
  ua: string;
  dpr: number;
  cores: number;
  viewport: string;
  webgl2: boolean;
  reducedMotion: boolean;
  server: { node: string; initMs: number; totalMs: number; maxLayoutMs: number };
  flavors: FlavorResult[];
  threeLoadMs: number;
  threeBytes: Bytes;
  engineReadyMs: number;
  visual: VisualResult[];
  visualError?: string;
  done: boolean;
};

const AMMO_LABEL: Record<AmmoKey, string> = { meteor: "نيزك", heavy: "نيزك ثقيل", comet: "مذنّب", pulse: "نبضة الفجر", pebble: "حصاة" };
const AMMO_HINT: Partial<Record<AmmoKey, string>> = { comet: "المس الشاشة الآن لينقسم المذنّب", pulse: "المس الشاشة الآن لتنطلق النبضة" };
const AR = "٠١٢٣٤٥٦٧٨٩";
const arNum = (n: number) => String(n).replace(/\d/g, (d) => AR[Number(d)]);
/** العدد والمعدود: من ٣ إلى ١٠ جمع مجرور، وما بعدها مفرد منصوب */
const bodiesWord = (n: number) => (n >= 3 && n <= 10 ? "أجسام" : "جسمًا");
const secondsWord = (n: number) => (n >= 3 && n <= 10 ? "ثوانٍ" : "ثانية");

function resourceBytes(since: number, match: (name: string) => boolean): Bytes {
  const out: Bytes = { transfer: 0, encoded: 0, decoded: 0, files: [] };
  for (const e of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
    if (e.startTime < since || !match(e.name)) continue;
    out.transfer += e.transferSize;
    out.encoded += e.encodedBodySize;
    out.decoded += e.decodedBodySize;
    out.files.push(`${e.name.split("/").pop()} ${Math.round(e.encodedBodySize / 1024)}KB`);
  }
  return out;
}
const isScriptOrWasm = (n: string) => /\.(js|wasm)(\?|$)/.test(n);
const kb = (n: number) => `${arNum(Math.round(n / 1024))} ك.ب`;
const errText = (e: unknown) => String(e instanceof Error ? e.message : e);
const QUIET_NEEDED = 30;
const SHOT_CAP = 900;

type Renderer3 = ReturnType<typeof import("@/game/spike3d/render3d").createRenderer3>;
/** حالة الحلقة: تراكم الزمن، وهل نحن داخل رمية (تخطو المحاكاة)، وعدد خطوات السكون المتتالية */
type LoopState = { acc: number; last: number; inShot: boolean; quiet: number; simMs: number[] };
const newLoop = (): LoopState => ({ acc: 0, last: performance.now(), inShot: false, quiet: 0, simMs: [] });
type Hud = { shots: number; freed: number; lanterns: number; busy: boolean; broken: number; firedAmmo: AmmoKey; canActivate: boolean };
const EMPTY_HUD: Hud = { shots: 0, freed: 0, lanterns: 0, busy: false, broken: 0, firedAmmo: "meteor", canActivate: false };

const rafTwice = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export function Spike3dRunner({ server }: { server: ServerReplay3 }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  /** false بعد مغادرة الصفحة: كل عمل غير متزامن يتوقف عنده */
  const alive = useRef(true);
  /** رقم جيل اللعب: كل إغلاق أو بدء جديد يُبطل تحميلًا قيد الانتظار */
  const playToken = useRef(0);
  const engine = useRef<{ R: Rapier3 | null; flavor: "split" | "compat" | null }>({ R: null, flavor: null });
  const play = useRef<{ sim: Sim3 | null; r: Renderer3 | null; canvas: HTMLCanvasElement | null; raf: number; st: LoopState }>({
    sim: null,
    r: null,
    canvas: null,
    raf: 0,
    st: { acc: 0, last: 0, inShot: false, quiet: 0, simMs: [] },
  });
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [copied, setCopied] = useState(false);
  const [overlay, setOverlay] = useState<"off" | "measure" | "play">("off");
  const [playState, setPlayState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [playError, setPlayError] = useState("");
  const [layoutKey, setLayoutKey] = useState("pyramid");
  const [ammo, setAmmo] = useState<AmmoKey>("meteor");
  const [aim, setAim] = useState({ yaw: 20, pitch: 18, power: 16 });
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const say = (s: string) => setLog((l) => [...l, s]);
  const aimRef = useRef(aim);
  aimRef.current = aim;
  const ammoRef = useRef(ammo);
  ammoRef.current = ammo;
  const hudRef = useRef(hud);
  hudRef.current = hud;

  /** يركّب canvas جديدًا داخل المنصة (سياق WebGL جديد بخصائصه، فلا يرث antialias من سابقه) */
  function mountCanvas(): HTMLCanvasElement {
    const stage = stageRef.current;
    if (!stage) throw new Error("stage is not mounted");
    const c = document.createElement("canvas");
    c.className = "absolute inset-0 block size-full touch-none";
    c.setAttribute("aria-label", "مشهد اللعبة ثلاثي الأبعاد");
    stage.appendChild(c);
    return c;
  }
  function unmount(r: Renderer3 | null, c: HTMLCanvasElement | null) {
    if (r) {
      r.dispose();
      r.renderer.forceContextLoss();
    }
    c?.remove();
  }

  async function ensureEngine(prefer: "split" | "compat" = "split"): Promise<Rapier3> {
    if (engine.current.R) return engine.current.R;
    const { loadRapier3 } = await import("@/game/spike3d/rapier3d-loader");
    try {
      engine.current = { R: await loadRapier3(prefer), flavor: prefer };
    } catch {
      engine.current = { R: await loadRapier3("compat"), flavor: "compat" };
    }
    return engine.current.R!;
  }

  /** خطوة حلقة مشتركة: تخطو المحاكاة فقط أثناء الرمية (حتى السكون أو الحد)، ثم ترسم */
  function tick(sim: Sim3, r: Renderer3, state: LoopState, now: number, onSettled: () => void) {
    state.acc += Math.min(now - state.last, 100);
    state.last = now;
    let n = 0;
    const t0 = performance.now();
    while (state.inShot && state.acc >= 1000 / 60 && n < 4) {
      sim.step();
      state.quiet = sim.isQuiet() ? state.quiet + 1 : 0;
      state.acc -= 1000 / 60;
      n++;
      if (state.quiet >= QUIET_NEEDED || sim.stepInShot >= SHOT_CAP) {
        state.inShot = false;
        onSettled();
      }
    }
    if (!state.inShot || n === 4) state.acc = 0;
    state.simMs.push(performance.now() - t0);
    if (state.simMs.length > 900) state.simMs.shift();
    r.draw(sim, { quiet: !state.inShot });
  }

  /* ───────────── القياس ───────────── */
  async function run() {
    if (running || overlay !== "off" || playState === "loading") return;
    setRunning(true);
    setLog([]);
    setCopied(false);
    const params = new URLSearchParams(window.location.search);
    const flavors = (params.get("flavors") ?? "split,compat").split(",").filter((f): f is "split" | "compat" => f === "split" || f === "compat");
    const doVisual = params.get("visual") !== "0";
    const seconds = Math.min(20, Math.max(3, Number(params.get("seconds")) || 8));
    const clickAt = performance.now();
    const probe = document.createElement("canvas");
    const probeGl = probe.getContext("webgl2");
    probeGl?.getExtension("WEBGL_lose_context")?.loseContext();
    const layoutsMs = Object.values(server.layouts).map((l) => l.ms);
    const res: Results = {
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      cores: navigator.hardwareConcurrency ?? 0,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      webgl2: !!probeGl,
      reducedMotion: !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
      server: { node: server.node, initMs: server.initMs, totalMs: Math.round(layoutsMs.reduce((a, b) => a + b, 0)), maxLayoutMs: Math.max(...layoutsMs) },
      flavors: [],
      threeLoadMs: 0,
      threeBytes: { transfer: 0, encoded: 0, decoded: 0, files: [] },
      engineReadyMs: 0,
      visual: [],
      done: false,
    };
    let r: Renderer3 | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let sim: Sim3 | null = null;
    try {
      const { loadRapier3 } = await import("@/game/spike3d/rapier3d-loader");
      const { runHeadless3, createSim3 } = await import("@/game/spike3d/sim3d");
      let firstR: Rapier3 | null = null;

      for (const flavor of flavors) {
        if (!alive.current) return;
        say(`تحميل الفيزياء ثلاثية الأبعاد (${flavor === "split" ? "ملف WASM مستقل" : "WASM مضمّن"})…`);
        const t0 = performance.now();
        const fr: FlavorResult = { flavor, ok: false, loadMs: 0, bytes: { transfer: 0, encoded: 0, decoded: 0, files: [] }, allMatch: false, replay: [], usPerStep: 0 };
        try {
          const R = await loadRapier3(flavor);
          fr.loadMs = Math.round(performance.now() - t0);
          fr.bytes = resourceBytes(t0, isScriptOrWasm);
          firstR ??= R;
          let steps = 0;
          let ms = 0;
          for (const l of SPIKE3D_LAYOUTS) {
            const h = runHeadless3(R, l, () => performance.now());
            const srv = server.layouts[l.key];
            const mism = h.hashes.findIndex((x, i) => x !== srv?.hashes[i]);
            fr.replay.push({ key: l.key, bodies: l.bodies.length, ms: Math.round(h.ms * 10) / 10, match: mism === -1, firstMismatchShot: mism });
            steps += h.steps;
            ms += h.ms;
          }
          fr.usPerStep = Math.round((ms * 1000) / steps);
          fr.allMatch = fr.replay.every((x) => x.match);
          fr.ok = true;
          say(`${flavor}: ${arNum(fr.loadMs)} م.ث، ${kb(fr.bytes.encoded)} منقولة، التطابق مع الخادم ${fr.allMatch ? "كامل ✓" : "مختلف ✗"}`);
        } catch (e) {
          fr.error = errText(e);
          say(`${flavor}: فشل التحميل (${fr.error})`);
        }
        res.flavors.push(fr);
        setResults({ ...res });
      }
      if (firstR && !engine.current.R) engine.current = { R: firstR, flavor: flavors[0] ?? "split" };

      if (doVisual && firstR && !res.webgl2) {
        res.visualError = "no-webgl2";
        say("المتصفح بلا WebGL2، فتخطّينا قياس الرسم");
      } else if (doVisual && firstR) {
        say("تحميل الرسم ثلاثي الأبعاد…");
        const t0 = performance.now();
        const { createRenderer3 } = await import("@/game/spike3d/render3d");
        res.threeLoadMs = Math.round(performance.now() - t0);
        res.threeBytes = resourceBytes(t0, isScriptOrWasm);
        if (!alive.current) return;
        setOverlay("measure");
        await rafTwice();
        const stress = SPIKE3D_LAYOUTS.find((l) => l.key === "stress-120")!;
        for (const quality of ["high", "low"] as const) {
          if (!alive.current) return;
          say(`قياس السلاسة (${quality === "high" ? "جودة عالية بظلال" : "جودة منخفضة"}) لمدة ${arNum(seconds)} ${secondsWord(seconds)}…`);
          canvas = mountCanvas();
          const rr = createRenderer3(canvas, { quality, maxBodies: stress.bodies.length + 8 });
          r = rr;
          const ss = createSim3(firstR, stress);
          sim = ss;
          rr.setAim(stress.shots[0].yawStep, stress.shots[0].pitchStep, stress.shots[0].powerStep, null);
          rr.draw(ss, { quiet: true });
          if (!res.engineReadyMs) res.engineReadyMs = Math.round(performance.now() - clickAt);
          rr.resetStats();
          let maxShards = 0;
          const st = { ...newLoop(), inShot: true };
          await new Promise<void>((done, fail) => {
            let shot = 0;
            const start = performance.now();
            ss.fire(stress.shots[0]);
            const frame = (now: number) => {
              try {
                if (!alive.current) return done();
                tick(ss, rr, st, now, () => {
                  if (shot + 1 < stress.shots.length) {
                    shot++;
                    const s = stress.shots[shot];
                    rr.setAim(s.yawStep, s.pitchStep, s.powerStep, null);
                    ss.fire(s);
                    st.inShot = true;
                    st.quiet = 0;
                  }
                });
                maxShards = Math.max(maxShards, rr.stats().shards);
                if (now - start < seconds * 1000) requestAnimationFrame(frame);
                else done();
              } catch (e) {
                fail(e);
              }
            };
            requestAnimationFrame(frame);
          });
          const s = rr.stats();
          const simSorted = [...st.simMs].sort((a, b) => a - b);
          res.visual.push({
            quality,
            seconds,
            fps: s.fps,
            medianMs: s.medianMs,
            p95Ms: s.p95Ms,
            drawCalls: s.drawCalls,
            triangles: s.triangles,
            dpr: s.dpr,
            frames: s.frames,
            canvas: `${canvas.width}x${canvas.height}`,
            maxShards,
            simMsPerFrameP95: +(simSorted[Math.floor(simSorted.length * 0.95)] ?? 0).toFixed(2),
          });
          say(`${quality === "high" ? "عالية" : "منخفضة"}: ${arNum(Math.round(s.fps))} إطارًا في الثانية (p95 ${arNum(Math.round(s.p95Ms))} م.ث) و${arNum(s.drawCalls)} draw calls`);
          unmount(rr, canvas);
          ss.free();
          r = null;
          canvas = null;
          sim = null;
          setResults({ ...res });
        }
      }
    } catch (e) {
      res.visualError = errText(e);
      if (alive.current) say(`تعذّر إكمال القياس: ${res.visualError}`);
    } finally {
      unmount(r, canvas);
      sim?.free();
      if (alive.current) {
        setOverlay("off");
        res.done = true;
        setResults({ ...res });
        (window as unknown as { __spike3d: Results }).__spike3d = res;
        document.body.dataset.spike3dDone = "1";
        setRunning(false);
      }
    }
  }

  /* ───────────── «جرّب الرمي» ───────────── */
  function stopPlay() {
    playToken.current++;
    const p = play.current;
    if (p.raf) cancelAnimationFrame(p.raf);
    unmount(p.r, p.canvas);
    p.sim?.free();
    play.current = { sim: null, r: null, canvas: null, raf: 0, st: newLoop() };
  }

  function closePlay() {
    stopPlay();
    setOverlay("off");
    setPlayState("idle");
    setHud(EMPTY_HUD);
    requestAnimationFrame(() => playBtnRef.current?.focus());
  }

  async function startPlay(key = layoutKey) {
    if (running) return;
    stopPlay();
    const token = ++playToken.current;
    setOverlay("play");
    setPlayState("loading");
    setPlayError("");
    let canvas: HTMLCanvasElement | null = null;
    let r: Renderer3 | null = null;
    let sim: Sim3 | null = null;
    try {
      const R = await ensureEngine();
      const [{ createSim3 }, { createRenderer3 }] = await Promise.all([import("@/game/spike3d/sim3d"), import("@/game/spike3d/render3d")]);
      await rafTwice();
      if (token !== playToken.current || !alive.current) return;
      const layout = SPIKE3D_LAYOUTS.find((l) => l.key === key) ?? SPIKE3D_LAYOUTS[0];
      canvas = mountCanvas();
      r = createRenderer3(canvas, { quality: "high", maxBodies: layout.bodies.length + 8 });
      sim = createSim3(R, layout);
      // تصويب مبدئي نحو وسط الجزيرة على ارتفاع متر (من جداول التصويب الصحيحة نفسها)
      const a0 = aimAt(LAUNCH3, { x: 0, y: 1, z: 0 });
      const a = { yaw: a0.yawStep, pitch: a0.pitchStep, power: a0.powerStep };
      setAim(a);
      aimRef.current = a;
      r.setAim(a.yaw, a.pitch, a.power, ammoRef.current);
      const st = newLoop();
      const mySim = sim;
      const myR = r;
      play.current = { sim: mySim, r: myR, canvas, raf: 0, st };
      canvas = null;
      r = null;
      sim = null;
      setHud({ ...EMPTY_HUD, lanterns: mySim.lanternCount });
      setPlayState("ready");
      const frame = (now: number) => {
        const p = play.current;
        if (p.sim !== mySim) return;
        tick(mySim, myR, st, now, () => {
          const aa = aimRef.current;
          myR.setAim(aa.yaw, aa.pitch, aa.power, ammoRef.current);
          setHud((h) => ({ ...h, freed: mySim.freedCount(), broken: mySim.broken, busy: false, canActivate: false }));
        });
        // انتهى طيران القذيفة قبل التفعيل: لا معنى لتلميح «المس الشاشة»
        if (hudRef.current.canActivate && st.inShot && !mySim.leadProjectile()) {
          hudRef.current = { ...hudRef.current, canActivate: false };
          setHud((h) => ({ ...h, canActivate: false }));
        }
        p.raf = requestAnimationFrame(frame);
      };
      play.current.raf = requestAnimationFrame(frame);
    } catch (e) {
      unmount(r, canvas);
      sim?.free();
      if (token === playToken.current && alive.current) {
        setPlayState("error");
        setPlayError(errText(e));
      }
    }
  }

  function fire() {
    const p = play.current;
    if (!p.sim || !p.r || p.st.inShot) return;
    const a = aimRef.current;
    const kind = ammoRef.current;
    p.sim.fire({ ammo: kind, yawStep: a.yaw, pitchStep: a.pitch, powerStep: a.power, activateAt: -1 });
    p.r.setAim(a.yaw, a.pitch, a.power, null);
    p.st.inShot = true;
    p.st.quiet = 0;
    p.st.acc = 0;
    setHud((h) => ({ ...h, shots: h.shots + 1, busy: true, firedAmmo: kind, canActivate: kind === "comet" || kind === "pulse" }));
  }

  /** لمسة أثناء الطيران: تفعيل المذنّب أو النبضة (مرة واحدة) */
  function activate() {
    const p = play.current;
    if (!p.st.inShot || !p.sim) return;
    if (p.sim.activateNext() >= 0) setHud((h) => ({ ...h, canActivate: false }));
  }

  function updateAim(next: { yaw: number; pitch: number; power: number }) {
    const clamped = {
      yaw: Math.max(0, Math.min(YAW_STEPS, Math.round(next.yaw))),
      pitch: Math.max(0, Math.min(PITCH_STEPS, Math.round(next.pitch))),
      power: Math.max(0, Math.min(POWER_STEPS, Math.round(next.power))),
    };
    setAim(clamped);
    aimRef.current = clamped;
    const p = play.current;
    if (p.r && !p.st.inShot) p.r.setAim(clamped.yaw, clamped.pitch, clamped.power, ammoRef.current);
  }

  // سحب للتصويب: أفقيًا للاتجاه، ورأسيًا للارتفاع؛ ولمسة أثناء الطيران تفعّل المذنّب أو النبضة
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if (overlay !== "play" || playState !== "ready") return;
    if (play.current.st.inShot) {
      activate();
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw: aimRef.current.yaw, pitch: aimRef.current.pitch };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    updateAim({ yaw: d.yaw + (e.clientX - d.x) / 9, pitch: d.pitch - (e.clientY - d.y) / 7, power: aimRef.current.power });
  }
  function onPointerUp() {
    drag.current = null;
  }

  useEffect(() => {
    alive.current = true;
    if (new URLSearchParams(window.location.search).get("auto") === "1") void run();
    const onResize = () => play.current.r?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      alive.current = false;
      window.removeEventListener("resize", onResize);
      stopPlay();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ملء الشاشة: منع تمرير الصفحة، وجعل ما خلف الطبقة خاملًا، وEscape للإغلاق؛ وكل ذلك يُستعاد عند الإغلاق أو المغادرة
  useEffect(() => {
    play.current.r?.resize();
    if (overlay === "off") return;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const stageEl = document.querySelector('[data-spike3d-stage="fixed"]');
    const inerted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === stageEl || el.hasAttribute("inert") || el.tagName === "SCRIPT") continue;
      el.setAttribute("inert", "");
      inerted.push(el);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && overlay === "play") closePlay();
    };
    window.addEventListener("keydown", onKey);
    if (overlay === "play") closeRef.current?.focus();
    return () => {
      html.style.overflow = prevOverflow;
      for (const el of inerted) el.removeAttribute("inert");
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay]);

  const json = results ? JSON.stringify(results, null, 2) : "";
  const layout = SPIKE3D_LAYOUTS.find((l) => l.key === layoutKey)!;
  const ready = playState === "ready";
  const locked = !ready || hud.busy;
  const hint = !ready ? "" : hud.busy ? (hud.canActivate && AMMO_HINT[hud.firedAmmo]) || "انتظر حتى تهدأ القطع…" : "اسحب على المشهد لتوجّه المرقاب، ثم اضبط القوة وارمِ";
  const chip = (active: boolean) =>
    `min-h-11 shrink-0 rounded-full px-3.5 font-display text-sm font-bold disabled:opacity-60 ${active ? "bg-[#ffd25a] text-[#3a2400]" : "bg-black/55 text-white ring-1 ring-white/30"}`;

  /*
   * المنصة: داخل الصفحة عند الإيقاف، وبوابة إلى body بملء الشاشة أثناء القياس واللعب
   * (داخل الصفحة قد يكون لأحد الآباء تحويل CSS فلا تغطي position: fixed الشاشة كلها).
   */
  const stage = (
    <div
      dir="rtl"
      data-spike3d-stage={overlay === "off" ? "inline" : "fixed"}
      role={overlay === "off" ? undefined : "dialog"}
      aria-modal={overlay === "off" ? undefined : true}
      aria-label={overlay === "play" ? "اللعبة التجريبية ثلاثية الأبعاد" : overlay === "measure" ? "قياس الرسم" : undefined}
      className={
        overlay === "off"
          ? "relative aspect-video overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#1d2f6b,#6a4fa3_60%,#ffb36b)]"
          : "fixed inset-0 z-[80] overflow-hidden bg-[linear-gradient(180deg,#1d2f6b,#6a4fa3_60%,#ffb36b)]"
      }
    >
      <div ref={stageRef} className="absolute inset-0" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
      {overlay === "off" && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center font-display text-lg font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
          اضغط «جرّب الرمي» لتفتح اللعبة بملء الشاشة
        </p>
      )}
      {overlay === "measure" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3 pt-[max(12px,env(safe-area-inset-top))]">
          <span role="status" className="rounded-full bg-black/55 px-4 py-2 font-display text-sm font-bold text-white">
            جارٍ القياس… لا تغلق الصفحة
          </span>
        </div>
      )}
      {overlay === "play" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 pt-[max(12px,env(safe-area-inset-top))] ps-[max(12px,env(safe-area-inset-right))] pe-[max(12px,env(safe-area-inset-left))]">
            <div className="rounded-2xl bg-black/55 px-3 py-2 text-white">
              <p className="font-display text-[0.95rem] font-black">{layout.title}</p>
              <p role="status" className="text-[0.82rem] font-bold">
                القناديل المحررة {arNum(hud.freed)} من {arNum(hud.lanterns)} · رميات {arNum(hud.shots)} · مكسور {arNum(hud.broken)}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="pointer-events-auto grid size-11 place-items-center rounded-full bg-black/55 text-xl font-black text-white"
              aria-label="إغلاق اللعبة"
              onClick={closePlay}
            >
              ×
            </button>
          </div>
          {playState !== "ready" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
              <div role="status" className="pointer-events-auto max-w-sm rounded-2xl bg-black/60 px-5 py-4 text-center font-display font-bold text-white">
                {playState === "error" ? (
                  <>
                    <p>تعذّر تشغيل اللعبة: {playError}</p>
                    <button type="button" className="btn btn-3d btn-accent btn-md mt-3" onClick={() => startPlay()}>
                      أعد المحاولة
                    </button>
                  </>
                ) : (
                  <p>جارٍ تحميل اللعبة…</p>
                )}
              </div>
            </div>
          )}
          {/* لمسة في أي مكان من اللوح أثناء الطيران تفعّل القذيفة أيضًا (حيث يرتاح الإبهام) */}
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/55 to-black/0 pt-8 pb-[max(12px,env(safe-area-inset-bottom))] ps-[max(12px,env(safe-area-inset-right))] pe-[max(12px,env(safe-area-inset-left))] [@media(max-height:500px)]:pt-3`}
            onPointerDown={activate}
          >
            <div className="mx-auto max-w-xl space-y-2 [@media(max-height:500px)]:max-w-4xl">
              {hint ? <p className={`mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-center text-[0.82rem] font-bold text-white [@media(max-height:500px)]:hidden`}>{hint}</p> : null}
              <div className={`flex gap-1.5 overflow-x-auto pb-1 [@media(max-height:500px)]:hidden`} role="radiogroup" aria-label="القذيفة">
                {(Object.keys(AMMO_LABEL) as AmmoKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={ammo === k}
                    disabled={locked}
                    className={chip(ammo === k)}
                    onClick={() => {
                      setAmmo(k);
                      ammoRef.current = k;
                      const p = play.current;
                      if (p.r && !p.st.inShot) p.r.setAim(aimRef.current.yaw, aimRef.current.pitch, aimRef.current.power, k);
                    }}
                  >
                    {AMMO_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className={`flex flex-col gap-2 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-center`}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <label htmlFor="spike3d-power" className="shrink-0 rounded-full bg-black/60 px-2.5 py-1 font-display text-sm font-bold text-white">
                    القوة
                  </label>
                  <input
                    id="spike3d-power"
                    type="range"
                    min={0}
                    max={POWER_STEPS}
                    step={1}
                    value={aim.power}
                    disabled={locked}
                    onChange={(e) => updateAim({ ...aim, power: Number(e.target.value) })}
                    className="h-11 min-w-0 flex-1 accent-[#ffd25a]"
                  />
                  <button type="button" className="btn btn-3d btn-accent btn-md min-h-11 shrink-0" onClick={fire} disabled={locked} data-testid="spike3d-fire">
                    ارمِ
                  </button>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {/* في الشاشة القصيرة (أفقي) تحل قائمة القذيفة محل الكبسولات */}
                  <select
                    aria-label="القذيفة"
                    value={ammo}
                    disabled={locked}
                    onChange={(e) => {
                      const k = e.target.value as AmmoKey;
                      setAmmo(k);
                      ammoRef.current = k;
                      const p = play.current;
                      if (p.r && !p.st.inShot) p.r.setAim(aimRef.current.yaw, aimRef.current.pitch, aimRef.current.power, k);
                    }}
                    className={`hidden min-h-11 shrink-0 rounded-xl bg-white/90 px-2 font-display text-sm font-bold text-ink [@media(max-height:500px)]:block`}
                  >
                    {(Object.keys(AMMO_LABEL) as AmmoKey[]).map((k) => (
                      <option key={k} value={k}>
                        {AMMO_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="التصميم"
                    value={layoutKey}
                    disabled={!ready}
                    onChange={(e) => {
                      setLayoutKey(e.target.value);
                      void startPlay(e.target.value);
                    }}
                    className="min-h-11 min-w-36 flex-1 rounded-xl bg-white/90 px-3 font-display text-sm font-bold text-ink"
                  >
                    {SPIKE3D_LAYOUTS.map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.title} ({arNum(l.bodies.length)} {bodiesWord(l.bodies.length)})
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-3d btn-soft btn-md min-h-11 shrink-0" disabled={!ready} onClick={() => startPlay()}>
                    أعد التصميم
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-3d btn-primary btn-lg" onClick={run} disabled={running || overlay !== "off" || playState === "loading"} data-testid="spike3d-run">
          {running ? "جارٍ القياس…" : "ابدأ القياس"}
        </button>
        <button ref={playBtnRef} type="button" className="btn btn-3d btn-accent btn-lg" onClick={() => startPlay()} disabled={running || overlay !== "off"} data-testid="spike3d-play">
          جرّب الرمي
        </button>
        {results?.done && (
          <button
            type="button"
            className="btn btn-3d btn-soft btn-md"
            onClick={async () => {
              await navigator.clipboard.writeText(json);
              setCopied(true);
            }}
          >
            {copied ? "نُسخت النتيجة" : "انسخ النتيجة"}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        الخادم Node {server.node}: أعاد {arNum(SPIKE3D_LAYOUTS.length)} {SPIKE3D_LAYOUTS.length <= 10 ? "تصاميم" : "تصميمًا"} في{" "}
        {arNum(Math.round(Object.values(server.layouts).reduce((a, l) => a + l.ms, 0)))} م.ث، أطولها {arNum(Math.round(Math.max(...Object.values(server.layouts).map((l) => l.ms))))} م.ث (الحد ١٥٠٠).
      </p>

      {overlay === "off" ? stage : createPortal(stage, document.body)}

      <ul className="space-y-1 text-[0.95rem]" aria-live="polite">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {results && (
        <details open={results.done}>
          <summary className="cursor-pointer font-display font-bold">النتيجة الكاملة (JSON)</summary>
          <pre dir="ltr" className="mt-2 max-h-96 overflow-auto rounded-2xl bg-[#0f1b2d] p-4 text-xs text-[#d6f5ef]" data-testid="spike3d-results">
            {json}
          </pre>
        </details>
      )}
    </div>
  );
}
