#!/usr/bin/env node
/**
 * Summarise a Turbopack Bundle Analyzer snapshot (JSON Lines from `next analyze export`)
 * into a compact per-route JSON, optionally with sizes measured from a real `next build`.
 *
 * Tooling only (phase 0 baseline). Not imported by the app.
 *
 * Usage (from edu-platform/):
 *   npx next analyze --output --snapshot <name>
 *   npx next analyze export --snapshot <name> > /tmp/graph.jsonl
 *   npx next build                      # optional, for the "measured" block
 *   node docs/game/baseline/summarize-bundle.mjs --graph /tmp/graph.jsonl \
 *        --snapshot-dir .next/diagnostics/analyze/history/snapshot-<name> \
 *        [--build-dir .next] --out docs/game/baseline/bundle-baseline.json
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import vm from "node:vm";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, []),
);
if (!args.graph || !args.out) {
  console.error("usage: --graph <graph.jsonl> --out <summary.json> [--snapshot-dir <dir>] [--build-dir .next]");
  process.exit(2);
}

const CLIENT = "[client-fs]/_next/";
const short = (f) => f.replace(CLIENT, "");
const pkgOf = (src) => {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(src);
  if (m) return m[1];
  if (src.includes("/src/")) return "(app src)";
  return "(other)";
};

// ---- 1. read analyzer graph -------------------------------------------------
const routes = [];
const groups = new Map(); // route -> { bootstrap:Set, render_dependent:Set, async:Set }
const parts = new Map(); // `${route}\0${file}` -> { size, gz, pkgs: Map }
let meta = null;
for (const line of fs.readFileSync(args.graph, "utf8").split("\n")) {
  if (!line) continue;
  const r = JSON.parse(line);
  if (r.type === "meta") meta = r;
  else if (r.type === "route") routes.push(r.route);
  else if (r.type === "group") {
    if (!groups.has(r.route)) groups.set(r.route, { bootstrap: new Set(), render_dependent: new Set(), async: new Set() });
    const g = groups.get(r.route);
    (g[r.kind] ?? (g[r.kind] = new Set()));
    for (const o of r.outputs) g[r.kind].add(o);
  } else if (r.type === "part" && r.filename.startsWith(CLIENT)) {
    const k = `${r.route}\0${r.filename}`;
    if (!parts.has(k)) parts.set(k, { size: 0, gz: 0, pkgs: new Map() });
    const p = parts.get(k);
    p.size += r.size;
    p.gz += r.compressed_size;
    const pk = pkgOf(r.source_path);
    p.pkgs.set(pk, (p.pkgs.get(pk) ?? 0) + r.size);
  }
}

const sum = (route, files, ext) => {
  let raw = 0, gz = 0;
  for (const f of files) {
    if (!f.endsWith(ext)) continue;
    const p = parts.get(`${route}\0${f}`);
    if (p) { raw += p.size; gz += p.gz; }
  }
  return { raw, gzip: gz };
};

const summary = {};
const initialByRoute = new Map();
for (const route of routes) {
  const g = groups.get(route) ?? { bootstrap: new Set(), render_dependent: new Set(), async: new Set() };
  const initial = new Set([...g.bootstrap, ...g.render_dependent]);
  const asyncOnly = new Set([...g.async].filter((f) => !initial.has(f)));
  const js = sum(route, initial, ".js");
  const kind = route.startsWith("/api/") || ["/sitemap.xml", "/robots.txt", "/media/[...key]", "/payment/return"].includes(route) && js.raw === 0
    ? "route-handler"
    : js.raw === 0 ? "no-client-js" : "page";
  const pkgs = new Map();
  for (const f of initial) {
    if (!f.endsWith(".js")) continue;
    const p = parts.get(`${route}\0${f}`);
    if (p) for (const [k, v] of p.pkgs) pkgs.set(k, (pkgs.get(k) ?? 0) + v);
  }
  initialByRoute.set(route, [...initial].filter((f) => f.endsWith(".js")));
  summary[route] = {
    kind,
    analyzer: {
      initialJs: js,
      asyncJs: sum(route, asyncOnly, ".js"),
      initialCss: sum(route, initial, ".css"),
      initialJsChunks: [...initial].filter((f) => f.endsWith(".js")).map(short).sort(),
      asyncJsChunks: [...asyncOnly].filter((f) => f.endsWith(".js")).map(short).sort(),
      initialJsByPackage: Object.fromEntries([...pkgs].sort((a, b) => b[1] - a[1])),
    },
  };
}

// shared chunks across page routes (by analyzer chunk name)
const pageRoutes = routes.filter((r) => summary[r].kind === "page");
const chunkUse = new Map();
for (const r of pageRoutes) for (const f of initialByRoute.get(r)) chunkUse.set(f, (chunkUse.get(f) ?? 0) + 1);
const chunkSize = (f) => {
  for (const r of pageRoutes) { const p = parts.get(`${r}\0${f}`); if (p) return { raw: p.size, gzip: p.gz }; }
  return { raw: 0, gzip: 0 };
};
const sharedChunks = [...chunkUse]
  .filter(([, n]) => n >= 2)
  .sort((a, b) => b[1] - a[1] || chunkSize(b[0]).raw - chunkSize(a[0]).raw)
  .map(([f, n]) => ({ chunk: short(f), routes: n, ...chunkSize(f) }));
const sharedByAll = sharedChunks.filter((c) => c.routes === pageRoutes.length);

// ---- 2. optional: measured sizes from a real `next build` --------------------
let measured = null;
if (args["build-dir"]) {
  const dir = args["build-dir"];
  const bm = JSON.parse(fs.readFileSync(path.join(dir, "build-manifest.json"), "utf8"));
  const gzCache = new Map();
  const fileSize = (rel) => {
    if (gzCache.has(rel)) return gzCache.get(rel);
    const buf = fs.readFileSync(path.join(dir, rel));
    const v = { raw: buf.length, gzip: zlib.gzipSync(buf, { level: 6 }).length };
    gzCache.set(rel, v);
    return v;
  };
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "page_client-reference-manifest.js" ? [path.join(d, e.name)] : []);
  const perRoute = {};
  for (const file of walk(path.join(dir, "server/app"))) {
    const ctx = { globalThis: {} };
    ctx.globalThis.__RSC_MANIFEST = {};
    vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx);
    const [key, m] = Object.entries(ctx.globalThis.__RSC_MANIFEST)[0];
    const route = ("/" + key.replace(/\/page$/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/")).replace(/^\/$/, "/");
    const js = new Set(bm.rootMainFiles);
    for (const list of Object.values(m.entryJSFiles ?? {})) for (const f of list) js.add(f);
    const css = new Set();
    for (const list of Object.values(m.entryCSSFiles ?? {})) for (const f of list) if (!f.inlined) css.add(f.path);
    const tot = (set) => [...set].reduce((a, f) => { const s = fileSize(f); return { raw: a.raw + s.raw, gzip: a.gzip + s.gzip }; }, { raw: 0, gzip: 0 });
    perRoute[route] = { initialJs: tot(js), initialCss: tot(css), jsFiles: js.size };
  }
  measured = {
    method: "next build output: rootMainFiles + entryJSFiles of every segment in page_client-reference-manifest.js; gzip = zlib level 6 per file",
    rootMainFiles: bm.rootMainFiles.map((f) => ({ file: f, ...fileSize(f) })),
    polyfillFiles: bm.polyfillFiles.map((f) => ({ file: f, ...fileSize(f), note: "nomodule, not loaded by modern browsers" })),
    routes: Object.fromEntries(Object.entries(perRoute).sort()),
  };
}

// ---- 3. write ---------------------------------------------------------------
let snapshotMeta = null;
if (args["snapshot-dir"]) {
  try { snapshotMeta = JSON.parse(fs.readFileSync(path.join(args["snapshot-dir"], "metadata.json"), "utf8")); } catch { /* optional */ }
}
const out = {
  schema: 1,
  capturedWith: "npx next analyze --output --snapshot <name> && npx next analyze export --snapshot <name>",
  snapshot: snapshotMeta ?? { name: meta?.snapshot_name },
  units: "bytes; analyzer gzip = sum of per-module compressed_size reported by the analyzer (estimate)",
  totals: {
    routes: routes.length,
    pageRoutes: pageRoutes.length,
    maxInitialJs: pageRoutes.reduce((m, r) => (summary[r].analyzer.initialJs.raw > m.raw ? { route: r, ...summary[r].analyzer.initialJs } : m), { raw: 0 }),
  },
  sharedChunks: { byAllPageRoutes: sharedByAll, byTwoOrMore: sharedChunks },
  routes: summary,
  measured,
};
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${args.out}: ${routes.length} routes (${pageRoutes.length} with client JS), ${sharedChunks.length} shared chunks`);
