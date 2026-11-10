import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const IMMUTABLE = "public, max-age=31536000, immutable";

/** أبعاد JPEG من مقطع SOF، بلا مكتبة صور */
function jpegSize(b: Buffer): { width: number; height: number } {
  expect(b.readUInt16BE(0)).toBe(0xffd8);
  let i = 2;
  while (i < b.length) {
    const marker = b.readUInt16BE(i);
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error("no SOF marker");
}

async function ruleFor(path: string) {
  const all = await nextConfig(PHASE_DEVELOPMENT_SERVER).headers!();
  return all.filter((h) => getPathMatch(h.source)(path) !== false).flatMap((h) => h.headers).find((h) => h.key === "Cache-Control")?.value;
}

describe("reader assets and the social image", () => {
  it("caches the versioned reader files for a year and only those", async () => {
    for (const p of ["/pdfjs/6.5.438/pdf.worker.min.mjs", "/pdfjs/6.5.438/cmaps/UniGB-UCS2-H.bcmap", "/pdfjs/7.0.1/wasm/openjpeg.wasm", "/brand/v2/og.jpg"]) {
      expect(await ruleFor(p), p).toBe(IMMUTABLE);
    }
    // مسار بلا إصدار لا يأخذ سنة، وإلا فإن تغيير الملف لا يصل إلى من خزّنه
    for (const p of ["/pdfjs/pdf.worker.min.mjs", "/pdfjs/latest/pdf.worker.min.mjs", "/brand/og.png", "/brand/logo.svg", "/media/a.png", "/"]) {
      expect(await ruleFor(p), p).toBeUndefined();
    }
  });

  it("loads every reader file from the path of the running pdf.js version", () => {
    const reader = read("src/components/reader/pdf-reader.tsx");
    expect(reader).toContain("`/pdfjs/${pdfjs.version}`");
    expect(reader).toContain("workerSrc = `${assets}/pdf.worker.min.mjs`");
    for (const k of ["cMapUrl", "standardFontDataUrl", "wasmUrl"]) expect(reader, k).toMatch(new RegExp(`${k}: \`\\$\\{assets\\}/`));
    expect(reader).not.toMatch(/"\/pdfjs\//);
  });

  it("copies the reader files into a folder named after the installed pdf.js version", () => {
    const { version } = JSON.parse(read("node_modules/pdfjs-dist/package.json")) as { version: string };
    const script = read("scripts/copy-pdf-worker.mjs");
    expect(script).toMatch(/const dest = join\(base, version\)/);
    expect(existsSync(join(root, "public/pdfjs", version, "pdf.worker.min.mjs")), "run node scripts/copy-pdf-worker.mjs").toBe(true);
  });

  it("points the social card at a versioned image of a sensible size", () => {
    expect(read("src/app/layout.tsx")).toContain('url: "/brand/v2/og.jpg", width: 1200, height: 630');
    const file = join(root, "public/brand/v2/og.jpg");
    expect(statSync(file).size).toBeLessThan(100 * 1024);
    expect(jpegSize(readFileSync(file))).toEqual({ width: 1200, height: 630 });
    expect(existsSync(join(root, "public/brand/og.png"))).toBe(false);
  });
});
