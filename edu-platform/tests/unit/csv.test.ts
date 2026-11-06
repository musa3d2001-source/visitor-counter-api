/**
 * محلل CSV الداخلي (src/server/questions/csv.ts) وفق RFC 4180:
 * الحقول المقتبسة، ونهايات الأسطر، وعلامة BOM، والترميز، والحدود، وتحييد الخلايا عند التصدير.
 */
import { describe, expect, it } from "vitest";
import { CSV_MAX_BYTES, CSV_MAX_ROWS, decodeCsvBytes, neutralizeCsvCell, parseCsv, rowsToRecords, toCsvRow } from "@/server/questions/csv";

function rowsOf(text: string, maxRows?: number): string[][] {
  const r = parseCsv(text, maxRows);
  if ("error" in r) throw new Error(`unexpected CSV error: ${r.error} (line ${r.line})`);
  return r.rows;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

describe("parseCsv — الحقول والأسطر", () => {
  it("parses plain rows", () => {
    expect(rowsOf("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps empty fields", () => {
    expect(rowsOf("a,,c\n,\n")).toEqual([
      ["a", "", "c"],
      ["", ""],
    ]);
  });

  it("quoted fields may contain commas, newlines and escaped quotes", () => {
    expect(rowsOf('"الوحدة، الأولى","a,b",x')).toEqual([["الوحدة، الأولى", "a,b", "x"]]);
    expect(rowsOf('"سطر أول\nسطر ثانٍ",2\n3,4')).toEqual([
      ["سطر أول\nسطر ثانٍ", "2"],
      ["3", "4"],
    ]);
    expect(rowsOf('"قال ""مرحبا""",""""\n')).toEqual([['قال "مرحبا"', '"']]);
    expect(rowsOf('"",x')).toEqual([["", "x"]]);
  });

  it("keeps CRLF inside a quoted field as is", () => {
    expect(rowsOf('"a\r\nb",c\r\n')).toEqual([["a\r\nb", "c"]]);
  });

  it("accepts CRLF, LF and a mix of both", () => {
    const expected = [
      ["h1", "h2"],
      ["1", "2"],
      ["3", "4"],
    ];
    expect(rowsOf("h1,h2\r\n1,2\r\n3,4\r\n")).toEqual(expected);
    expect(rowsOf("h1,h2\n1,2\n3,4\n")).toEqual(expected);
    expect(rowsOf("h1,h2\r\n1,2\n3,4")).toEqual(expected);
  });

  it("strips a leading BOM", () => {
    expect(rowsOf("﻿unit_number,unit_title\n1,الوحدة")).toEqual([
      ["unit_number", "unit_title"],
      ["1", "الوحدة"],
    ]);
  });

  it("a trailing newline does not add an empty row", () => {
    expect(rowsOf("a,b\n")).toEqual([["a", "b"]]);
    expect(rowsOf("a,b\r\n")).toEqual([["a", "b"]]);
  });

  it("ignores completely empty lines (LF and CRLF) but keeps a quoted empty cell", () => {
    expect(rowsOf("a,b\n\n1,2\n\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(rowsOf("\r\na,b\r\n\r\n1,2\r\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(rowsOf('a\n""\nb')).toEqual([["a"], [""], ["b"]]);
  });

  it("an empty text gives no rows", () => {
    expect(rowsOf("")).toEqual([]);
    expect(rowsOf("\n\r\n")).toEqual([]);
  });
});

describe("parseCsv — الأخطاء برقم السطر", () => {
  it("unterminated quote reports the line where the row started", () => {
    expect(parseCsv('a,b\n"c,d\n')).toEqual({ error: "علامة اقتباس لم تُغلق", line: 2 });
    // حقل مقتبس صحيح يمتد على سطرين قبله: السطر المذكور هو سطر الملف الفعلي
    expect(parseCsv('"x\ny",1\n"open')).toEqual({ error: "علامة اقتباس لم تُغلق", line: 3 });
  });

  it("a quote in the middle of an unquoted cell is an error", () => {
    expect(parseCsv('ab"c,d')).toEqual({ error: "علامة اقتباس في منتصف خلية غير مقتبسة", line: 1 });
    expect(parseCsv('a,b\n1,2"3')).toEqual({ error: "علامة اقتباس في منتصف خلية غير مقتبسة", line: 2 });
  });

  it("text after a closing quote is an error", () => {
    expect(parseCsv('"ab"c,d')).toEqual({ error: "نص بعد علامة الاقتباس الختامية", line: 1 });
    expect(parseCsv('x\n"ab" ,d')).toEqual({ error: "نص بعد علامة الاقتباس الختامية", line: 2 });
  });

  it("enforces the row limit (header + CSV_MAX_ROWS data rows)", () => {
    const header = "a,b\n";
    const ok = header + Array.from({ length: CSV_MAX_ROWS }, (_, i) => `${i},x`).join("\n");
    expect(rowsOf(ok)).toHaveLength(CSV_MAX_ROWS + 1);
    expect(rowsOf(`${ok}\n`)).toHaveLength(CSV_MAX_ROWS + 1);

    const tooMany = `${ok}\n${CSV_MAX_ROWS},x`;
    const r = parseCsv(tooMany);
    expect(r).toMatchObject({ error: "عدد الصفوف أكبر من الحد المسموح (٥٠٠ صف)" });
    const r2 = parseCsv(`${tooMany}\n`);
    expect(r2).toMatchObject({ error: "عدد الصفوف أكبر من الحد المسموح (٥٠٠ صف)" });
  });

  it("a custom row limit stops early", () => {
    expect(parseCsv("h\n1\n2\n3\n", 3)).toMatchObject({ error: "عدد الصفوف أكبر من الحد المسموح (صفّان)" });
    expect(rowsOf("h\n1\n2\n", 3)).toHaveLength(3);
  });
});

describe("decodeCsvBytes — الترميز والحجم", () => {
  it("decodes valid UTF-8 Arabic text", () => {
    expect(decodeCsvBytes(utf8("الوحدة,الدرس\n1,مرحبا"))).toEqual({ text: "الوحدة,الدرس\n1,مرحبا" });
  });

  it("strips a UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("a,b")]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: "a,b" });
  });

  it("rejects Windows-1256 bytes with Arabic guidance", () => {
    // «مرحبا» بترميز Windows-1256
    const r = decodeCsvBytes(new Uint8Array([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]));
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toContain("Windows-1256");
    expect(r.error).toContain("UTF-8");
    expect(r.error).toContain("CSV UTF-8");
    expect(r.error).toMatch(/^الملف ليس بترميز UTF-8/);
  });

  it("rejects other invalid UTF-8 sequences", () => {
    expect(decodeCsvBytes(new Uint8Array([0x61, 0xff, 0x62]))).toHaveProperty("error");
    expect(decodeCsvBytes(new Uint8Array([0xd8]))).toHaveProperty("error");
  });

  it("rejects an empty file", () => {
    expect(decodeCsvBytes(new Uint8Array())).toEqual({ error: "الملف فارغ" });
  });

  it("enforces the size limit before decoding", () => {
    expect(decodeCsvBytes(new Uint8Array(CSV_MAX_BYTES + 1).fill(0x61))).toEqual({ error: "حجم الملف أكبر من الحد المسموح (١٠٢٤ ك.ب)" });
    expect(decodeCsvBytes(new Uint8Array(CSV_MAX_BYTES).fill(0x61))).toHaveProperty("text");
    expect(decodeCsvBytes(utf8("abcd"), 3)).toHaveProperty("error");
    // الحد يُفحص قبل الترميز: ملف كبير بترميز خاطئ يُرفض بسبب الحجم
    expect(decodeCsvBytes(new Uint8Array(CSV_MAX_BYTES + 1).fill(0xe3))).toMatchObject({ error: expect.stringContaining("حجم الملف") });
  });
});

describe("rowsToRecords — الأعمدة المطلوبة", () => {
  const required = ["unit_number", "unit_title", "page_start", "page_end"] as const;

  it("reports missing columns in the required order on line 1", () => {
    expect(rowsToRecords([["unit_number", "page_start"], ["1", "10"]], required)).toEqual({ error: "أعمدة ناقصة: unit_title، page_end", line: 1 });
  });

  it("an empty table is an error", () => {
    expect(rowsToRecords([], required)).toEqual({ error: "الملف بلا صفوف" });
  });

  it("matches headers case-insensitively, trims cells, fills missing cells and keeps extra columns", () => {
    const r = rowsToRecords(
      [
        [" Unit_Number ", "UNIT_TITLE", "page_start", "page_end", "note"],
        [" 1 ", "  الوحدة الأولى ", "10", "20", "x"],
        ["2", "الوحدة الثانية", "21"],
      ],
      required,
    );
    expect(r).toEqual({
      records: [
        { line: 2, data: { unit_number: "1", unit_title: "الوحدة الأولى", page_start: "10", page_end: "20", note: "x" } },
        { line: 3, data: { unit_number: "2", unit_title: "الوحدة الثانية", page_start: "21", page_end: "", note: "" } },
      ],
    });
  });

  it("a header-only file gives no records", () => {
    expect(rowsToRecords([[...required]], required)).toEqual({ records: [] });
  });

  it("rejects more than CSV_MAX_ROWS data rows", () => {
    const rows = [[...required], ...Array.from({ length: CSV_MAX_ROWS + 1 }, () => ["1", "و", "1", "2"])];
    expect(rowsToRecords(rows, required)).toEqual({ error: "عدد الصفوف أكبر من الحد المسموح (٥٠٠ صف)" });
  });
});

describe("neutralizeCsvCell و toCsvRow — تصدير آمن", () => {
  it("prefixes cells that start with = + - @ tab or CR", () => {
    expect(neutralizeCsvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(neutralizeCsvCell("+96512345678")).toBe("'+96512345678");
    expect(neutralizeCsvCell("-5")).toBe("'-5");
    expect(neutralizeCsvCell("@cmd")).toBe("'@cmd");
    expect(neutralizeCsvCell("\tx")).toBe("'\tx");
    expect(neutralizeCsvCell("\rx")).toBe("'\rx");
  });

  it("leaves normal cells untouched", () => {
    for (const v of ["", "نيوتن", "a=b", "5-3", "user@example.com", " =x"]) expect(neutralizeCsvCell(v)).toBe(v);
  });

  it("quotes when needed, escapes quotes, renders null as empty and neutralizes formulas", () => {
    expect(toCsvRow(["a", "b,c", 'قال "مرحبا"', "سطر\nثانٍ", null, undefined, 5, "=1+1", "=a,b"])).toBe(
      `a,"b,c","قال ""مرحبا""","سطر\nثانٍ",,,5,'=1+1,"'=a,b"`,
    );
  });

  it("round-trips through parseCsv", () => {
    const cells = ["الوحدة، الأولى", 'نص "مقتبس"', "سطر\r\nثانٍ", "", "42", "-3"];
    expect(rowsOf(toCsvRow(cells))).toEqual([["الوحدة، الأولى", 'نص "مقتبس"', "سطر\r\nثانٍ", "", "42", "'-3"]]);
  });
});

describe("rowsToRecords — صفوف الفواصل الفارغة", () => {
  it("drops rows made only of commas (Excel separator rows) and keeps real line numbers", () => {
    const parsed = parseCsv("a,b\n1,2\n,\n\n3,4\n");
    if ("error" in parsed) throw new Error(parsed.error);
    const r = rowsToRecords(parsed.rows, ["a", "b"], parsed.lines);
    expect(r).toEqual({ records: [{ line: 2, data: { a: "1", b: "2" } }, { line: 5, data: { a: "3", b: "4" } }] });
  });
});
