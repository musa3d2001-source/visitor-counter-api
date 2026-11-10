import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as engine from "@/server/access/pdf-reader-engine";
import { DELIVERY_STAMP_BUDGET_MS, extractPreview, inspectPdf, PdfUnusableError, TRIAL_STAMP_BUDGET_MS, watermarkPdf } from "@/server/access/pdf";

/**
 * عينات حقيقية صُنعت بـ PyMuPDF (تشفير RC4 وAES بكلمة مالك أو مستخدم، قطع، عبث بالبايتات، ومحتوى متنكر).
 * تمر بمسار الختم الفعلي، ثم تُفتح نسخته بمحرك القارئ نفسه الذي يستخدمه الطالب.
 */
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, "../fixtures/pdf", name)));
const LINES = { primary: "buyer@example.com  ORD-1", secondary: "Licensed to buyer@example.com" };

async function makePdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  return doc.save();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("فحص PDF قبل قبوله", () => {
  it("accepts a clean PDF and reports its real page count", async () => {
    await expect(inspectPdf(fixture("plain.pdf"))).resolves.toEqual({ ok: true, pageCount: 6 });
  });

  it.each(["owner_rc4_128.pdf", "owner_aes_128.pdf", "owner_aes_256.pdf", "owner_aes_256_objstm.pdf", "user_rc4_128.pdf", "user_aes_256.pdf"])("%s is rejected as protected", async (name) => {
    await expect(inspectPdf(fixture(name))).resolves.toEqual({ ok: false, problem: "encrypted" });
  });

  it.each(["trunc_half.pdf", "trunc_tail.pdf", "flipped.pdf", "garbage_after_header.pdf", "pdf_prefix_html.pdf"])("%s is rejected as damaged", async (name) => {
    await expect(inspectPdf(fixture(name))).resolves.toEqual({ ok: false, problem: "corrupt" });
  });

  it("rejects a file that only claims to be a PDF", async () => {
    await expect(inspectPdf(fixture("html_disguised.pdf"))).resolves.toEqual({ ok: false, problem: "not_pdf" });
    await expect(inspectPdf(new Uint8Array())).resolves.toEqual({ ok: false, problem: "not_pdf" });
  });

  it("flipped.pdf proves why pdf-lib alone is not enough: it stamps it happily, and the reader refuses", async () => {
    await expect(watermarkPdf(fixture("flipped.pdf"), LINES)).resolves.toBeInstanceOf(Uint8Array);
    await expect(engine.openInReader(fixture("flipped.pdf"))).resolves.toEqual({ status: "failed", problem: "corrupt" });
  });

  it("a damaged original is refused even when the rewritten copy would open, its content may already be lost", async () => {
    vi.spyOn(engine, "openInReader").mockResolvedValueOnce({ status: "failed", problem: "corrupt" }).mockResolvedValue({ status: "ok", pages: 6, encrypted: false });
    await expect(inspectPdf(fixture("plain.pdf"))).resolves.toEqual({ ok: false, problem: "corrupt" });
  });

  it("encryption the reader reports is final, even when the editing library sees none", async () => {
    vi.spyOn(engine, "openInReader").mockResolvedValue({ status: "ok", pages: 6, encrypted: true });
    await expect(inspectPdf(fixture("plain.pdf"))).resolves.toEqual({ ok: false, problem: "encrypted" });
  });

  it("if the stamped copy loses pages it is rejected", async () => {
    vi.spyOn(engine, "openInReader").mockResolvedValueOnce({ status: "ok", pages: 6, encrypted: false }).mockResolvedValueOnce({ status: "ok", pages: 5, encrypted: false });
    await expect(inspectPdf(fixture("plain.pdf"))).resolves.toEqual({ ok: false, problem: "corrupt" });
  });

  it("a stamped copy the reader cannot open is refused, the buyer would get exactly that copy", async () => {
    vi.spyOn(engine, "openInReader").mockResolvedValueOnce({ status: "ok", pages: 6, encrypted: false }).mockResolvedValueOnce({ status: "failed", problem: "corrupt" });
    await expect(inspectPdf(fixture("plain.pdf"))).resolves.toEqual({ ok: false, problem: "corrupt" });
  });

  it("a damaged page tree leaves no stray rejection in the server process", async () => {
    const strays: unknown[] = [];
    const listener = (reason: unknown) => strays.push(reason);
    process.on("unhandledRejection", listener);
    try {
      await expect(engine.openInReader(fixture("flipped.pdf"))).resolves.toEqual({ status: "failed", problem: "corrupt" });
      await new Promise((r) => setTimeout(r, 100));
    } finally {
      process.off("unhandledRejection", listener);
    }
    expect(strays).toEqual([]);
  });

  it("a reader that gives up on a file is a refusal with its own reason", async () => {
    vi.spyOn(engine, "openInReader").mockResolvedValue({ status: "failed", problem: "too_complex" });
    await expect(inspectPdf(fixture("plain.pdf"))).resolves.toEqual({ ok: false, problem: "too_complex" });
  });

  it("if the reader engine itself cannot load, the editing checks still hold and uploads keep working", async () => {
    vi.spyOn(engine, "openInReader").mockResolvedValue({ status: "unavailable" });
    await expect(inspectPdf(fixture("plain.pdf"))).resolves.toEqual({ ok: true, pageCount: 6 });
    await expect(inspectPdf(fixture("owner_rc4_128.pdf"))).resolves.toEqual({ ok: false, problem: "encrypted" });
    await expect(inspectPdf(fixture("user_aes_256.pdf"))).resolves.toEqual({ ok: false, problem: "encrypted" });
  });
});

describe("التسليم لا يصنع نسخة تالفة", () => {
  it.each(["owner_rc4_128.pdf", "owner_aes_256.pdf", "user_rc4_128.pdf"])("%s is refused instead of stamped into a broken copy", async (name) => {
    await expect(watermarkPdf(fixture(name), LINES)).rejects.toMatchObject({ name: "PdfUnusableError", problem: "encrypted" });
  });

  it("garbage is reported as damaged, not as a server fault", async () => {
    await expect(watermarkPdf(fixture("garbage_after_header.pdf"), LINES)).rejects.toBeInstanceOf(PdfUnusableError);
  });

  it("a clean file is stamped and stays readable", async () => {
    const out = await watermarkPdf(fixture("plain.pdf"), LINES);
    await expect(engine.openInReader(out)).resolves.toEqual({ status: "ok", pages: 6, encrypted: false });
  });
});

describe("مهلة الختم", () => {
  /** الساعة تقفز مع كل قراءة: تجاوز المهلة يقع داخل حلقة pdf-lib نفسها، وهي التي يجب أن تتوقف */
  const clockRacesPast = (budgetMs: number) => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => (now += budgetMs + 1));
  };

  it("the upload refuses a file that cannot be stamped in the trial budget", async () => {
    vi.spyOn(engine, "openInReader").mockResolvedValue({ status: "ok", pages: 6, encrypted: false });
    clockRacesPast(TRIAL_STAMP_BUDGET_MS);
    await expect(inspectPdf(fixture("plain.pdf"))).resolves.toEqual({ ok: false, problem: "too_complex" });
  });

  it("delivery stops at its budget with an honest error instead of being cut by the host", async () => {
    clockRacesPast(DELIVERY_STAMP_BUDGET_MS);
    await expect(watermarkPdf(fixture("plain.pdf"), LINES)).rejects.toMatchObject({ name: "StampDeadlineError", problem: "too_complex" });
  });
});

describe("استخراج المعاينة يطبق القاعدة على الملف الفعلي", () => {
  it.each([
    [5, 3, 1],
    [10, 30, 2],
    [100, 30, 10],
    [100, 3, 3],
    [20, 0, 1],
  ])("%i page file asked for %i pages yields %i", async (total, asked, expected) => {
    const result = await extractPreview(await makePdf(total), asked);
    expect(result?.pageCount).toBe(expected);
    expect((await PDFDocument.load(result!.bytes)).getPageCount()).toBe(expected);
  });

  it.each([1, 2, 4])("a %i page file gets no preview at all", async (total) => {
    await expect(extractPreview(await makePdf(total), 3)).resolves.toBeNull();
  });

  it("will not build a preview from a protected file", async () => {
    await expect(extractPreview(fixture("owner_aes_128.pdf"), 1)).rejects.toMatchObject({ problem: "encrypted" });
  });
});
