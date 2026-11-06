/**
 * ملخص لقطة Bundle Analyzer لكل مسار: حجم JavaScript الأولي للعميل (خام ومضغوط)، وحجم المقاطع الكسولة،
 * والحزم الخارجية في كل منهما. يُستخدم لمقارنة خط الأساس قبل اللعبة بما بعدها.
 *
 *   npx next analyze --output --snapshot <name>
 *   npx next analyze export --snapshot <name> > graph.jsonl
 *   npx tsx scripts/bundle-report.ts graph.jsonl > summary.json
 *   npx tsx scripts/bundle-report.ts --compare before.json after.json
 *
 * «الأولي» = مخرجات مجموعات bootstrap و render_dependent للمسار؛ «الكسول» = مجموعات async (import()).
 * الأحجام من سجلات part في اللقطة (الحجم المضغوط تقدير المحلل لكل وحدة)، فهي للمقارنة لا للفوترة.
 */
import { readFileSync } from "node:fs";

type Group = { route: string; kind: string; outputs: string[] };
type Part = { route: string; filename: string; source_path: string; size: number; compressed_size: number };
type RouteSummary = { initial: { raw: number; gz: number; packages: string[] }; lazy: { raw: number; gz: number; packages: string[] } };

function pkgOf(sourcePath: string): string | null {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(sourcePath);
  return m ? m[1] : null;
}

function summarize(file: string): Record<string, RouteSummary> {
  const groups: Group[] = [];
  const parts: Part[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith('{"type":"group"') && !line.startsWith('{"type":"part"')) continue;
    const rec = JSON.parse(line);
    if (rec.type === "group") groups.push(rec);
    else if (rec.filename.startsWith("[client-fs]") && rec.filename.endsWith(".js")) parts.push(rec);
  }
  const partsByFile = new Map<string, Part[]>();
  for (const p of parts) {
    const key = `${p.route}|${p.filename}`;
    const list = partsByFile.get(key) ?? [];
    list.push(p);
    partsByFile.set(key, list);
  }
  const out: Record<string, RouteSummary> = {};
  const routes = new Set(groups.map((g) => g.route));
  for (const route of [...routes].sort()) {
    const initialFiles = new Set<string>();
    const lazyFiles = new Set<string>();
    for (const g of groups.filter((x) => x.route === route)) {
      for (const o of g.outputs) {
        if (!o.endsWith(".js")) continue;
        (g.kind === "async" ? lazyFiles : initialFiles).add(o);
      }
    }
    for (const f of initialFiles) lazyFiles.delete(f);
    const measure = (files: Set<string>) => {
      let raw = 0;
      let gz = 0;
      const pkgs = new Set<string>();
      for (const f of files) {
        for (const p of partsByFile.get(`${route}|${f}`) ?? []) {
          raw += p.size;
          gz += p.compressed_size;
          const pkg = pkgOf(p.source_path);
          if (pkg) pkgs.add(pkg);
        }
      }
      return { raw, gz, packages: [...pkgs].sort() };
    };
    out[route] = { initial: measure(initialFiles), lazy: measure(lazyFiles) };
  }
  return out;
}

function compare(beforeFile: string, afterFile: string) {
  const before = JSON.parse(readFileSync(beforeFile, "utf8")) as Record<string, RouteSummary>;
  const after = JSON.parse(readFileSync(afterFile, "utf8")) as Record<string, RouteSummary>;
  const heavy = ["three", "@dimforge/rapier2d-deterministic", "@dimforge/rapier2d-deterministic-compat"];
  let failed = false;
  for (const [route, a] of Object.entries(after)) {
    const b = before[route];
    const leaks = a.initial.packages.filter((p) => heavy.includes(p));
    // المختبر (/lab) للتطوير فقط ويعيد 404 في الإنتاج
    const isGameRoute = route.startsWith("/play/") || route.startsWith("/admin/game") || route.startsWith("/lab/game");
    const lazyLeaks = isGameRoute ? [] : a.lazy.packages.filter((p) => heavy.includes(p));
    if (leaks.length || lazyLeaks.length) {
      failed = true;
      console.log(`LEAK ${route}: ${[...leaks, ...lazyLeaks].join(", ")}`);
    }
    if (b && a.initial.gz > b.initial.gz) {
      const delta = a.initial.gz - b.initial.gz;
      console.log(`${delta > 512 ? "GROW" : "grow"} ${route}: +${delta} B gz (${b.initial.gz} → ${a.initial.gz})`);
      if (delta > 512) failed = true;
    }
  }
  process.exitCode = failed ? 1 : 0;
}

const args = process.argv.slice(2);
if (args[0] === "--compare") compare(args[1], args[2]);
else process.stdout.write(JSON.stringify(summarize(args[0]), null, 2) + "\n");
