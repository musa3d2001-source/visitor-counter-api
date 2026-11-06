"use client";

import { useEffect, useRef, useState } from "react";
import { SPIKE_LAYOUTS } from "@/game/spike/layouts";

/**
 * مشغّل التجربة في المتصفح. لا يستورد three ولا Rapier استيرادًا ثابتًا: كلاهما بـ import() عند الضغط،
 * فلا يدخلان في حزمة أي صفحة أخرى. يقرأ ‎?auto=1‎ و‎?flavors=split,compat‎ و‎?visual=0‎ للقياس الآلي.
 */
export type ServerReplay = { node: string; layouts: Record<string, { hashes: string[]; ms: number; steps: number }> };

type Bytes = { transfer: number; encoded: number; decoded: number; files: string[] };
type FlavorResult = {
  flavor: "split" | "compat";
  ok: boolean;
  error?: string;
  loadMs: number;
  bytes: Bytes;
  allMatch: boolean;
  replay: { key: string; ms: number; match: boolean; firstMismatchShot: number }[];
  usPerStep: number;
};
type VisualResult = { quality: "high" | "low"; seconds: number; fps: number; medianMs: number; p95Ms: number; drawCalls: number; triangles: number; dpr: number; frames: number };
type Results = {
  ua: string;
  dpr: number;
  cores: number;
  viewport: string;
  webgl2: boolean;
  serverNode: string;
  flavors: FlavorResult[];
  threeLoadMs: number;
  threeBytes: Bytes;
  engineReadyMs: number;
  visual: VisualResult[];
  done: boolean;
};

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
const kb = (n: number) => `${Math.round(n / 1024)} ك.ب`;

export function SpikeRunner({ server }: { server: ServerReplay }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [copied, setCopied] = useState(false);
  const say = (s: string) => setLog((l) => [...l, s]);

  async function run() {
    if (running) return;
    setRunning(true);
    setLog([]);
    setCopied(false);
    const params = new URLSearchParams(window.location.search);
    const flavors = (params.get("flavors") ?? "split,compat").split(",").filter((f): f is "split" | "compat" => f === "split" || f === "compat");
    const doVisual = params.get("visual") !== "0";
    const clickAt = performance.now();
    const probe = document.createElement("canvas");
    const res: Results = {
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      cores: navigator.hardwareConcurrency ?? 0,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      webgl2: !!probe.getContext("webgl2"),
      serverNode: server.node,
      flavors: [],
      threeLoadMs: 0,
      threeBytes: { transfer: 0, encoded: 0, decoded: 0, files: [] },
      engineReadyMs: 0,
      visual: [],
      done: false,
    };
    const { loadRapier } = await import("@/game/spike/rapier-loader");
    const { runHeadless, createSim } = await import("@/game/spike/sim");
    let firstR: Awaited<ReturnType<typeof loadRapier>> | null = null;

    for (const flavor of flavors) {
      say(`تحميل الفيزياء (${flavor === "split" ? "ملف WASM مستقل" : "WASM مضمّن"})…`);
      const t0 = performance.now();
      const fr: FlavorResult = { flavor, ok: false, loadMs: 0, bytes: { transfer: 0, encoded: 0, decoded: 0, files: [] }, allMatch: false, replay: [], usPerStep: 0 };
      try {
        const R = await loadRapier(flavor);
        fr.loadMs = Math.round(performance.now() - t0);
        fr.bytes = resourceBytes(t0, isScriptOrWasm);
        firstR ??= R;
        let steps = 0;
        let ms = 0;
        for (const l of SPIKE_LAYOUTS) {
          const r = runHeadless(R, l, () => performance.now());
          const srv = server.layouts[l.key];
          const mism = r.hashes.findIndex((h, i) => h !== srv?.hashes[i]);
          fr.replay.push({ key: l.key, ms: Math.round(r.ms * 10) / 10, match: mism === -1, firstMismatchShot: mism });
          steps += r.steps;
          ms += r.ms;
        }
        fr.usPerStep = Math.round((ms * 1000) / steps);
        fr.allMatch = fr.replay.every((x) => x.match);
        fr.ok = true;
        say(`${flavor}: ${fr.loadMs} م.ث، ${kb(fr.bytes.encoded)} منقولة، التطابق ${fr.allMatch ? "كامل ✓" : "مختلف ✗"}`);
      } catch (e) {
        fr.error = String(e instanceof Error ? e.message : e);
        say(`${flavor}: فشل التحميل (${fr.error})`);
      }
      res.flavors.push(fr);
      setResults({ ...res });
    }

    if (doVisual && firstR && canvasRef.current) {
      say("تحميل الرسم ثلاثي الأبعاد…");
      const t0 = performance.now();
      const { createRenderer } = await import("@/game/spike/render");
      res.threeLoadMs = Math.round(performance.now() - t0);
      res.threeBytes = resourceBytes(t0, isScriptOrWasm);
      const stress = SPIKE_LAYOUTS.find((l) => l.key === "stress-90")!;
      for (const quality of ["high", "low"] as const) {
        say(`قياس السلاسة (${quality === "high" ? "جودة عالية" : "جودة منخفضة"}) لمدة ٦ ثوانٍ…`);
        const sim = createSim(firstR, stress);
        const r = createRenderer(canvasRef.current, { quality, maxBodies: stress.bodies.length + 4 });
        r.draw(sim);
        if (!res.engineReadyMs) res.engineReadyMs = Math.round(performance.now() - clickAt);
        r.resetStats();
        await new Promise<void>((done) => {
          let shot = 0;
          let quiet = 0;
          let acc = 0;
          let last = performance.now();
          const start = last;
          sim.fire(stress.shots[0]);
          const frame = (now: number) => {
            acc += Math.min(now - last, 100);
            last = now;
            let n = 0;
            while (acc >= 1000 / 60 && n < 4) {
              sim.step();
              quiet = sim.isQuiet() ? quiet + 1 : 0;
              acc -= 1000 / 60;
              n++;
              if ((quiet >= 30 || sim.stepInShot > 600) && shot + 1 < stress.shots.length) {
                shot++;
                quiet = 0;
                sim.fire(stress.shots[shot]);
              }
            }
            r.draw(sim, Math.sin((now - start) / 2000) * 3);
            if (now - start < 6000) requestAnimationFrame(frame);
            else done();
          };
          requestAnimationFrame(frame);
        });
        const s = r.stats();
        res.visual.push({ quality, seconds: 6, fps: s.fps, medianMs: s.medianMs, p95Ms: s.p95Ms, drawCalls: s.drawCalls, triangles: s.triangles, dpr: s.dpr, frames: s.frames });
        say(`${quality}: ${s.fps} إطار/ث (الوسيط ${s.medianMs} م.ث، p95 ${s.p95Ms}) و${s.drawCalls} draw calls`);
        r.dispose();
        sim.free();
        setResults({ ...res });
      }
    }
    res.done = true;
    setResults({ ...res });
    (window as unknown as { __spike: Results }).__spike = res;
    document.body.dataset.spikeDone = "1";
    setRunning(false);
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auto") === "1") void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const json = results ? JSON.stringify(results, null, 2) : "";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-3d btn-primary btn-lg" onClick={run} disabled={running} data-testid="spike-run">
          {running ? "جارٍ القياس…" : "ابدأ القياس"}
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
        <span className="text-sm text-muted">خادم Node {server.node}، {SPIKE_LAYOUTS.length} تصاميم أولية</span>
      </div>
      <div className="overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#0b1736,#173a63_70%,#1d5f7a)]">
        <canvas ref={canvasRef} className="block aspect-video w-full" aria-label="مشهد القياس" />
      </div>
      <ul className="space-y-1 text-[0.95rem]" aria-live="polite">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {results && (
        <details open={results.done}>
          <summary className="cursor-pointer font-display font-bold">النتيجة الكاملة (JSON)</summary>
          <pre dir="ltr" className="mt-2 max-h-96 overflow-auto rounded-2xl bg-[#0f1b2d] p-4 text-xs text-[#d6f5ef]" data-testid="spike-results">
            {json}
          </pre>
        </details>
      )}
    </div>
  );
}
