import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDF_READER_ENGINE, PDF_READER_ENGINE_FILE, PDF_READER_RECIPE, PDF_READER_WORKER, PDF_READER_WORKER_FILE, PDFJS_VERSION } from "@/lib/reader-assets";

/**
 * القارئ يفتح الملفات على أجهزة الأسر الفعلية (القرار F27، البند R018): iOS 15.4 فما بعد، و Chrome و Android WebView 110 فما بعد.
 * هذا الاختبار يفشل إن شُحن للمتصفح محرك أو عامل يستدعي دالة أحدث من هذا الحد بلا بديل، أو يحمل صياغة لا يفهمها.
 */
const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const shipped = join(root, "public/pdfjs", PDFJS_VERSION);
const ENGINE = join(shipped, PDF_READER_ENGINE_FILE);
const WORKER = join(shipped, PDF_READER_WORKER_FILE);
const PROBE = join(root, "tests/helpers/reader-floor-probe.mjs");
const ASSETS = join(root, "node_modules/pdfjs-dist");

/** دوال لا يعرفها الحد: الحذف يجب أن يشملها كلها، وإلا فالاختبار لا يقيس ما يقول إنه يقيسه */
const MUST_BE_ABSENT = [
  "Map#getOrInsertComputed",
  "Math.sumPrecise",
  "Promise.try",
  "Promise.withResolvers",
  "Array.fromAsync",
  "ArrayBuffer#transferToFixedLength",
  "Uint8Array#toHex",
  "Set#union",
  "Iterator#map",
  "Array#toSorted",
  "URL.parse",
  "Object.groupBy",
];

let dir = "";
let samplePdf = "";

beforeAll(async () => {
  if (![ENGINE, WORKER].every(existsSync)) execFileSync(process.execPath, [join(root, "scripts/copy-pdf-worker.mjs")], { stdio: "ignore" });
  dir = mkdtempSync(join(tmpdir(), "reader-floor-"));
  // نص بخط قياسي (يُبدَّل بخط TrueType من الحزمة: مسار جداول glyf)، ومستطيلات ومسارات منحنية متكررة (ذاكرة المسارات في الرسم)
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Reader floor check page ${p + 1}`, { x: 50, y: 780, size: 22, font, color: rgb(0.1, 0.2, 0.5) });
    for (let i = 0; i < 12; i++) page.drawText(`Line ${i} of sample text 0123456789`, { x: 50, y: 740 - i * 18, size: 12, font });
    for (let i = 0; i < 20; i++) page.drawRectangle({ x: 50 + (i % 10) * 45, y: 300 - Math.floor(i / 10) * 45, width: 30, height: 30, borderColor: rgb(0.8, 0.1, 0.1), borderWidth: 2, color: rgb(0.9, 0.9, 0.2) });
    for (const x of [300, 420]) page.drawSvgPath("M 0 0 L 100 0 L 100 100 Z M 20 20 C 40 80 60 80 80 20", { x, y: 600, color: rgb(0.1, 0.6, 0.4) });
    page.drawEllipse({ x: 300, y: 450, xScale: 60, yScale: 30, color: rgb(0.2, 0.3, 0.9), opacity: 0.6 });
  }
  samplePdf = join(dir, "sample.pdf");
  writeFileSync(samplePdf, await doc.save());
});
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

type Probe = { ok: boolean; absent: string[]; stuck: string[]; installed?: string[]; pages?: number; painted?: number; text?: string[]; error?: string };
function probe(engine: string, worker: string): Probe {
  const run = spawnSync(process.execPath, [PROBE, engine, worker, ASSETS, samplePdf], { cwd: root, encoding: "utf8", timeout: 60_000 });
  const line = run.stdout.trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(line) as Probe;
  } catch {
    return { ok: false, absent: [], stuck: [], error: `no result (exit ${run.status}): ${run.stderr.slice(0, 400)}` };
  }
}

/** صياغة أحدث من الحد، يجدها محلل TypeScript في الملف كما يُخدم */
function syntaxNewerThanFloor(file: string): string[] {
  const code = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found: string[] = [];
  const diags = (sf as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics;
  if (diags.length) found.push(`${diags.length} parse errors`);
  const pattern = (p: string, flags: string, where: string) => {
    if (/\(\?<[=!]/.test(p)) found.push(`regex lookbehind (Safari 16.4) ${where}`);
    if (flags.includes("v")) found.push(`regex v flag (Safari 17) ${where}`);
    if (/\(\?[ims]*-?[ims]+:/.test(p)) found.push(`regex modifiers ${where}`);
    const names = [...p.matchAll(/\(\?<([A-Za-z_$][\w$]*)>/g)].map((m) => m[1]);
    if (new Set(names).size !== names.length) found.push(`duplicate named groups (Safari 17) ${where}`);
  };
  const at = (n: ts.Node) => `at ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (node: ts.Node) => {
    if (ts.isClassStaticBlockDeclaration(node)) found.push(`class static block (Safari 16.4) ${at(node)}`);
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const text = node.getText(sf);
      const end = text.lastIndexOf("/");
      pattern(text.slice(1, end), text.slice(end + 1), at(node));
    }
    if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp" && node.arguments?.length) {
      const [p, f] = node.arguments;
      if (ts.isStringLiteralLike(p)) pattern(p.text, f && ts.isStringLiteralLike(f) ? f.text : "", at(node));
    }
    if (ts.isVariableDeclarationList(node)) {
      const k = node.flags & ts.NodeFlags.BlockScoped;
      if (k === ts.NodeFlags.Using || k === ts.NodeFlags.AwaitUsing) found.push(`using declaration ${at(node)}`);
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.attributes) found.push(`import attributes ${at(node)}`);
    if (ts.canHaveDecorators(node) && ts.getDecorators(node)?.length) found.push(`decorator ${at(node)}`);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("the reader's engine and worker on the oldest supported phones (F27, R018)", () => {
  it("are built from pdf.js legacy of the installed version, under the versioned path, with names the script and the reader agree on", () => {
    const script = read("scripts/copy-pdf-worker.mjs");
    expect(script).toContain(`const RECIPE = "${PDF_READER_RECIPE}";`);
    expect(script).toContain('buildForFloor(ts, "legacy/build/pdf.min.mjs", join(dest, ENGINE_FILE))');
    expect(script).toContain('buildForFloor(ts, "legacy/build/pdf.worker.min.mjs", join(dest, WORKER_FILE))');
    expect(script).not.toMatch(/"build\/pdf/);
    expect(PDF_READER_ENGINE).toBe(`/pdfjs/${PDFJS_VERSION}/pdf.${PDF_READER_RECIPE}.min.mjs`);
    expect(PDF_READER_WORKER).toBe(`/pdfjs/${PDFJS_VERSION}/pdf.worker.${PDF_READER_RECIPE}.min.mjs`);
    for (const f of [ENGINE, WORKER]) {
      expect(readFileSync(f, "utf8").startsWith(`/* Darb reader floor prelude (${PDF_READER_RECIPE})`), f).toBe(true);
      expect(readFileSync(f, "utf8")).toContain(`pdfjsVersion = ${PDFJS_VERSION}`);
    }
  });

  it("the page loads the engine from that file and never bundles the modern build", () => {
    const reader = read("src/components/reader/pdf-reader.tsx");
    expect(reader).toContain("import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)");
    expect(reader).toContain("const url = engineFailures ? `${PDF_READER_ENGINE}?retry=${engineFailures}` : PDF_READER_ENGINE;");
    expect(reader).toContain("GlobalWorkerOptions.workerSrc = PDF_READER_WORKER");
    expect(reader).toContain("worker: readyWorker");
    // في كود المتصفح كله: pdfjs-dist للأنواع فقط
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|mjs|js)$/.test(e)) {
          const text = readFileSync(p, "utf8");
          if (!text.includes('"use client"')) continue;
          if (/(?<!typeof\s+)import\s*\(\s*["']pdfjs-dist/.test(text) || /^import\s+(?!type\b)[^;]*from\s+["']pdfjs-dist(?!\/package\.json)/m.test(text)) offenders.push(relative(root, p));
        }
      }
    };
    walk(join(root, "src"));
    expect(offenders).toEqual([]);
  });

  it("carry no syntax newer than iOS 15.4 and Chrome 110", () => {
    expect(syntaxNewerThanFloor(ENGINE)).toEqual([]);
    expect(syntaxNewerThanFloor(WORKER)).toEqual([]);
  });

  it("the check sees what it looks for: pdf.js legacy as published still has a class static block", () => {
    const legacy = syntaxNewerThanFloor(join(ASSETS, "legacy/build/pdf.min.mjs"));
    expect(legacy.some((f) => f.startsWith("class static block"))).toBe(true);
  });

  it("open, draw and read a file with every built-in newer than the floor removed", () => {
    const result = probe(ENGINE, WORKER);
    expect(result.error).toBeUndefined();
    for (const label of MUST_BE_ABSENT) expect(result.absent, label).toContain(label);
    expect(result.ok).toBe(true);
    expect(result.pages).toBe(2);
    expect(result.text!.join(" ")).toContain("Reader floor check page 2");
    expect(result.painted).toBeGreaterThan(20_000);
    // ما يستدعيه pdf.js من الأحدث صار موجودًا من مقدمة الملف أو من بدائل النسخة القديمة
    for (const label of ["Promise.withResolvers", "ArrayBuffer#transferToFixedLength", "Map#getOrInsertComputed", "Math.sumPrecise", "Promise.try"]) expect(result.installed, label).toContain(label);
  }, 90_000);

  it("the same check fails the modern build that the reader used to ship", () => {
    const result = probe(join(ASSETS, "build/pdf.mjs"), join(ASSETS, "build/pdf.worker.mjs"));
    expect(result.ok).toBe(false);
  }, 90_000);
});
