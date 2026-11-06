#!/usr/bin/env node
/**
 * Bundle isolation gate for the game (phase 0 onwards). Tooling only: not imported by the app.
 *
 * Compares a fresh Turbopack Bundle Analyzer export with the committed baseline
 * (docs/game/baseline/bundle-baseline.json) and FAILS (exit 1) when:
 *   1. `three` or `@dimforge/*` (Rapier) appears in the client JS (initial OR lazy) of any route
 *      other than /admin/game/spike (and its sub-routes) and /lab/game-*, or in the server (SSR)
 *      graph of any route outside those prefixes;
 *   2. the initial client JS (raw bytes) of any route that exists in the baseline grew
 *      (beyond --tolerance, default 0 bytes);
 *   3. a baseline route's lazy (import()) JS grew beyond --tolerance (reported separately).
 *
 * The per-route numbers use exactly the method of docs/game/baseline/summarize-bundle.mjs:
 * initial JS = client `.js` parts of the route's `bootstrap` + `render_dependent` output groups.
 *
 * Usage (from edu-platform/):
 *   # capture a new snapshot, export it and check it (does not stop the dev server):
 *   node scripts/check-game-bundle.mjs --capture [--snapshot <name>]
 *   # or check an existing export:
 *   npx next analyze --output --snapshot <name>
 *   npx next analyze export --snapshot <name> > /tmp/graph-<name>.jsonl
 *   node scripts/check-game-bundle.mjs --graph /tmp/graph-<name>.jsonl
 * Options:
 *   --baseline <file>   default docs/game/baseline/bundle-baseline.json
 *   --tolerance <bytes> allowed growth per route (default 0)
 *   --json <file>       also write the full comparison as JSON
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const baselineFile = path.resolve(ROOT, opt("baseline", "docs/game/baseline/bundle-baseline.json"));
const tolerance = Number(opt("tolerance", 0));
const jsonOut = opt("json", null);

/** Routes allowed to contain three / Rapier. */
const ALLOWED = [/^\/admin\/game\/spike(\/|$)/, /^\/lab\/game-[^/]+(\/|$)/];
const isAllowed = (route) => ALLOWED.some((re) => re.test(route));
/** Packages that must stay inside the allowed routes. */
const GAME_PKG = /node_modules\/(three|@dimforge\/[^/]+)\//;

// ---- 0. obtain the analyzer graph ------------------------------------------------------
let graphFile = opt("graph", null);
if (!graphFile) {
  if (!opt("capture", false)) {
    console.error("usage: node scripts/check-game-bundle.mjs (--capture [--snapshot <name>] | --graph <export.jsonl>) [--baseline f] [--tolerance n] [--json f]");
    process.exit(2);
  }
  const snap = typeof opt("snapshot") === "string" ? opt("snapshot") : `gate-${Date.now()}`;
  const nextBin = path.join(ROOT, "node_modules/next/dist/bin/next");
  console.log(`[capture] next analyze --output --snapshot ${snap}`);
  execFileSync(process.execPath, [nextBin, "analyze", "--output", "--snapshot", snap], { cwd: ROOT, stdio: "inherit" });
  graphFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "game-bundle-")), `graph-${snap}.jsonl`);
  console.log(`[capture] next analyze export --snapshot ${snap} > ${graphFile}`);
  const fd = fs.openSync(graphFile, "w");
  execFileSync(process.execPath, [nextBin, "analyze", "export", "--snapshot", snap], { cwd: ROOT, stdio: ["ignore", fd, "inherit"], maxBuffer: 1 << 30 });
  fs.closeSync(fd);
}

// ---- 1. read the graph (same rules as summarize-bundle.mjs) ----------------------------
const CLIENT = "[client-fs]/_next/";
const routes = [];
const groups = new Map(); // route -> { bootstrap, render_dependent, async, ... }: Set<filename>
const clientParts = new Map(); // `${route}\0${file}` -> { size, gz }
const gamePkgs = new Map(); // route -> Map(`${pkg} (${where})` -> bytes)
let meta = null;
const addGame = (route, key, size) => {
  if (!gamePkgs.has(route)) gamePkgs.set(route, new Map());
  const m = gamePkgs.get(route);
  m.set(key, (m.get(key) ?? 0) + size);
};
for (const line of fs.readFileSync(graphFile, "utf8").split("\n")) {
  if (!line) continue;
  const r = JSON.parse(line);
  if (r.type === "meta") meta = r;
  else if (r.type === "route") routes.push(r.route);
  else if (r.type === "group") {
    if (!groups.has(r.route)) groups.set(r.route, {});
    const g = groups.get(r.route);
    g[r.kind] ??= new Set();
    for (const o of r.outputs) g[r.kind].add(o);
  } else if (r.type === "part") {
    const pkg = GAME_PKG.exec(r.source_path ?? "");
    const isClient = r.filename.startsWith(CLIENT);
    if (pkg) addGame(r.route, `${pkg[1]} (${isClient ? "client" : "server"})`, r.size);
    if (!isClient) continue;
    const k = `${r.route}\0${r.filename}`;
    if (!clientParts.has(k)) clientParts.set(k, { size: 0, gz: 0 });
    const p = clientParts.get(k);
    p.size += r.size;
    p.gz += r.compressed_size;
  }
}
if (!routes.length) {
  console.error(`no routes in ${graphFile}: is it a \`next analyze export\` JSON Lines file?`);
  process.exit(2);
}

const sum = (route, files) => {
  let raw = 0, gzip = 0;
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const p = clientParts.get(`${route}\0${f}`);
    if (p) { raw += p.size; gzip += p.gz; }
  }
  return { raw, gzip };
};
const current = {};
for (const route of routes) {
  const g = groups.get(route) ?? {};
  const initial = new Set([...(g.bootstrap ?? []), ...(g.render_dependent ?? [])]);
  const asyncOnly = [...(g.async ?? [])].filter((f) => !initial.has(f));
  current[route] = { initialJs: sum(route, initial), asyncJs: sum(route, asyncOnly) };
}

// ---- 2. compare --------------------------------------------------------------------------
const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
const failures = [];
const leaks = [];
for (const route of routes) {
  const found = gamePkgs.get(route);
  if (!found || isAllowed(route)) continue;
  for (const [pkg, bytes] of found) leaks.push({ route, pkg, bytes });
}
for (const l of leaks) failures.push(`three/Rapier leak: ${l.pkg} in ${l.route} (${l.bytes} B)`);

const rows = [];
for (const [route, b] of Object.entries(baseline.routes)) {
  const c = current[route];
  if (!c) { rows.push({ route, status: "missing" }); continue; }
  const dInit = c.initialJs.raw - b.analyzer.initialJs.raw;
  const dInitGz = c.initialJs.gzip - b.analyzer.initialJs.gzip;
  const dAsync = c.asyncJs.raw - b.analyzer.asyncJs.raw;
  const grew = dInit > tolerance;
  const asyncGrew = dAsync > tolerance;
  if (grew) failures.push(`initial JS grew: ${route} +${dInit} B raw (${b.analyzer.initialJs.raw} -> ${c.initialJs.raw})`);
  if (asyncGrew) failures.push(`lazy JS grew: ${route} +${dAsync} B raw (${b.analyzer.asyncJs.raw} -> ${c.asyncJs.raw})`);
  rows.push({ route, kind: b.kind, baseline: b.analyzer.initialJs.raw, current: c.initialJs.raw, delta: dInit, deltaGzip: dInitGz, asyncDelta: dAsync, status: grew || asyncGrew ? "GREW" : dInit < 0 ? "smaller" : "same" });
}
const newRoutes = routes.filter((r) => !(r in baseline.routes)).map((route) => ({
  route,
  allowedGame: isAllowed(route),
  initialJs: current[route].initialJs,
  asyncJs: current[route].asyncJs,
  gamePackages: Object.fromEntries(gamePkgs.get(route) ?? []),
}));

// ---- 3. report ---------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const num = (n) => (n > 0 ? `+${n}` : String(n));
console.log(`\nsnapshot: ${meta?.snapshot_name ?? "?"} (${routes.length} routes) vs baseline ${baseline.snapshot?.name ?? "?"} @ ${baseline.snapshot?.gitShortSha ?? "?"} (${Object.keys(baseline.routes).length} routes); tolerance ${tolerance} B\n`);
console.log(`${pad("route", 40)} ${pad("baseline", 9)} ${pad("current", 9)} ${pad("delta", 7)} ${pad("gzip d", 7)} status`);
for (const r of rows) {
  if (r.status === "missing") { console.log(`${pad(r.route, 40)} (missing in current snapshot)`); continue; }
  if (r.kind === "route-handler" && r.current === 0 && r.baseline === 0) continue;
  console.log(`${pad(r.route, 40)} ${pad(r.baseline, 9)} ${pad(r.current, 9)} ${pad(num(r.delta), 7)} ${pad(num(r.deltaGzip), 7)} ${r.status}`);
}
console.log("\nnew routes:");
for (const n of newRoutes) {
  const pk = Object.entries(n.gamePackages).map(([k, v]) => `${k}=${v}`).join(", ") || "none";
  console.log(`  ${pad(n.route, 38)} initial ${pad(n.initialJs.raw, 8)} lazy ${pad(n.asyncJs.raw, 8)} ${n.allowedGame ? "[game-allowed]" : "[not game-allowed]"} three/rapier: ${pk}`);
}
const summary = {
  pass: failures.length === 0,
  graph: graphFile,
  snapshot: meta?.snapshot_name ?? null,
  baseline: path.relative(ROOT, baselineFile),
  tolerance,
  counts: {
    baselineRoutes: rows.length,
    grew: rows.filter((r) => r.status === "GREW").length,
    same: rows.filter((r) => r.status === "same").length,
    smaller: rows.filter((r) => r.status === "smaller").length,
    missing: rows.filter((r) => r.status === "missing").length,
    newRoutes: newRoutes.length,
    leaks: leaks.length,
  },
  failures,
  routes: rows,
  newRoutes,
};
if (typeof jsonOut === "string") fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + "\n");
console.log(`\n${JSON.stringify(summary.counts)}`);
if (failures.length) {
  console.error(`\nFAIL (${failures.length}):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nPASS: three/Rapier only in /admin/game/spike and /lab/game-*, and no baseline route's JS grew.");
