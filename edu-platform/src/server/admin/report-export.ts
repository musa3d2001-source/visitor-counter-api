import "server-only";
import { LONG_JOB_STATEMENT_MS, withDbDeadline } from "../db";
import { audit } from "../platform/audit";
import { reportError } from "../platform/report-error";
import { filsToKwdString } from "@/lib/money";
import { csvRow } from "@/lib/csv";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/labels";
import { countReportOrders, reportByTeacher, reportOrdersPage, type ReportRange } from "./stats";

/**
 * تصدير المالك: تدفق بصفحات من قاعدة البيانات، لا جدول كامل في الذاكرة ولا اتصال محجوز طوال التنزيل.
 * كل صفحة استعلام قصير مستقل، والصفحة التالية لا تُطلب قبل أن يقرأ المتصفح ما سبقها.
 * يُكتب سطر التدقيق قبل أول بايت بعدد الصفوف المتوقع، فيبقى حتى لو انقطع التنزيل أو انتهت الدالة، وسطر آخر عند النهاية بما خرج فعلًا.
 */
export const EXPORT_PAGE_ROWS = 500;
const CRLF = "\r\n";
const BOM = "﻿";

const ORDERS_HEADER = ["رقم الطلب", "تاريخ الدفع", "اسم العميل", "البريد", "الحالة", "المجموع (د.ك)", "الخصم (د.ك)", "الإجمالي (د.ك)", "كود الخصم", "تجريبي", "المنتجات"];
const TEACHERS_HEADER = ["المعلم", "عمليات البيع", "قيمة المبيعات (د.ك)", "حصة المعلم (د.ك)", "حصة المنصة من المؤهل (د.ك)"];

export type ExportKind = "orders" | "teachers";
type ExportActor = { adminId: string; ip?: string | null };
type ExportChunk = { text: string; rows: number; done: boolean };

function auditEnd(kind: ExportKind, actor: ExportActor, rows: number, complete: boolean) {
  return audit({ actorId: actor.adminId, action: "report.export_end", entityType: "report", entityId: kind, metadata: { rows, complete }, ip: actor.ip ?? null }).catch((err: unknown) => reportError("report-export:audit", err));
}

function csvStream(kind: ExportKind, actor: ExportActor, header: string[], nextChunk: () => Promise<ExportChunk>) {
  const encoder = new TextEncoder();
  let headerSent = false;
  let sent = 0;
  let closed = false;
  const finish = async (complete: boolean) => {
    if (closed) return;
    closed = true;
    await auditEnd(kind, actor, sent, complete);
  };
  // highWaterMark صفر: لا شيء يُطلب من قاعدة البيانات قبل أن يقرأ المستقبل
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          if (!headerSent) {
            headerSent = true;
            controller.enqueue(encoder.encode(BOM + csvRow(header) + CRLF));
            return;
          }
          const chunk = await nextChunk();
          sent += chunk.rows;
          if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
          if (chunk.done) {
            await finish(true);
            controller.close();
          }
        } catch (err) {
          await reportError("report-export:stream", err);
          await finish(false);
          controller.error(new Error("export failed"));
        }
      },
      async cancel() {
        await finish(false);
      },
    },
    { highWaterMark: 0 },
  );
}

function ordersChunks(range: ReportRange): () => Promise<ExportChunk> {
  let after: { paidAt: string; id: string } | null = null;
  return async () => {
    const cursor = after;
    const rows = await withDbDeadline(LONG_JOB_STATEMENT_MS, () => reportOrdersPage(range, cursor, EXPORT_PAGE_ROWS));
    let text = "";
    for (const r of rows) {
      text +=
        csvRow([
          r.number,
          r.paid_at ? new Date(r.paid_at).toISOString() : "",
          r.customer_name,
          r.customer_email,
          ORDER_STATUS_LABELS[r.status as OrderStatus] ?? r.status,
          filsToKwdString(r.subtotal_fils),
          filsToKwdString(r.discount_fils),
          filsToKwdString(r.total_fils),
          r.coupon_code ?? "",
          r.is_test ? "نعم" : "لا",
          r.items ?? "",
        ]) + CRLF;
    }
    const last = rows.at(-1);
    if (last) after = { paidAt: last.paid_cursor, id: last.id };
    return { text, rows: rows.length, done: rows.length < EXPORT_PAGE_ROWS };
  };
}

/** يسجل التصدير ثم يعيد التدفق. أي خطأ قبل أول بايت يصل للمستدعي، فيرد 503 أو 500 بدل ملف ناقص */
export async function openReportExport(kind: ExportKind, range: ReportRange & { fromDay: string; toDay: string }, actor: ExportActor) {
  const teacherRows = kind === "teachers" ? await reportByTeacher(range) : null;
  const rowCount = teacherRows ? teacherRows.length : await countReportOrders(range);
  await audit({
    actorId: actor.adminId,
    action: "report.export",
    entityType: "report",
    entityId: kind,
    metadata: { rowCount, from: range.fromDay, to: range.toDay, includeTest: range.includeTest },
    ip: actor.ip ?? null,
  });
  if (!teacherRows) return csvStream(kind, actor, ORDERS_HEADER, ordersChunks(range));
  // صف لكل معلم، فالقائمة صغيرة بطبيعتها وتخرج دفعة واحدة
  return csvStream(kind, actor, TEACHERS_HEADER, async () => ({
    text: teacherRows.map((r) => csvRow([r.teacherName, r.sold, filsToKwdString(r.revenueFils), filsToKwdString(r.teacherShareFils), filsToKwdString(r.platformShareFils)]) + CRLF).join(""),
    rows: teacherRows.length,
    done: true,
  }));
}
