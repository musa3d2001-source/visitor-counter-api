import { ar, count, type CountWord } from "@/lib/design";

const ROW: CountWord = { one: "صف", two: "صفّان", plural: "صفوف", acc: "صفًّا" };

/**
 * محلل CSV داخلي وفق RFC 4180 (بلا مكتبة خارجية)، ونقي بلا Node ليُختبر وحده:
 *  - الحقول مفصولة بفواصل، والسجلات بـ CRLF أو LF، والحقل المقتبس يحتمل الفواصل والأسطر و"" للاقتباس.
 *  - علامة BOM في البداية مقبولة وتُحذف. الملف يجب أن يكون UTF-8: ترميز Windows-1256 يُرفض برسالة تشرح الحفظ الصحيح.
 *  - الحدود (الحجم وعدد الصفوف) تُفحص قبل التحليل.
 * neutralizeCsvCell للتصدير: تحييد الخلايا البادئة بـ = أو + أو - أو @ حتى لا تُنفَّذ كصيغ في برامج الجداول.
 */

import { CSV_MAX_BYTES, CSV_MAX_ROWS } from "./limits";
export { CSV_MAX_BYTES, CSV_MAX_ROWS };

export type CsvError = { error: string; line?: number };

const MSG_ENCODING =
  "الملف ليس بترميز UTF-8 (غالبًا حُفظ بترميز Windows-1256 العربي). افتحه في Excel واختر «حفظ باسم» ثم «CSV UTF-8 (مفصول بفواصل)»، أو في Google Sheets: ملف ← تنزيل ← CSV.";

/** فك ترميز البايتات بعد فحص الحجم؛ يرفض أي تسلسل ليس UTF-8 صالحًا */
export function decodeCsvBytes(bytes: Uint8Array, maxBytes = CSV_MAX_BYTES): { text: string } | CsvError {
  if (bytes.byteLength === 0) return { error: "الملف فارغ" };
  if (bytes.byteLength > maxBytes) return { error: `حجم الملف أكبر من الحد المسموح (${ar(Math.round(maxBytes / 1024))} ك.ب)` };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { error: MSG_ENCODING };
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text };
}

/** يحلل النص إلى صفوف من الخلايا. الأسطر الفارغة تمامًا تُتجاهل. lines[i] = رقم سطر بداية الصف i في الملف. */
export function parseCsv(text: string, maxRows = CSV_MAX_ROWS + 1): { rows: string[][]; lines: number[] } | CsvError {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let wasQuoted = false;
  let line = 1;
  let rowLine = 1;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === "" && !wasQuotedRow)) {
      rows.push(row);
      lines.push(rowLine);
    }
    row = [];
    wasQuotedRow = false;
  };
  let wasQuotedRow = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (fieldStarted) return { error: "علامة اقتباس في منتصف خلية غير مقتبسة", line };
      inQuotes = true;
      fieldStarted = true;
      wasQuoted = true;
      wasQuotedRow = true;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
      if (rows.length > maxRows) return { error: `عدد الصفوف أكبر من الحد المسموح (${count(maxRows - 1, ROW)})`, line };
      continue;
    }
    if (wasQuoted) return { error: "نص بعد علامة الاقتباس الختامية", line };
    field += ch;
    fieldStarted = true;
  }
  if (inQuotes) return { error: "علامة اقتباس لم تُغلق", line: rowLine };
  if (fieldStarted || row.length > 0) endRow();
  if (rows.length > maxRows) return { error: `عدد الصفوف أكبر من الحد المسموح (${count(maxRows - 1, ROW)})` };
  return { rows, lines };
}

/**
 * يحوّل الصفوف إلى كائنات بأسماء الأعمدة من الصف الأول (بلا حساسية لحالة الأحرف والمسافات).
 * يعيد رقم سطر الملف لكل صف ليُذكر في رسائل الأخطاء.
 */
export function rowsToRecords(rows: string[][], required: readonly string[], lines?: number[]): { records: { line: number; data: Record<string, string> }[] } | CsvError {
  if (!rows.length) return { error: "الملف بلا صفوف" };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = required.filter((r) => !header.includes(r));
  if (missing.length) return { error: `أعمدة ناقصة: ${missing.join("، ")}`, line: 1 };
  if (rows.length - 1 > CSV_MAX_ROWS) return { error: `عدد الصفوف أكبر من الحد المسموح (${count(CSV_MAX_ROWS, ROW)})` };
  // صفوف من فواصل فقط (يكتبها Excel بين الأقسام) فارغة فعليًا وتُتجاهل
  const records = rows
    .slice(1)
    .map((r, i) => {
      const data: Record<string, string> = {};
      header.forEach((h, j) => {
        data[h] = (r[j] ?? "").trim();
      });
      return { line: lines?.[i + 1] ?? i + 2, data, empty: r.every((c) => c.trim() === "") };
    })
    .filter((r) => !r.empty)
    .map(({ line, data }) => ({ line, data }));
  return { records };
}

/** تحييد خلية للتصدير */
export function neutralizeCsvCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** تسلسل صف للتصدير (اقتباس عند الحاجة + تحييد) */
export function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells
    .map((c) => {
      const v = neutralizeCsvCell(c == null ? "" : String(c));
      return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    })
    .join(",");
}
