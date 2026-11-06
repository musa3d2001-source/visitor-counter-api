// [تجربة المرحلة 0 - كود مؤقت] يثبت العزل من لقطة Bundle Analyzer (Turbopack) مقارنةً بخط الأساس:
// 1) أين تظهر وحدات three و@dimforge في JS العميل لكل مسار (bootstrap / render_dependent / async)؟
// 2) هل تغيّر JS التحميل الأول لأي مسار قائم مقارنة بـ docs/game/baseline/bundle-baseline.json؟
// التشغيل:
//   npx next analyze --output --snapshot spike && npx next analyze export --snapshot spike > /tmp/graph-spike.jsonl
//   node scripts/game-spike/isolation-check.mjs --graph /tmp/graph-spike.jsonl [--baseline docs/game/baseline/bundle-baseline.json]
import fs from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const graph = arg("graph");
const baseline = JSON.parse(fs.readFileSync(arg("baseline", "docs/game/baseline/bundle-baseline.json"), "utf8"));
const CLIENT = "[client-fs]/_next/";
const HEAVY = /node_modules\/(three|@dimforge\/[^/]+)\//;

const groups = new Map(); // route -> kind -> Set(file)
const heavyParts = []; // { route, file, pkg, size, gz }
const partsByRouteFile = new Map();
const routes = [];
for (const line of fs.readFileSync(graph, "utf8").split("\n")) {
  if (!line) continue;
  const r = JSON.parse(line);
  if (r.type === "route") routes.push(r.route);
  else if (r.type === "group") {
    if (!groups.has(r.route)) groups.set(r.route, {});
    const g = groups.get(r.route);
    g[r.kind] ??= new Set();
    for (const o of r.outputs) g[r.kind].add(o);
  } else if (r.type === "part" && r.filename.startsWith(CLIENT)) {
    const k = `${r.route}\0${r.filename}`;
    const p = partsByRouteFile.get(k) ?? { raw: 0, gz: 0 };
    p.raw += r.size;
    p.gz += r.compressed_size;
    partsByRouteFile.set(k, p);
    const m = HEAVY.exec(r.source_path);
    if (m) heavyParts.push({ route: r.route, file: r.filename.replace(CLIENT, ""), pkg: m[1], size: r.size, gz: r.compressed_size });
  }
}

// أين تظهر three/@dimforge ولأي نوع مجموعة
const heavyByRoute = {};
for (const h of heavyParts) {
  const g = groups.get(h.route) ?? {};
  const full = CLIENT + h.file;
  const kinds = Object.entries(g)
    .filter(([, set]) => set.has(full))
    .map(([k]) => k);
  const key = `${h.route}`;
  heavyByRoute[key] ??= {};
  const e = (heavyByRoute[key][h.pkg] ??= { raw: 0, gzipEstimate: 0, files: new Set(), kinds: new Set() });
  e.raw += h.size;
  e.gzipEstimate += h.gz;
  e.files.add(h.file);
  for (const k of kinds) e.kinds.add(k);
}
for (const r of Object.values(heavyByRoute)) for (const v of Object.values(r)) {
  v.files = [...v.files];
  v.kinds = [...v.kinds];
}

// JS التحميل الأول لكل مسار مقارنة بخط الأساس (حجم المحلل الخام)
const initialRaw = (route) => {
  const g = groups.get(route) ?? {};
  const files = new Set([...(g.bootstrap ?? []), ...(g.render_dependent ?? [])]);
  let raw = 0;
  for (const f of files) if (f.endsWith(".js")) raw += partsByRouteFile.get(`${route}\0${f}`)?.raw ?? 0;
  return raw;
};
const deltas = {};
for (const route of routes) {
  const b = baseline.routes[route];
  if (!b) {
    deltas[route] = { baseline: null, now: initialRaw(route), note: "new route" };
    continue;
  }
  const now = initialRaw(route);
  const d = now - b.analyzer.initialJs.raw;
  if (d !== 0) deltas[route] = { baseline: b.analyzer.initialJs.raw, now, delta: d };
}
const offenders = Object.entries(heavyByRoute).filter(([route, pk]) => route !== "/admin/game/spike" || Object.values(pk).some((v) => v.kinds.some((k) => k !== "async")));
const out = {
  graph,
  routes: routes.length,
  heavyByRoute,
  offenders: offenders.map(([r]) => r),
  initialJsDeltas: deltas,
  distinctDeltasOnExistingRoutes: [...new Set(Object.values(deltas).filter((d) => d.delta !== undefined).map((d) => d.delta))],
};
console.log(JSON.stringify(out, null, 2));
