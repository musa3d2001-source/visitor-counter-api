import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParseSpeeds, PDFDocument, PDFParser, PDFStreamWriter } from "pdf-lib";
import { deadlineIn, PdfUnusableError, saveWithDeadline, StampDeadlineError, watermarkPdf, type Deadline } from "@/server/access/pdf";
import { exceedsStampLimit, STAMP_MAX_BYTES, STAMP_MAX_PAGES } from "@/lib/pdf-limits";

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, "../fixtures/pdf", name)));
const LINES = { primary: "buyer@example.com  ORD-1", secondary: "Licensed to buyer@example.com" };

async function blankPages(n: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([100, 100]);
  return doc.save();
}

afterEach(() => vi.restoreAllMocks());

describe("مهلة الختم من داخل حلقة pdf-lib", () => {
  it("the pinned pdf-lib still has the hook the deadline relies on", async () => {
    const parser = PDFParser.forBytesWithOptions(fixture("plain.pdf"), ParseSpeeds.Fast, false, false) as unknown as { shouldWaitForTick: unknown };
    expect(typeof parser.shouldWaitForTick).toBe("function");
    const doc = await PDFDocument.load(fixture("plain.pdf"));
    const writer = PDFStreamWriter.forContext(doc.context, 500) as unknown as { shouldWaitForTick: unknown };
    expect(typeof writer.shouldWaitForTick).toBe("function");
  });

  it("saving through the deadline writes exactly what pdf-lib's save writes", async () => {
    const options = { updateMetadata: false, ignoreEncryption: true };
    const expected = await (await PDFDocument.load(fixture("plain.pdf"), options)).save({ objectsPerTick: 500 });
    const actual = await saveWithDeadline(await PDFDocument.load(fixture("plain.pdf"), options), deadlineIn(60_000), 500);
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
  });

  it("a stamped file is produced within budget", async () => {
    await expect(watermarkPdf(fixture("plain.pdf"), LINES, 60_000)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("parsing stops at the first object after the deadline, instead of finishing in the background", async () => {
    const bytes = await blankPages(300);
    const parsed = vi.spyOn(PDFParser.prototype as unknown as { parseIndirectObject: () => Promise<unknown> }, "parseIndirectObject");
    await expect(watermarkPdf(bytes, LINES, -1)).rejects.toBeInstanceOf(StampDeadlineError);
    const calls = parsed.mock.calls.length;
    expect(calls).toBeLessThan(5);
    await new Promise((r) => setTimeout(r, 30));
    expect(parsed.mock.calls.length).toBe(calls);
  });

  it("writing stops too: no object is written after the deadline fires", async () => {
    const doc = await PDFDocument.load(await blankPages(300));
    let checks = 0;
    const expired: Deadline = {
      at: 0,
      check() {
        checks++;
        if (checks > 3) throw new StampDeadlineError();
      },
    };
    await expect(saveWithDeadline(doc, expired, 1)).rejects.toBeInstanceOf(StampDeadlineError);
    const stoppedAt = checks;
    await new Promise((r) => setTimeout(r, 30));
    expect(checks).toBe(stoppedAt);
    expect(stoppedAt).toBeLessThan(10);
  });

  it("a deadline error still counts as a too-complex file for an unchecked upload", () => {
    const err = new StampDeadlineError();
    expect(err).toBeInstanceOf(PdfUnusableError);
    expect(err.problem).toBe("too_complex");
  });
});

describe("حد الختم", () => {
  it("is derived from the function's memory", () => {
    expect(STAMP_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(STAMP_MAX_PAGES).toBe(1500);
  });

  it.each([
    [STAMP_MAX_BYTES, STAMP_MAX_PAGES, false],
    [STAMP_MAX_BYTES + 1, 10, true],
    [1000, STAMP_MAX_PAGES + 1, true],
    [1000, null, false],
  ])("size %i with %s pages over the limit: %s", (sizeBytes, pageCount, over) => {
    expect(exceedsStampLimit({ sizeBytes, pageCount })).toBe(over);
  });

  it("a file over the page limit is refused by the stamp itself, never passed on", async () => {
    await expect(watermarkPdf(await blankPages(STAMP_MAX_PAGES + 1), LINES)).rejects.toMatchObject({ name: "PdfUnusableError", problem: "over_limit" });
  });
});
