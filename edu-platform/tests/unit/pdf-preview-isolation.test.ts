import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFPageLeaf, PDFRawStream, PDFStream, StandardFonts, decodePDFRawStream, type PDFPage } from "pdf-lib";
import * as engine from "@/server/access/pdf-reader-engine";
import { extractPreview, PreviewNotIsolatedError, rebuildCustomPreview } from "@/server/access/pdf";

/**
 * المعاينة ملف عام بلا ختم، فكل ما يتسرب إليها يصل لأي زائر.
 * كل عينة هنا كان نسخها بـ copyPages يحمل صفحات أو صورًا من خارج المعاينة.
 */
const TOTAL = 30;
const ALLOWED = 6;
const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();
const secret = (n: number) => `SECRET-PAGE-${n}-`;

function png(seed: number) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, seed & 255, (seed * 7) & 255, (seed * 13) & 255]))), chunk("IEND", Buffer.alloc(0))]);
}

async function notes(extra: (doc: PDFDocument, pages: PDFPage[]) => void | Promise<void> = () => {}, total = TOTAL) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];
  for (let n = 1; n <= total; n++) {
    const p = doc.addPage([595, 842]);
    p.drawText(secret(n), { x: 50, y: 700, size: 20, font });
    pages.push(p);
  }
  await extra(doc, pages);
  return doc.save();
}

function link(doc: PDFDocument, from: PDFPage, annot: Record<string, unknown>) {
  const ref = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [50, 600, 300, 620], ...annot } as never));
  const existing = from.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (existing) existing.push(ref);
  else from.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

/** ما في الملف فعلًا، لا ما تقوله شجرة صفحاته */
async function contents(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const objects = doc.context.enumerateIndirectObjects().map(([, o]) => o);
  const decoded = objects.filter((o): o is PDFRawStream => o instanceof PDFRawStream).map((o) => {
    try {
      return Buffer.from(decodePDFRawStream(o).decode()).toString("latin1");
    } catch {
      return "";
    }
  });
  const images = objects.filter((o) => o instanceof PDFStream && o.dict.lookup(PDFName.of("Subtype")) === PDFName.of("Image")).length;
  const secrets = Array.from({ length: TOTAL }, (_, i) => i + 1).filter((n) => decoded.some((t) => t.includes(hex(secret(n)))));
  return { treePages: doc.getPageCount(), pageObjects: objects.filter((o) => o instanceof PDFPageLeaf).length, annots: objects.filter((o) => o instanceof PDFDict && o.lookup(PDFName.of("Type")) === PDFName.of("Annot")).length, images, secrets };
}

const firstSix = [1, 2, 3, 4, 5, 6];

describe("المعاينة لا تحمل شيئًا من خارج صفحاتها", () => {
  it("a plain file keeps exactly its pages", async () => {
    const out = await extractPreview(await notes(), ALLOWED);
    expect(await contents(out!.bytes)).toEqual({ treePages: 6, pageObjects: 6, annots: 0, images: 0, secrets: firstSix });
  });

  it("a table of contents linking to later chapters does not pull them in", async () => {
    const out = await extractPreview(await notes((doc, p) => [9, 15, 22, 28].forEach((n) => link(doc, p[0], { Dest: [p[n - 1].ref, PDFName.of("Fit")] }))), ALLOWED);
    expect(await contents(out!.bytes)).toEqual({ treePages: 6, pageObjects: 6, annots: 0, images: 0, secrets: firstSix });
  });

  it("a 'next page' link on every page does not chain through the book", async () => {
    const out = await extractPreview(await notes((doc, p) => p.slice(0, -1).forEach((page, i) => link(doc, page, { Dest: [p[i + 1].ref, PDFName.of("Fit")] }))), ALLOWED);
    expect((await contents(out!.bytes)).secrets).toEqual(firstSix);
  });

  it("a GoTo action does not pull its target in", async () => {
    const out = await extractPreview(await notes((doc, p) => link(doc, p[0], { A: { S: "GoTo", D: [p[19].ref, PDFName.of("Fit")] } })), ALLOWED);
    expect(await contents(out!.bytes)).toEqual({ treePages: 6, pageObjects: 6, annots: 0, images: 0, secrets: firstSix });
  });

  it("article beads, thumbnails and page actions do not survive", async () => {
    const out = await extractPreview(
      await notes((doc, p) => {
        const bead = doc.context.register(doc.context.obj({ Type: "Bead", P: p[25].ref }));
        p[0].node.set(PDFName.of("B"), doc.context.obj([bead]));
        p[0].node.set(PDFName.of("AA"), doc.context.obj({ O: { S: "GoTo", D: [p[12].ref, PDFName.of("Fit")] } }));
        p[1].node.set(PDFName.of("Thumb"), p[27].ref);
      }),
      ALLOWED,
    );
    expect(await contents(out!.bytes)).toEqual({ treePages: 6, pageObjects: 6, annots: 0, images: 0, secrets: firstSix });
  });

  it("pages sharing one resources dictionary carry only their own images", async () => {
    const out = await extractPreview(
      await notes(async (doc, pages) => {
        const merged = doc.context.obj({ XObject: {} });
        const group = merged.lookup(PDFName.of("XObject"), PDFDict);
        for (const [i, p] of pages.entries()) {
          const image = await doc.embedPng(png(i + 1));
          p.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
        }
        await doc.flush();
        for (const p of pages) {
          const own = p.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
          for (const [k, v] of own.entries()) group.set(k, v);
        }
        // قاموس موارد واحد لكل الصفحات، كما تكتبه بعض برامج الإخراج
        const shared = doc.context.register(merged);
        const fonts = pages[0].node.Resources()!.get(PDFName.of("Font"));
        merged.set(PDFName.of("Font"), fonts!);
        pages.forEach((p) => p.node.set(PDFName.of("Resources"), shared));
      }),
      ALLOWED,
    );
    expect(await contents(out!.bytes)).toMatchObject({ pageObjects: 6, images: 6, secrets: firstSix });
  });

  it("a form shared by all pages keeps only what the form itself draws", async () => {
    const out = await extractPreview(
      await notes(async (doc, pages) => {
        const logo = await doc.embedPng(png(250));
        for (const [i, p] of pages.entries()) p.drawImage(await doc.embedPng(png(i + 1)), { x: 0, y: 0, width: 10, height: 10 });
        p0Logo(pages[0], logo);
        await doc.flush();
        // ترويسة واحدة (Form) مواردها القاموس المشترك نفسه الذي يضم صور كل الصفحات
        const all = doc.context.obj({});
        for (const p of pages) for (const [k, v] of p.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).entries()) all.set(k, v);
        const logoName = [...pages[0].node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).keys()].at(-1)!;
        const form = doc.context.stream(`q 10 0 0 10 0 0 cm ${logoName.asString()} Do Q`, { Type: "XObject", Subtype: "Form", BBox: [0, 0, 10, 10], Resources: { XObject: all } });
        const ref = doc.context.register(form);
        for (const p of pages) {
          p.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).set(PDFName.of("Header"), ref);
          p.node.addContentStream(doc.context.register(doc.context.stream("/Header Do")));
        }
      }),
      ALLOWED,
    );
    // صورة لكل صفحة من الست، والشعار
    expect(await contents(out!.bytes)).toMatchObject({ pageObjects: 6, images: 7 });
  });

  it("a name that only appears inside text is not taken for a resource", async () => {
    const out = await extractPreview(
      await notes(async (doc, pages) => {
        for (const [i, p] of pages.entries()) p.drawImage(await doc.embedPng(png(i + 1)), { x: 0, y: 0, width: 10, height: 10 });
        await doc.flush();
        const later = pages[20].node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
        const [, value] = later.entries()[0];
        const first = pages[0].node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
        first.set(PDFName.of("Later"), value);
        pages[0].node.addContentStream(doc.context.register(doc.context.stream("BT (/Later Do) Tj ET % /Later Do\n")));
      }),
      ALLOWED,
    );
    expect((await contents(out!.bytes)).images).toBe(6);
  });

  it("inline image bytes are not read as drawing commands", async () => {
    const out = await extractPreview(
      await notes(async (doc, pages) => {
        for (const [i, p] of pages.entries()) p.drawImage(await doc.embedPng(png(i + 1)), { x: 0, y: 0, width: 10, height: 10 });
        await doc.flush();
        const later = pages[20].node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
        pages[0].node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).set(PDFName.of("Later"), later.entries()[0][1]);
        pages[0].node.addContentStream(doc.context.register(doc.context.stream("BI /W 1 /H 1 /BPC 8 /CS /G ID /Later Do EI\nQ")));
      }),
      ALLOWED,
    );
    expect((await contents(out!.bytes)).images).toBe(6);
  });

  it("what the page really draws is still there and the reader opens it", async () => {
    const out = await extractPreview(
      await notes(async (doc, pages) => {
        for (const [i, p] of pages.entries()) p.drawImage(await doc.embedPng(png(i + 1)), { x: 0, y: 0, width: 10, height: 10 });
      }),
      ALLOWED,
    );
    expect(await contents(out!.bytes)).toMatchObject({ images: 6, secrets: firstSix });
    await expect(engine.openInReader(out!.bytes)).resolves.toEqual({ status: "ok", pages: 6, encrypted: false });
  });

  it("fails closed when a hidden reference survives the cleaning", async () => {
    const crafted = await notes(async (doc, p) => {
      await doc.flush();
      // مرجع غير معتاد داخل خط تستخدمه الصفحة: لا تعرفه التنقية، ويكشفه فحص الملف الناتج
      const font = p[0].node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
      font.lookup(font.keys()[0], PDFDict).set(PDFName.of("Sneaky"), p[20].ref);
    });
    await expect(extractPreview(crafted, ALLOWED)).rejects.toBeInstanceOf(PreviewNotIsolatedError);
  });

  it("a refusal to isolate does not call the file damaged", async () => {
    const crafted = await notes(async (doc, p) => {
      await doc.flush();
      const font = p[0].node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
      font.lookup(font.keys()[0], PDFDict).set(PDFName.of("Sneaky"), p[20].ref);
    });
    await expect(extractPreview(crafted, ALLOWED)).rejects.not.toHaveProperty("problem");
  });
});

function p0Logo(page: PDFPage, logo: Awaited<ReturnType<PDFDocument["embedPng"]>>) {
  page.drawImage(logo, { x: 20, y: 20, width: 10, height: 10 });
}

describe("المعاينة المرفوعة يدويًا تُبنى من جديد", () => {
  it("pages cut out of the tree but left in the file are dropped", async () => {
    const doc = await PDFDocument.load(await notes(), { updateMetadata: false });
    for (let i = TOTAL - 1; i >= 3; i--) doc.removePage(i);
    const sloppy = await doc.save();
    // هكذا تترك بعض الأدوات الملف: 3 صفحات في الشجرة، و30 محتوى في الملف
    expect((await contents(sloppy)).secrets.length).toBeGreaterThan(3);
    const out = await rebuildCustomPreview(sloppy);
    expect(out.pageCount).toBe(3);
    expect(await contents(out.bytes)).toEqual({ treePages: 3, pageObjects: 3, annots: 0, images: 0, secrets: [1, 2, 3] });
  });

  it("links are removed from a custom preview too", async () => {
    const out = await rebuildCustomPreview(await notes((doc, p) => link(doc, p[0], { Dest: [p[1].ref, PDFName.of("Fit")] }), 2));
    expect(await contents(out.bytes)).toMatchObject({ treePages: 2, annots: 0 });
  });
});
