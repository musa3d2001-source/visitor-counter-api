// [تجربة المرحلة 0 - كود مؤقت] يجمع نتائج القياس الخام في docs/game/spike/results.json (ملخص + قرارات بالأرقام).
// التشغيل: node scripts/game-spike/compile-results.mjs
import fs from "node:fs";

const read = (f) => JSON.parse(fs.readFileSync(`docs/game/spike/${f}`, "utf8"));
const node = read("node-results.json");
const browser = read("browser-results.json");
const replay = read("browser-replay-results.json");
const webkit = read("webkit-results.json");
const sizes = read("sizes-isolated.json");
const traceFinal = read("trace-report.json");
const traceA = read("trace-report-experiment-A.json");
const iso = read("isolation-analyzer.json");
const control = read("sizes-isolated-control-head.json");
const trivial = read("sizes-isolated-control-trivial-route.json");

const g = sizes.groups;
const initial = sizes.spikeRouteInitialJs.initialJs;
const gameJsNoRapier = g.spikeStage.gzip + g.spikeEngine.gzip + g.three.gzip;
const rapierStd = g.rapierStandardGlue.gzip + g.rapierWasm.gzip;
const rapierCompat = g.rapierCompat.gzip;

const deltas = (a, b) => [...new Set(Object.entries(a.routes).filter(([r]) => b.routes[r]).map(([r, v]) => v.initialJs.raw - b.routes[r].initialJs.raw))];
const gzDeltas = (a, b) => [...new Set(Object.entries(a.routes).filter(([r]) => b.routes[r]).map(([r, v]) => v.initialJs.gzip - b.routes[r].initialJs.gzip))];

const replayP95 = {};
for (const pkg of ["standard", "compat"]) {
  const L = node.packages[pkg].layouts;
  replayP95[pkg] = Math.max(...Object.values(L).map((v) => v.replayMs.p95));
}

const out = {
  generatedAt: new Date().toISOString(),
  environment: { node: node.node, cpu: node.cpu, cpuCount: node.cpuCount, chromium: browser.chromium, webkit: `${webkit.browser.name} (WebKitGTK) ${webkit.browser.version} ${webkit.browser.platform}`, next: "16.4.4 (Turbopack)", three: "0.186.0", rapier: "0.21.0" },
  determinism: {
    node: {
      runsPerLayout: node.runsPerLayout,
      distinctHashesPerLayout: Object.fromEntries(["standard", "compat"].map((p) => [p, Math.max(...Object.values(node.packages[p].layouts).map((v) => v.distinctHashesOverRuns))])),
      inProcess3RunsEqual: ["standard", "compat"].every((p) => Object.values(node.packages[p].layouts).every((v) => v.inProcess3RunsEqual)),
      childProcessEqual: ["standard", "compat"].every((p) => node.packages[p].childProcess.allHashesEqual),
      standardEqualsCompat: node.crossPackageEqual,
    },
    chromium: { allMatchGolden: browser.hashes.allBrowserMatchGolden, serverCompatMatchesGolden: browser.hashes.serverMatchesGolden },
    webkitgtk: { standard: webkit.standard.allMatchGolden, compat: webkit.compat.allMatchGolden, serverMatchesWebkit: webkit.serverMatchesWebkit },
    golden: Object.fromEntries(Object.entries(node.packages.standard.layouts).map(([k, v]) => [k, v.stateHash])),
    seedSensitivity: Object.fromEntries(Object.entries(node.packages.standard.layouts).map(([k, v]) => [k, { otherSeedHashDiffers: v.otherSeed.differs, otherSeedStillCleared: v.otherSeed.cleared }])),
  },
  sizes: {
    method: sizes.method,
    source: "isolated build: git archive HEAD (5ac09eb) + spike only (see sizes-isolated*.json)",
    three: g.three,
    rapierStandardGlue: g.rapierStandardGlue,
    rapierStandardWasm: g.rapierWasm,
    rapierStandardTotalGzip: rapierStd,
    rapierCompat: g.rapierCompat,
    spikeEngine: g.spikeEngine,
    spikeStage: g.spikeStage,
    spikeRouteInitialJs: initial,
    gameJsWithoutRapierGzip: gameJsNoRapier,
    spikeRouteTotalGzip: { standard: initial.gzip + gameJsNoRapier + rapierStd, compat: initial.gzip + gameJsNoRapier + rapierCompat },
    measuredTransferNextStart: { standard: browser.engineReady.standard.median.transferBytes, compat: browser.engineReady.compat.median.transferBytes },
  },
  isolation: {
    analyzerHeavyOnlyInSpikeAsync: iso.offenders.length === 0,
    heavyByRoute: iso.heavyByRoute,
    analyzerDeltaExistingRoutesRaw: iso.distinctDeltasOnExistingRoutes,
    buildDeltaSpikeVsHeadRaw: deltas(sizes, control),
    buildDeltaSpikeVsHeadGzip: gzDeltas(sizes, control),
    buildDeltaTrivialRouteVsHeadRaw: deltas(trivial, control),
    buildDeltaTrivialRouteVsHeadGzip: gzDeltas(trivial, control),
    networkCheck: browser.isolation,
  },
  serverTrace: {
    experimentA_standardInServerGraph: { page: traceA["admin/game/spike/page.js.nft.json"], route: traceA["admin/game/spike/replay/route.js.nft.json"] },
    final_compatServer_ssrFalseClient: { page: traceFinal["admin/game/spike/page.js.nft.json"], route: traceFinal["admin/game/spike/replay/route.js.nft.json"], referenceSettingsPage: traceFinal["admin/settings/page.js.nft.json"] },
  },
  performance: {
    nodeReplayP95MaxMs: replayP95,
    nodeLayouts: Object.fromEntries(Object.entries(node.packages.standard.layouts).map(([k, v]) => [k, { tier: v.tier, dynamic: v.dynamicBodies, shots: v.shots, steps: v.steps, p50: v.replayMs.p50, p95: v.replayMs.p95, compatP95: node.packages.compat.layouts[k].replayMs.p95, avgStepUs: v.avgStepUs, stepP95Us: v.stepProfileUs.p95us, stepMaxUs: v.stepProfileUs.maxus }])),
    nodeLoadMs: { standard: node.packages.standard.loadMs, compat: node.packages.compat.loadMs, compatChild: node.packages.compat.childProcess.loadMs, standardChild: node.packages.standard.childProcess.loadMs, serverRouteFirstCall: browser.hashes.server.loadMs },
    engineReadyPhoneCpu4Fast4g: { standard: browser.engineReady.standard.median, compat: browser.engineReady.compat.median },
    fpsSwiftShaderCpu4: browser.fps,
    browserReplay: Object.fromEntries(Object.entries(replay.runs).map(([k, v]) => [k, { firstPassTotalMs: v.firstPassTotalMs, warmMaxLayoutP50Ms: v.warmMaxLayoutP50Ms }])),
    webkitgtkLowNoThrottle: webkit.fpsLow,
  },
  csp: { violationsFinal: browser.csp.count },
};
fs.writeFileSync("docs/game/spike/results.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ sizes: out.sizes.spikeRouteTotalGzip, gameJs: gameJsNoRapier, rapierStd, rapierCompat, iso: out.isolation.buildDeltaSpikeVsHeadRaw, isoGz: out.isolation.buildDeltaSpikeVsHeadGzip, trivial: out.isolation.buildDeltaTrivialRouteVsHeadRaw, trivialGz: out.isolation.buildDeltaTrivialRouteVsHeadGzip, replayP95 }, null, 1));
