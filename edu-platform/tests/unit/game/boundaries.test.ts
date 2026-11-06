/**
 * حدود «شُهُب فرقد» الثابتة (GAME_DESIGN.md §4، ARCHITECTURE.md §1.3 و§1.9 و§2):
 * 1. قائمة Math البيضاء والحتمية في core/ و rules/ و session/.
 * 2. src/game بلا إطار: لا react ولا next ولا server-only ولا كود الموقع (@/server و @/lib ...) ولا المتجر والدفع.
 * 3. الحزمة split لا تُستورد إلا من محمّلات العميل، ولا تبلغ رسم الخادم (SSR والمسارات و src/server).
 * 4. ثنائي WASM واحد في الحزمتين split و -compat، والإصدار مثبّت بدقة.
 *
 * فحص ثابت للمصدر بمحلّل TypeScript (لا regex على النص): التعليقات والنصوص لا تُحسب، والمراجع تُميَّز
 * بنوعها (استيراد ثابت، نوع فقط يُمحى، import() ديناميكي). لا يُستورد three ولا Rapier وقت التشغيل.
 * الملفات تُقرأ كما هي على القرص، فما يكتبه الوكلاء الآخرون في rules/ و session/ يُفحص تلقائيًا.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SRC = join(ROOT, "src");
const CODE_FILE = /\.(ts|tsx|mts|cts)$/;

/** مسار نسبي بشرطات أمامية للرسائل والمقارنة: src/game/core/sim.ts */
function relPath(abs: string): string {
  return relative(ROOT, abs).split(sep).join("/");
}

/** كل ملفات الكود تحت مجلد (نسبي للجذر)، مرتبة. المجلد غير الموجود يعطي قائمة فارغة */
function listCode(dirRel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && CODE_FILE.test(e.name)) out.push(p);
    }
  };
  walk(join(ROOT, dirRel));
  return out.sort();
}

// ───────────────────────── التحليل ─────────────────────────

function parseSource(name: string, text: string): ts.SourceFile {
  const kind = name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false, kind);
}

/** كل ملف يُحلَّل مرة واحدة مهما تكرر في الفحوص (اسمه في الرسائل نسبي للجذر) */
const sources = new Map<string, ts.SourceFile>();
function sourceOf(abs: string): ts.SourceFile {
  let sf = sources.get(abs);
  if (!sf) {
    sf = parseSource(relPath(abs), readFileSync(abs, "utf8"));
    sources.set(abs, sf);
  }
  return sf;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** موضع اسم لا يشير إلى متغير: المفتاح في { key: v }، وعضو النوع أو الصنف، والاسم الأصلي في { key: local } */
function nameOnlyChild(node: ts.Node): ts.Node | undefined {
  if (
    ts.isPropertyAssignment(node) ||
    ts.isPropertySignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isEnumMember(node)
  ) {
    return node.name;
  }
  if (ts.isBindingElement(node)) return node.propertyName;
  if (ts.isQualifiedName(node)) return node.right;
  if (ts.isLabeledStatement(node)) return node.label;
  return undefined;
}

/** الأسماء المعرَّفة محليًا (متغيرات ومعاملات ودوال وأصناف)؛ الاستيراد لا يُحسب: استيراد performance مخالفة بذاته */
function declaredNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const bind = (n: ts.BindingName): void => {
    if (ts.isIdentifier(n)) names.add(n.text);
    else for (const el of n.elements) if (ts.isBindingElement(el)) bind(el.name);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) bind(node.name);
    else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

const MATH_OK = new Set(["abs", "min", "max", "floor", "ceil", "round", "trunc", "sign", "sqrt", "imul", "fround"]);
/** مصادر وقت أو عشوائية خارج المحاكاة */
const NONDETERMINISTIC = new Set(["Date", "performance", "crypto"]);
const GLOBAL_OBJECTS = new Set(["globalThis", "window", "self", "global"]);
const NODE_BUILTINS = new Set(builtinModules);

/**
 * مخالفات الحتمية في ملف واحد بصيغة «ملف:سطر ما وُجد»: Math خارج القائمة البيضاء (ومنه Math.random)،
 * وأي استعمال لـ Math غير «Math.اسم» (مثل const M = Math)، والأُس ** و **=، و Date و performance و crypto،
 * واستيراد وحدات Node (الطبقات نفسها تعمل في المتصفح).
 */
function determinismViolations(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const declared = declaredNames(sf);
  const report = (node: ts.Node, what: string): void => {
    out.push(`${sf.fileName}:${lineOf(sf, node)} ${what}`);
  };
  const isGlobal = (node: ts.Expression, name: string): boolean => ts.isIdentifier(node) && node.text === name && !declared.has(name);

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith("node:") || NODE_BUILTINS.has(spec)) report(node, `import "${spec}"`);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (isGlobal(node.expression, "Math")) {
        if (!MATH_OK.has(name)) report(node, `Math.${name}`);
        return;
      }
      if (ts.isIdentifier(node.expression) && GLOBAL_OBJECTS.has(node.expression.text) && (name === "Math" || NONDETERMINISTIC.has(name))) {
        report(node, `${node.expression.text}.${name}`);
        return;
      }
      // الاسم بعد النقطة خاصية لا متغير: obj.performance مسموح
      visit(node.expression);
      return;
    }
    if (ts.isElementAccessExpression(node) && isGlobal(node.expression, "Math")) {
      report(node, `Math[${node.argumentExpression.getText(sf)}]`);
      return;
    }
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken || node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) {
      report(node.operatorToken, node.operatorToken.getText(sf));
    }
    if (ts.isIdentifier(node)) {
      if (node.text === "Math" && !declared.has("Math")) report(node, "Math (استعمال غير Math.اسم)");
      else if (NONDETERMINISTIC.has(node.text) && !declared.has(node.text)) report(node, node.text);
      return;
    }
    const skip = nameOnlyChild(node);
    ts.forEachChild(node, (child) => {
      if (child !== skip) visit(child);
    });
  };
  visit(sf);
  return out;
}

type RefKind = "static" | "type" | "dynamic" | "require";
/** مرجع وحدة في ملف: ssrFalse = داخل dynamic(() => import(...), { ssr: false }) فلا يدخل رسم SSR */
type Ref = { spec: string; kind: RefKind; line: number; ssrFalse: boolean };

function isSsrFalse(arg: ts.Expression | undefined): boolean {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  return arg.properties.some(
    (p) => ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === "ssr" && p.initializer.kind === ts.SyntaxKind.FalseKeyword,
  );
}

/** كل مراجع الوحدات في ملف بنوعها: import/export from، و import type، و typeof import("…")، و import()، و require() */
function refsOf(sf: ts.SourceFile): Ref[] {
  const out: Ref[] = [];
  const dynamicNames = new Set<string>();
  const add = (node: ts.Node, spec: string, kind: RefKind, ssrFalse = false): void => {
    out.push({ spec, kind, line: lineOf(sf, node), ssrFalse });
  };
  const visit = (node: ts.Node, ssrFalse: boolean): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      // import { type A } يبقى استيرادًا قد يُترك أثرًا؛ «نوع فقط» هو import type وحده
      add(node, spec, node.importClause?.isTypeOnly ? "type" : "static");
      if (spec === "next/dynamic" && node.importClause?.name) dynamicNames.add(node.importClause.name.text);
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text, node.isTypeOnly ? "type" : "static");
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      add(node, node.moduleReference.expression.text, node.isTypeOnly ? "type" : "require");
      return;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      add(node, node.argument.literal.text, "type");
      return;
    }
    if (ts.isCallExpression(node)) {
      const first = node.arguments[0];
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && first && ts.isStringLiteralLike(first)) {
        add(node, first.text, "dynamic", ssrFalse);
        return;
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === "require" && first && ts.isStringLiteralLike(first)) {
        add(node, first.text, "require");
        return;
      }
      if (ts.isIdentifier(node.expression) && dynamicNames.has(node.expression.text) && isSsrFalse(node.arguments[1])) {
        node.arguments.forEach((a, i) => visit(a, ssrFalse || i === 0));
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, ssrFalse));
  };
  visit(sf, false);
  return out;
}

/** مراجع ملف على القرص، تُحسب مرة واحدة لكل الفحوص */
const fileRefs = new Map<string, Ref[]>();
function refsOfFile(abs: string): Ref[] {
  let refs = fileRefs.get(abs);
  if (!refs) {
    refs = refsOf(sourceOf(abs));
    fileRefs.set(abs, refs);
  }
  return refs;
}

/** المسار المطلق لمرجع داخلي (@/ أو نسبي) دون حل الامتداد، أو null لحزمة */
function targetOf(fromAbs: string, spec: string): string | null {
  if (spec.startsWith("@/")) return join(SRC, spec.slice(2));
  if (spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../")) return resolve(dirname(fromAbs), spec);
  return null;
}

const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", ".mts", ".cts", "/index.ts", "/index.tsx"];
function resolveFile(target: string): string | null {
  for (const s of RESOLVE_SUFFIXES) {
    const p = target + s;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** الملف الذي يشير إليه المرجع نسبيًا للجذر بلا امتداد TS (يكفي للمقارنة إن لم يوجد الملف بعد) */
function targetRel(fromAbs: string, spec: string): string | null {
  const target = targetOf(fromAbs, spec);
  if (!target) return null;
  return relPath(resolveFile(target) ?? target).replace(/\.(ts|tsx|mts|cts)$/, "");
}

// ───────────────────────── القواعد ─────────────────────────

const SPLIT_PACKAGES = ["@dimforge/rapier3d-deterministic", "@dimforge/rapier2d-deterministic"];
const DETERMINISTIC_PACKAGES = [...SPLIT_PACKAGES, ...SPLIT_PACKAGES.map((p) => `${p}-compat`)];
const matchesPackage = (spec: string, pkg: string): boolean => spec === pkg || spec.startsWith(`${pkg}/`);
const isSplit = (spec: string): boolean => SPLIT_PACKAGES.some((p) => matchesPackage(spec, p));

/** محمّلات العميل: وحدها تستورد الحزمة split وقت التشغيل */
const CLIENT_LOADERS = ["src/game/physics/rapier-client.ts", "src/game/spike/rapier-loader.ts", "src/game/spike3d/rapier3d-loader.ts"];
/** typeof import("…split") نوع يُمحى عند الترجمة، فيُسمح به هنا أيضًا */
const TYPE_ONLY_SPLIT = ["src/game/physics/types.ts", "src/game/spike/sim.ts", "src/game/spike3d/sim3d.ts"];
const CLIENT_LOADER_TARGETS = new Set(CLIENT_LOADERS.map((f) => f.replace(/\.ts$/, "")));

/** كود التجربة القديم (يُستبدل بكود الإنتاج) خارج قاعدة «بلا إطار» */
const isSpike = (rel: string): boolean => /^src\/game\/spike(3d)?\//.test(rel);
const COMMERCE = /(^|[/@._-])(payments?|commerce|carts?)([/._-]|$)/i;
const FRAMEWORK = /^(react|react-dom|next|server-only|client-only)(\/|$)/;

/** سبب منع مرجع من src/game، أو null إن كان مسموحًا */
function frameworkViolation(fromAbs: string, spec: string): string | null {
  if (FRAMEWORK.test(spec)) return "framework";
  const target = targetOf(fromAbs, spec);
  if (target) {
    const r = relPath(target);
    if (!r.startsWith("src/game/")) return "outside src/game";
    if (isSpike(r)) return "spike code";
  }
  if (COMMERCE.test(spec)) return "commerce/payments";
  return null;
}

/** ملفات Next الخاصة التي تُصيَّر أو تُنفَّذ على الخادم */
const NEXT_SERVER_FILE = /\/(page|layout|template|default|loading|error|global-error|not-found|route|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(ts|tsx)$/;

/** نقاط دخول الخادم: src/server كله، و src/app/api كله، وملفات Next الخاصة، و proxy/middleware/instrumentation */
function serverEntries(): string[] {
  const app = listCode("src/app").filter((f) => {
    const r = relPath(f);
    return r.startsWith("src/app/api/") || NEXT_SERVER_FILE.test(r);
  });
  const extra = ["src/proxy.ts", "src/middleware.ts", "src/instrumentation.ts"].map((r) => join(ROOT, r)).filter((p) => existsSync(p));
  return [...listCode("src/server"), ...app, ...extra];
}

const LAYERS = ["src/game/core", "src/game/rules", "src/game/session"];

// ───────────────────────── 1. الحتمية ─────────────────────────

describe("Math whitelist and determinism — core/ و rules/ و session/", () => {
  it("the scanner flags real uses and ignores comments, strings and property names", () => {
    const fixture = [
      "/** تعليق فيه ** و Math.random() و Date.now() */",
      "// performance.now() و crypto في تعليق",
      'const url = "https://x//y ** Date performance";',
      "type T = { performance: number; Date: string };",
      "const o = { crypto: 1 }; const { performance: perf } = o as never;",
      "const a = Math.sqrt(2) * Math.imul(3, 4) + Math.fround(0.1);",
      "const b = 2 ** 3;",
      "let c = 1; c **= 2;",
      "const d = Math.random();",
      "const e = Math.sin(1) + Math['cos'](1);",
      "const f = Date.now() + performance.now();",
      "const g = globalThis.crypto;",
      "const M = Math;",
      "const re = /[**]/;",
      'import { createHash } from "node:crypto";',
    ].join("\n");
    expect(determinismViolations(parseSource("fixture.ts", fixture))).toEqual([
      "fixture.ts:7 **",
      "fixture.ts:8 **=",
      "fixture.ts:9 Math.random",
      "fixture.ts:10 Math.sin",
      "fixture.ts:10 Math['cos']",
      "fixture.ts:11 Date",
      "fixture.ts:11 performance",
      "fixture.ts:12 globalThis.crypto",
      "fixture.ts:13 Math (استعمال غير Math.اسم)",
      'fixture.ts:15 import "node:crypto"',
    ]);
    // اسم محلي يحجب العام: معامل باسم performance ليس ساعة النظام
    expect(determinismViolations(parseSource("local.ts", "function h(performance: number) { return performance * 2; }"))).toEqual([]);
  });

  it("every existing file uses only the whitelisted Math functions, no **, Date, performance or crypto", () => {
    const files = LAYERS.flatMap(listCode);
    // الفحص ليس فارغًا: النواة موجودة دائمًا (rules و session قد يكونان فارغين أثناء البناء)
    expect(files.map(relPath)).toContain("src/game/core/math.ts");
    expect(files.flatMap((f) => determinismViolations(sourceOf(f)))).toEqual([]);
  });
});

// ───────────────────────── 2. بلا إطار ─────────────────────────

describe("src/game stays framework-free — بلا react ولا next ولا كود الموقع", () => {
  const gameFiles = listCode("src/game").filter((f) => !isSpike(relPath(f)));

  it("imports no react, react-dom, next, server-only, @/server, @/lib (or anything outside src/game), spike code, payments, commerce or cart", () => {
    expect(gameFiles.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const f of gameFiles) {
      for (const ref of refsOfFile(f)) {
        const why = frameworkViolation(f, ref.spec);
        if (why) bad.push(`${relPath(f)}:${ref.line} ${ref.spec} (${why})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("has no .tsx files (JSX pulls in react/jsx-runtime)", () => {
    expect(gameFiles.map(relPath).filter((r) => r.endsWith(".tsx"))).toEqual([]);
  });

  it("the import rule itself catches the forbidden shapes", () => {
    const from = join(SRC, "game/core/x.ts");
    const verdicts = [
      "react",
      "react/jsx-runtime",
      "react-dom/client",
      "next",
      "next/dynamic",
      "server-only",
      "@/server/game/access",
      "@/lib/money",
      "@/components/art",
      "../../server/payments/myfatoorah",
      "@/game/spike3d/sim3d",
      "./commerce-bridge",
      "zod",
      "three",
      "@/game/core/sim",
      "../physics/types",
      "./cartesian",
    ].map((spec) => `${spec} → ${frameworkViolation(from, spec) ?? "ok"}`);
    expect(verdicts).toEqual([
      "react → framework",
      "react/jsx-runtime → framework",
      "react-dom/client → framework",
      "next → framework",
      "next/dynamic → framework",
      "server-only → framework",
      "@/server/game/access → outside src/game",
      "@/lib/money → outside src/game",
      "@/components/art → outside src/game",
      "../../server/payments/myfatoorah → outside src/game",
      "@/game/spike3d/sim3d → spike code",
      "./commerce-bridge → commerce/payments",
      "zod → ok",
      "three → ok",
      "@/game/core/sim → ok",
      "../physics/types → ok",
      "./cartesian → ok",
    ]);
  });
});

// ───────────────────────── 3. الحزمة split ─────────────────────────

describe("split Rapier package boundary — split للعميل و -compat للخادم", () => {
  const allSrc = listCode("src");

  it("the reference scanner tells static, type-only and dynamic (ssr:false) imports apart", () => {
    const fixture = [
      'import dyn from "next/dynamic";',
      'import type { A } from "pkg-type";',
      'import { type B } from "pkg-inline-type";',
      'export * from "pkg-reexport";',
      'export type { C } from "pkg-type-reexport";',
      'type R = typeof import("pkg-typeof");',
      'const Lazy = dyn(() => import("./island").then((m) => m.Island), { ssr: false });',
      'const Eager = dyn(() => import("./ssr-island"));',
      'async function f() { return import("pkg-dynamic"); }',
      'const g = require("pkg-require");',
      '// import("pkg-comment")',
    ].join("\n");
    const refs = refsOf(parseSource("fixture.tsx", fixture)).map((r) => `${r.line} ${r.kind}${r.ssrFalse ? " ssr:false" : ""} ${r.spec}`);
    expect(refs).toEqual([
      "1 static next/dynamic",
      "2 type pkg-type",
      "3 static pkg-inline-type",
      "4 static pkg-reexport",
      "5 type pkg-type-reexport",
      "6 type pkg-typeof",
      "7 dynamic ssr:false ./island",
      "8 dynamic ./ssr-island",
      "9 dynamic pkg-dynamic",
      "10 require pkg-require",
    ]);
  });

  it("is imported at runtime only by the client loaders, and as a type only by the type files", () => {
    const bad: string[] = [];
    const seen: string[] = [];
    for (const f of allSrc) {
      const r = relPath(f);
      for (const ref of refsOfFile(f)) {
        if (!isSplit(ref.spec)) continue;
        seen.push(`${r} ${ref.kind}`);
        const ok = CLIENT_LOADERS.includes(r) || (ref.kind === "type" && TYPE_ONLY_SPLIT.includes(r));
        if (!ok) bad.push(`${r}:${ref.line} ${ref.kind} ${ref.spec}`);
      }
    }
    // الفحص يرى المراجع المعروفة فعلًا (لا ينجح فارغًا إن تعطّل المحلّل)
    expect(seen).toContain("src/game/physics/rapier-client.ts dynamic");
    expect(seen).toContain("src/game/physics/types.ts type");
    expect(bad).toEqual([]);
  });

  it("no non-deterministic Rapier build is imported anywhere in src", () => {
    const bad: string[] = [];
    for (const f of allSrc) {
      for (const ref of refsOfFile(f)) {
        if (ref.spec.startsWith("@dimforge/") && !DETERMINISTIC_PACKAGES.some((p) => matchesPackage(ref.spec, p))) bad.push(`${relPath(f)}:${ref.line} ${ref.spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("src/server, src/app route/page/layout files and proxy never mention the split package or a client loader", () => {
    const entries = serverEntries();
    expect(entries.map(relPath)).toContain("src/app/layout.tsx");
    const bad: string[] = [];
    for (const f of entries) {
      for (const ref of refsOfFile(f)) {
        const target = targetRel(f, ref.spec);
        if (isSplit(ref.spec) || (target !== null && CLIENT_LOADER_TARGETS.has(target))) bad.push(`${relPath(f)}:${ref.line} ${ref.kind} ${ref.spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the SSR graph (static imports and import() outside dynamic(..., { ssr: false })) never reaches the split package", () => {
    const entries = serverEntries();
    const parent = new Map<string, string | null>();
    const queue: string[] = [];
    for (const f of entries) {
      parent.set(f, null);
      queue.push(f);
    }
    const chain = (f: string): string => {
      const names: string[] = [];
      for (let p: string | null = f; p !== null; p = parent.get(p) ?? null) names.unshift(relPath(p));
      return names.join(" → ");
    };
    const bad: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      const f = queue[i];
      for (const ref of refsOfFile(f)) {
        // النوع يُمحى، و ssr:false يُخرج الجزيرة من رسم الخادم
        if (ref.kind === "type" || ref.ssrFalse) continue;
        if (isSplit(ref.spec)) {
          bad.push(`${chain(f)}:${ref.line} ${ref.spec}`);
          continue;
        }
        const target = targetOf(f, ref.spec);
        const file = target ? resolveFile(target) : null;
        if (file && CODE_FILE.test(file) && !parent.has(file)) {
          parent.set(file, f);
          queue.push(file);
        }
      }
    }
    // الرسم تجاوز نقاط الدخول فعلًا (الصفحات تستورد مكوّناتها)
    expect(queue.length).toBeGreaterThan(entries.length);
    expect(bad).toEqual([]);
  });
});

// ───────────────────────── 4. ثنائي WASM ─────────────────────────

type PackageJson = { version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const readJson = (abs: string): PackageJson => JSON.parse(readFileSync(abs, "utf8")) as PackageJson;
const sha256 = (buf: Uint8Array): string => createHash("sha256").update(buf).digest("hex");
const nodeModule = (p: string): string => join(ROOT, "node_modules", p);
const PKG = readJson(join(ROOT, "package.json"));
const pinOf = (name: string): string | undefined => PKG.dependencies?.[name] ?? PKG.devDependencies?.[name];

/** الثنائي المضمَّن base64 في JS الحزمة -compat (هو ما يعمل فعلًا في Node والخادم) */
function embeddedWasm(abs: string): Buffer[] {
  const text = readFileSync(abs, "utf8");
  return [...text.matchAll(/["'`]([A-Za-z0-9+/=]{100000,})["'`]/g)].map((m) => Buffer.from(m[1], "base64"));
}

/** 3D إلزامي؛ 2D (تجربة المرحلة 0) يُفحص ما دام في package.json */
const DIMS = ["3d", ...(pinOf("@dimforge/rapier2d-deterministic") ? ["2d"] : [])];

describe("Rapier WASM binaries — الثنائي واحد في split و -compat", () => {
  const hashes = new Map<string, string>();
  const hashOf = (dim: string): string => {
    let h = hashes.get(dim);
    if (!h) {
      h = sha256(readFileSync(nodeModule(`@dimforge/rapier${dim}-deterministic/rapier_wasm${dim}_bg.wasm`)));
      hashes.set(dim, h);
    }
    return h;
  };

  it.each(DIMS)("rapier%s: the split .wasm equals the -compat .wasm and the base64 embedded in -compat JS", (dim) => {
    const split = hashOf(dim);
    const compatDir = nodeModule(`@dimforge/rapier${dim}-deterministic-compat/dist`);
    expect(sha256(readFileSync(join(compatDir, `rapier_wasm${dim}_bg.wasm`)))).toBe(split);
    for (const js of ["rapier.mjs", "rapier.cjs"]) {
      const embedded = embeddedWasm(join(compatDir, js));
      expect(embedded, js).toHaveLength(1);
      expect(sha256(embedded[0]), js).toBe(split);
    }
  });

  it("package.json pins both 3D packages to exactly 0.21.0, and the installed versions match the pins", () => {
    expect(pinOf("@dimforge/rapier3d-deterministic")).toBe("0.21.0");
    expect(pinOf("@dimforge/rapier3d-deterministic-compat")).toBe("0.21.0");
    for (const name of DETERMINISTIC_PACKAGES) {
      const pin = pinOf(name);
      if (pin === undefined) continue;
      expect(pin, name).toMatch(/^\d+\.\d+\.\d+$/);
      expect(readJson(nodeModule(`${name}/package.json`)).version, name).toBe(pin);
    }
  });

  it("the SHA-256 written in the design docs matches the installed binary", () => {
    const short = (h: string): string => `${h.slice(0, 8)}…${h.slice(-4)}`;
    const design = readFileSync(join(ROOT, "docs/game/GAME_DESIGN.md"), "utf8");
    const architecture = readFileSync(join(ROOT, "docs/game/ARCHITECTURE.md"), "utf8");
    expect(design).toContain(short(hashOf("3d")));
    for (const dim of DIMS) expect(architecture).toContain(short(hashOf(dim)));
  });
});
