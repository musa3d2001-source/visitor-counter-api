import { beforeAll, describe, expect, it } from "vitest";
import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import { extractPreview, inspectPdf, watermarkPdf } from "@/server/access/pdf";

/**
 * الموضع يُقاس بمحرك القارئ نفسه: pdf.js يحول إحداثيات النص إلى ما يراه الطالب،
 * فلا يكفي أن يقول pdf-lib إن النص كُتب.
 */
type TextItem = { str: string; transform: number[] };
type Viewport = { width: number; height: number; convertToViewportPoint(x: number, y: number): [number, number] };
type Loaded = { numPages: number; getPage(n: number): Promise<{ rotate: number; view: number[]; getViewport(o: { scale: number }): Viewport; getTextContent(): Promise<{ items: TextItem[] }> }> };
let pdfjs: { getDocument(o: object): { promise: Promise<Loaded> } };

beforeAll(async () => {
  // @ts-expect-error العامل بلا تعريفات أنواع
  (globalThis as Record<string, unknown>).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof pdfjs;
});

type Box = [number, number, number, number];

async function pageWith(media: Box, opts: { crop?: Box; rotate?: number } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([media[2] - media[0], media[3] - media[1]]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("content", { x: media[0] + 40, y: media[1] + 40, size: 12, font });
  page.setMediaBox(media[0], media[1], media[2] - media[0], media[3] - media[1]);
  if (opts.crop) page.setCropBox(opts.crop[0], opts.crop[1], opts.crop[2] - opts.crop[0], opts.crop[3] - opts.crop[1]);
  if (opts.rotate) page.setRotation(degrees(opts.rotate));
  return doc.save();
}

async function stampsSeen(bytes: Uint8Array, needle: string) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const { items } = await page.getTextContent();
  const stamps = items.filter((i) => i.str.includes(needle));
  return {
    viewport,
    rotate: page.rotate,
    stamps: stamps.map((s) => {
      const [x, y] = viewport.convertToViewportPoint(s.transform[4], s.transform[5]);
      const [ax, ay] = viewport.convertToViewportPoint(s.transform[4] + s.transform[0], s.transform[5] + s.transform[1]);
      return { x, y, dx: ax - x, dy: ay - y };
    }),
  };
}

const LINES = { primary: "student@example.com  ORD-000123", secondary: "Licensed to student@example.com" };

const CASES: [string, Box, { crop?: Box; rotate?: number }][] = [
  ["a media box starting at 0", [0, 0, 400, 500], {}],
  ["a media box far from the origin", [1000, 2000, 1400, 2500], {}],
  ["a media box with a negative origin", [-300, -400, 100, 100], {}],
  ["a crop box inside the media box", [0, 0, 800, 1000], { crop: [300, 400, 700, 900] }],
  ["a crop box spilling outside the media box", [100, 100, 500, 600], { crop: [50, 50, 300, 400] }],
  ["rotated 90", [0, 0, 400, 500], { rotate: 90 }],
  ["rotated 180", [0, 0, 400, 500], { rotate: 180 }],
  ["rotated 270", [0, 0, 400, 500], { rotate: 270 }],
  ["offset and rotated 90", [1000, 2000, 1400, 2500], { rotate: 90 }],
  ["cropped, offset and rotated 270", [500, 500, 1300, 1500], { crop: [700, 800, 1200, 1400], rotate: 270 }],
  ["rotated by a negative angle", [0, 0, 400, 500], { rotate: -90 }],
];

describe.each(CASES)("الختم على صفحة: %s", (_name, media, opts) => {
  it("every stamp lands inside what the student sees", async () => {
    const seen = await stampsSeen(await watermarkPdf(await pageWith(media, opts), LINES), "student@example.com");
    expect(seen.stamps).toHaveLength(3);
    for (const s of seen.stamps) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(seen.viewport.width);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(seen.viewport.height);
    }
  });

  it("the footer sits at the bottom of the page as the student sees it, and reads left to right", async () => {
    const seen = await stampsSeen(await watermarkPdf(await pageWith(media, opts), LINES), "Licensed to");
    expect(seen.stamps).toHaveLength(1);
    const [footer] = seen.stamps;
    expect(seen.viewport.height - footer.y).toBeCloseTo(10, 0);
    expect(footer.x).toBeCloseTo(18, 0);
    expect(footer.dx).toBeGreaterThan(0);
    expect(Math.abs(footer.dy)).toBeLessThan(0.01);
  });

  it("the free preview label is on the page too", async () => {
    const doc = await PDFDocument.load(await pageWith(media, opts));
    const page = doc.getPage(0);
    for (let i = 0; i < 12; i++) {
      const added = doc.addPage([page.getWidth(), page.getHeight()]);
      added.setMediaBox(page.getMediaBox().x, page.getMediaBox().y, page.getMediaBox().width, page.getMediaBox().height);
    }
    const preview = await extractPreview(await doc.save(), 1);
    const seen = await stampsSeen(preview!.bytes, "FREE PREVIEW");
    expect(seen.stamps).toHaveLength(1);
    const [label] = seen.stamps;
    expect(label.x).toBeGreaterThanOrEqual(0);
    expect(label.x).toBeLessThanOrEqual(seen.viewport.width);
    expect(label.y).toBeGreaterThanOrEqual(0);
    expect(label.y).toBeLessThanOrEqual(seen.viewport.height);
  });
});

describe("صفحة لا يتسع جزؤها الظاهر للختم", () => {
  const tiny = () => pageWith([0, 0, 10, 8]);

  it("is refused at upload, so nothing unstamped can be sold", async () => {
    await expect(inspectPdf(await tiny())).resolves.toEqual({ ok: false, problem: "corrupt" });
  });

  it("a crop that leaves a sliver is refused too", async () => {
    await expect(inspectPdf(await pageWith([0, 0, 400, 500], { crop: [100, 100, 110, 108] }))).resolves.toEqual({ ok: false, problem: "corrupt" });
  });

  it("is refused at delivery as well: a stamp outside the page is never written silently", async () => {
    await expect(watermarkPdf(await tiny(), LINES)).rejects.toMatchObject({ name: "PdfUnusableError", problem: "corrupt" });
  });

  it("an ordinary offset page passes the upload check", async () => {
    await expect(inspectPdf(await pageWith([1000, 2000, 1400, 2500]))).resolves.toEqual({ ok: true, pageCount: 1 });
  });
});

