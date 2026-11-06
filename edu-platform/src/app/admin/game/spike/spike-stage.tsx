"use client";

/**
 * [تجربة المرحلة 0 - كود مؤقت، ليس إنتاجيًا] واجهة التجربة التقنية للمالك.
 * three وRapier والمحرك تُستورد كسولًا بـ import() هنا فقط، فلا تدخل أي حزمة أولية.
 * كل import() هنا يمر عبر loadEngine/loadRenderer داخل فرع `typeof window !== "undefined"`: المجمّع يثبّت
 * الشرط وقت الترجمة ("undefined" في طبقة الخادم) فيحذف الفرع من رسم SSR، فلا يدخل Rapier (وملف .wasm)
 * تتبّع الخادم (وإلا 13,795 ملفًا، 653.9MB؛ انظر RESULTS.md §7). بوابة المرحلة 0 أثبتت أن تحميل هذا
 * المكوّن نفسه كسولًا (next/dynamic أو import()) يكبّر JS كل الصفحات القائمة 52 بايتًا، فصار يُستورد مباشرة.
 * معاملات الرابط: ?debug=perf (طبقة الأداء) · ?quality=high|low|auto · ?pkg=standard|compat
 *                  ?layout=<key> · ?auto=1 (تحميل المحرك فور فتح الصفحة لقياس الجاهزية)
 * للقياس الآلي: window.__spike (انظر scripts/game-spike/browser-bench.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpikeRenderer, Quality } from "./_render/scene";

type EngineModule = typeof import("./_engine/index");
type Pkg = "standard" | "compat";

import type { LayoutMeta } from "./types";

interface HashRow {
  key: string;
  hash: string;
  golden: string;
  match: boolean;
  steps: number;
  cleared: boolean;
  ms: number;
}

interface PerfSample {
  frames: number;
  seconds: number;
  fps: number;
  medianMs: number;
  p95Ms: number;
  calls: number;
  triangles: number;
  pixelRatio: number;
  shadows: boolean;
  quality: Quality;
}

interface SpikeWindowApi {
  ready: boolean;
  timings: Record<string, number>;
  pkg: Pkg;
  quality: Quality;
  hashes(pkg: Pkg): Promise<HashRow[]>;
  server(pkg: Pkg): Promise<unknown>;
  measureFps(ms: number): Promise<PerfSample>;
  errors: string[];
}

declare global {
  interface Window {
    __spike?: SpikeWindowApi;
  }
}

const FIXED_MS = 1000 / 60;

/** في المتصفح فقط: الفرع يُحذف من رسم الخادم (لا تكتب import() للمحرك أو three خارج هاتين الدالتين). */
function loadEngine(): Promise<EngineModule> {
  if (typeof window !== "undefined") return import("./_engine/index");
  return Promise.reject(new Error("engine is client-only"));
}
function loadRenderer(): Promise<typeof import("./_render/scene")> {
  if (typeof window !== "undefined") return import("./_render/scene");
  return Promise.reject(new Error("renderer is client-only"));
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

export default function SpikeStage({ layouts }: { layouts: LayoutMeta[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineModule | null>(null);
  const rapierRef = useRef<Partial<Record<Pkg, Awaited<ReturnType<EngineModule["loadRapier"]>>>>>({});
  const rendererRef = useRef<SpikeRenderer | null>(null);
  const simRef = useRef<InstanceType<EngineModule["Simulation"]> | null>(null);
  const frameTimes = useRef<number[]>([]);
  const replayRef = useRef<{ next: number; wait: number; loop: boolean }>({ next: 0, wait: 0, loop: true });
  const timingsRef = useRef<Record<string, number>>({});
  const errorsRef = useRef<string[]>([]);

  const [debug, setDebug] = useState(false);
  const [pkg, setPkg] = useState<Pkg>("standard");
  const [quality, setQuality] = useState<Quality>("high");
  const [autoQuality, setAutoQuality] = useState(false);
  const [layoutKey, setLayoutKey] = useState(layouts[layouts.length - 1]?.key ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [canvasKey, setCanvasKey] = useState(0);
  const [hud, setHud] = useState({ fps: 0, median: 0, calls: 0, tris: 0, dpr: 1, stepHash: "", steps: 0, freed: 0 });
  const [timings, setTimings] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Record<string, HashRow[]>>({});
  const [serverRows, setServerRows] = useState<Record<string, { key: string; hash: string; ms: number }[]>>({});
  const [aim, setAim] = useState({ angle: 30, power: 24 });
  const params = useRef<URLSearchParams | null>(null);

  // قراءة معاملات الرابط مرة واحدة
  useEffect(() => {
    performance.mark("spike-stage-mounted");
    const p = new URLSearchParams(window.location.search);
    params.current = p;
    setDebug(p.get("debug") === "perf");
    if (p.get("pkg") === "compat") setPkg("compat");
    const q = p.get("quality");
    if (q === "low") setQuality("low");
    if (q === "auto") setAutoQuality(true);
    const l = p.get("layout");
    if (l && layouts.some((x) => x.key === l)) setLayoutKey(l);
  }, [layouts]);

  const mark = useCallback((name: string, value: number) => {
    timingsRef.current = { ...timingsRef.current, [name]: Math.round(value) };
    setTimings(timingsRef.current);
  }, []);

  const getRapier = useCallback(async (p: Pkg) => {
    const eng = engineRef.current!;
    if (!rapierRef.current[p]) {
      const t = performance.now();
      rapierRef.current[p] = await eng.loadRapier(p);
      mark(`rapier_${p}_load_ms`, performance.now() - t);
    }
    return rapierRef.current[p]!;
  }, [mark]);

  const newSim = useCallback(async (key: string, p: Pkg) => {
    const eng = engineRef.current!;
    const R = await getRapier(p);
    const level = eng.LAYOUTS.find((l) => l.key === key)!;
    const sol = eng.SOLUTIONS[key];
    simRef.current?.destroy();
    const sim = new eng.Simulation(R, level, sol.seed);
    simRef.current = sim;
    replayRef.current = { next: 0, wait: 0, loop: replayRef.current.loop };
    rendererRef.current?.setSim(sim);
    return sim;
  }, [getRapier]);

  /** تحميل المحرك: three + Rapier + المحاكاة + أول إطار */
  const start = useCallback(async (opts?: { quality?: Quality; pkg?: Pkg; layout?: string }) => {
    if (!canvasRef.current) return;
    setStatus("loading");
    setMessage("");
    const q = opts?.quality ?? quality;
    try {
      const t0 = performance.now();
      const [eng, scene] = await Promise.all([
        engineRef.current ? Promise.resolve(engineRef.current) : loadEngine(),
        loadRenderer().then((m) => {
          mark("three_import_ms", performance.now() - t0);
          return m;
        }),
      ]);
      engineRef.current = eng;
      mark("engine_module_ms", performance.now() - t0);
      rendererRef.current?.destroy();
      rendererRef.current = scene.createSpikeRenderer(canvasRef.current, q);
      await newSim(opts?.layout ?? layoutKey, opts?.pkg ?? pkg);
      rendererRef.current.render(performance.now());
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const now = performance.now();
      mark("engine_ready_from_click_ms", now - t0);
      mark("engine_ready_since_navigation_ms", now);
      setStatus("ready");
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      errorsRef.current.push(msg);
      setMessage(msg);
      setStatus("error");
    }
  }, [layoutKey, mark, newSim, pkg, quality]);

  // حلقة الرسم: خطوات ثابتة 1/60 (حتى 4 في الإطار) + إعادة الحل المرجعي بشكل متكرر
  useEffect(() => {
    if (status !== "ready") return;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let hudAt = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const sim = simRef.current;
      const r = rendererRef.current;
      if (!sim || !r) return;
      if (last) {
        const dt = t - last;
        frameTimes.current.push(dt);
        if (frameTimes.current.length > 900) frameTimes.current.shift();
        acc = Math.min(acc + dt, FIXED_MS * 4);
      }
      last = t;
      const eng = engineRef.current!;
      const sol = eng.SOLUTIONS[sim.level.key];
      while (acc >= FIXED_MS) {
        acc -= FIXED_MS;
        if (!sim.isSettled()) {
          sim.step();
          continue;
        }
        const rp = replayRef.current;
        if (rp.next < sol.shots.length && !sim.isCleared()) {
          if (rp.wait++ > 20) {
            sim.fire(sol.shots[rp.next]);
            rp.next++;
            rp.wait = 0;
          }
        } else if (rp.loop && rp.wait++ > 90) {
          void newSim(sim.level.key, pkg);
          break;
        }
      }
      r.render(t);
      if (t - hudAt > 500) {
        hudAt = t;
        const ft = frameTimes.current.slice(-120).sort((a, b) => a - b);
        const st = r.stats();
        const lastSec = frameTimes.current.slice(-240);
        let sum = 0;
        let n = 0;
        for (let i = lastSec.length - 1; i >= 0 && sum < 1000; i--) {
          sum += lastSec[i];
          n++;
        }
        const median = pct(ft, 50);
        setHud({ fps: sum ? Math.round((n * 1000) / sum) : 0, median: Math.round(median * 10) / 10, calls: st.calls, tris: st.triangles, dpr: st.pixelRatio, stepHash: sim.isSettled() ? sim.stateHash() : "…", steps: sim.steps, freed: sim.freedCount() });
        // الجودة التلقائية: تنزل إلى المنخفضة إذا تجاوز وسيط الإطار 22ms
        if (autoQuality && quality === "high" && ft.length >= 120 && median > 22) {
          setQuality("low");
          setCanvasKey((k) => k + 1);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, autoQuality, quality, newSim, pkg]);

  // إعادة بناء العارض عند تغيير الجودة (سياق WebGL جديد على canvas جديد)
  useEffect(() => {
    if (canvasKey === 0) return;
    void start({ quality });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasKey]);

  useEffect(() => {
    rendererRef.current?.setAim(aim.angle, aim.power, status === "ready");
  }, [aim, status]);

  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      rendererRef.current?.destroy();
      simRef.current?.destroy();
    };
  }, []);

  const computeHashes = useCallback(async (p: Pkg) => {
    if (!engineRef.current) engineRef.current = await loadEngine();
    const eng = engineRef.current;
    const R = await getRapier(p);
    const out: HashRow[] = [];
    for (const meta of layouts) {
      const level = eng.LAYOUTS.find((l) => l.key === meta.key)!;
      const sol = eng.SOLUTIONS[meta.key];
      const t = performance.now();
      const res = eng.runHeadless(R, level, sol.seed, sol.shots);
      out.push({ key: meta.key, hash: res.stateHash, golden: meta.golden, match: res.stateHash === meta.golden, steps: res.steps, cleared: res.cleared, ms: Math.round((performance.now() - t) * 10) / 10 });
    }
    setRows((r) => ({ ...r, [p]: out }));
    return out;
  }, [getRapier, layouts]);

  const compareServer = useCallback(async (p: Pkg) => {
    const res = await fetch("/admin/game/spike/replay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pkg: p }) });
    const data = (await res.json()) as { results?: { key: string; hash: string; ms: number }[]; error?: string };
    if (data.results) setServerRows((s) => ({ ...s, [p]: data.results! }));
    return { status: res.status, ...data };
  }, []);

  const measureFps = useCallback(async (ms: number): Promise<PerfSample> => {
    frameTimes.current = [];
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, ms));
    const seconds = (performance.now() - t0) / 1000;
    const ft = [...frameTimes.current].sort((a, b) => a - b);
    const st = rendererRef.current!.stats();
    return { frames: ft.length, seconds, fps: Math.round((ft.length / seconds) * 10) / 10, medianMs: Math.round(pct(ft, 50) * 10) / 10, p95Ms: Math.round(pct(ft, 95) * 10) / 10, calls: st.calls, triangles: st.triangles, pixelRatio: st.pixelRatio, shadows: st.shadows, quality };
  }, [quality]);

  // واجهة القياس الآلي
  useEffect(() => {
    window.__spike = { ready: status === "ready", timings: timingsRef.current, pkg, quality, hashes: computeHashes, server: compareServer, measureFps, errors: errorsRef.current };
  }, [status, timings, pkg, quality, computeHashes, compareServer, measureFps]);

  // ?auto=1: تحميل المحرك فور فتح الصفحة (لقياس الجاهزية منذ بدء التنقل)
  const autoStarted = useRef(false);
  useEffect(() => {
    const p = params.current;
    if (autoStarted.current || !p || p.get("auto") !== "1") return;
    autoStarted.current = true;
    // نقرأ المعاملات مباشرة (لا من الحالة) لأن setState من التأثير السابق لم يُطبَّق بعد في هذا الإطار
    const l = p.get("layout");
    void start({
      pkg: p.get("pkg") === "compat" ? "compat" : "standard",
      quality: p.get("quality") === "low" ? "low" : "high",
      layout: l && layouts.some((x) => x.key === l) ? l : undefined,
    });
  }, [start, layouts]);

  const fireManual = () => {
    const sim = simRef.current;
    if (!sim || !sim.isSettled()) return;
    replayRef.current = { next: Number.MAX_SAFE_INTEGER, wait: 0, loop: false };
    sim.fire({ idx: sim.shotsFired, ammo: "meteor", angleStep: aim.angle, powerStep: aim.power, activateAt: -1 });
  };

  const current = layouts.find((l) => l.key === layoutKey);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-bold">
            التصميم
            <select className="min-h-11 rounded-xl border border-line bg-white px-3" value={layoutKey} onChange={(e) => setLayoutKey(e.target.value)} disabled={status === "loading"}>
              {layouts.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.title} ({l.key})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            حزمة Rapier
            <select className="min-h-11 rounded-xl border border-line bg-white px-3" value={pkg} onChange={(e) => setPkg(e.target.value as Pkg)} disabled={status !== "idle"}>
              <option value="standard">standard (.wasm مستقل)</option>
              <option value="compat">compat (base64)</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            الجودة
            <select className="min-h-11 rounded-xl border border-line bg-white px-3" value={autoQuality ? "auto" : quality} onChange={(e) => {
              const v = e.target.value;
              setAutoQuality(v === "auto");
              const q: Quality = v === "low" ? "low" : "high";
              setQuality(q);
              if (status === "ready") setCanvasKey((k) => k + 1);
            }}>
              <option value="high">عالية</option>
              <option value="low">منخفضة</option>
              <option value="auto">تلقائية</option>
            </select>
          </label>
          <button type="button" className="btn btn-3d btn-primary btn-md" onClick={() => (status === "ready" ? void newSim(layoutKey, pkg) : void start())} disabled={status === "loading"}>
            {status === "ready" ? "أعد الحل المرجعي" : status === "loading" ? "جارٍ التحميل…" : "ابدأ (تحميل المحرك)"}
          </button>
        </div>
        {current ? (
          <p className="text-sm text-ink-soft">
            المستوى {current.tier} · أجسام ديناميكية: {current.dynamic} · طلقات الحل المرجعي: {current.shots} من {current.par} · البصمة الذهبية (Node): <code dir="ltr">{current.golden}</code>
          </p>
        ) : null}
        {message ? <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger" dir="ltr">{message}</p> : null}
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-line bg-[#0d1b3d]">
        <canvas key={canvasKey} ref={canvasRef} className="block aspect-video w-full" aria-label="مشهد التجربة التقنية" />
        {status === "idle" ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            <div className="max-w-md space-y-2">
              <p className="text-lg font-extrabold">بطاقة أهداف المستوى</p>
              <p className="text-sm text-white/80">حرّر كل القناديل. المحرك (three وRapier) لا يُحمَّل إلا بعد الضغط على «ابدأ».</p>
            </div>
          </div>
        ) : null}
        {debug ? (
          <div className="pointer-events-none absolute start-3 top-3 rounded-xl bg-black/70 p-3 font-mono text-[12px] leading-5 text-emerald-200" dir="ltr" data-spike-perf>
            <div>fps {hud.fps} · frame median {hud.median} ms</div>
            <div>draw calls {hud.calls} · tris {hud.tris} · DPR {hud.dpr}</div>
            <div>quality {quality}{autoQuality ? " (auto)" : ""} · pkg {pkg}</div>
            <div>engine ready {timings.engine_ready_since_navigation_ms ?? "-"} ms (nav) / {timings.engine_ready_from_click_ms ?? "-"} ms (click)</div>
            <div>steps {hud.steps} · freed {hud.freed} · hash {hud.stepHash}</div>
          </div>
        ) : null}
      </div>

      <div className="panel grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5">
        <label className="grid gap-1 text-sm font-bold">
          الزاوية (خطوة {aim.angle})
          <input type="range" min={0} max={80} step={1} value={aim.angle} onChange={(e) => setAim((a) => ({ ...a, angle: Number(e.target.value) }))} />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          القوة (خطوة {aim.power})
          <input type="range" min={0} max={40} step={1} value={aim.power} onChange={(e) => setAim((a) => ({ ...a, power: Number(e.target.value) }))} />
        </label>
        <button type="button" className="btn btn-3d btn-accent btn-md" onClick={fireManual} disabled={status !== "ready"}>
          أطلق شهابًا يدويًا
        </button>
      </div>

      <div className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-3d btn-soft btn-md" onClick={() => void computeHashes("standard")}>بصمات المتصفح (standard)</button>
          <button type="button" className="btn btn-3d btn-soft btn-md" onClick={() => void computeHashes("compat")}>بصمات المتصفح (compat)</button>
          <button type="button" className="btn btn-3d btn-outline btn-md" onClick={() => void compareServer("compat")}>قارن بالخادم (Node، compat)</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" data-spike-hashes>
            <thead>
              <tr className="text-start">
                <th className="p-2 text-start">التصميم</th>
                <th className="p-2 text-start">الذهبية (Node)</th>
                <th className="p-2 text-start">المتصفح standard</th>
                <th className="p-2 text-start">المتصفح compat</th>
                <th className="p-2 text-start">الخادم Node (compat)</th>
              </tr>
            </thead>
            <tbody dir="ltr">
              {layouts.map((l) => {
                const cell = (h?: string) => (h ? <span className={h === l.golden ? "text-emerald-700" : "font-bold text-red-700"}>{h}{h === l.golden ? " ✓" : " ✗"}</span> : "-");
                return (
                  <tr key={l.key} className="border-t border-line">
                    <td className="p-2 font-mono">{l.key}</td>
                    <td className="p-2 font-mono">{l.golden}</td>
                    <td className="p-2 font-mono">{cell(rows.standard?.find((r) => r.key === l.key)?.hash)}</td>
                    <td className="p-2 font-mono">{cell(rows.compat?.find((r) => r.key === l.key)?.hash)}</td>
                    <td className="p-2 font-mono">{cell(serverRows.compat?.find((r) => r.key === l.key)?.hash)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink-soft">على iPhone حقيقي: افتح هذه الصفحة واضغط «بصمات المتصفح» ثم «قارن بالخادم»؛ كل خلية خضراء ✓ تعني تطابق الحتمية بين Safari وNode.</p>
      </div>
    </div>
  );
}
