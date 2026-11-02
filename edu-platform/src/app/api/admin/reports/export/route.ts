import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { parseRange, reportByTeacher, reportOrdersForExport } from "@/server/admin/stats";
import { filsToKwdString } from "@/lib/money";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/labels";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // منع حقن الصيغ في Excel
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const url = new URL(req.url);
  const range = parseRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    test: url.searchParams.get("test") ?? undefined,
  });
  if (url.searchParams.get("type") === "teachers") {
    const rows = await reportByTeacher(range);
    const header = ["المعلم", "عمليات البيع", "قيمة المبيعات (د.ك)", "حصة المعلم (د.ك)", "حصة المنصة من المؤهل (د.ك)"];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push([r.teacherName, r.sold, filsToKwdString(r.revenueFils), filsToKwdString(r.teacherShareFils), filsToKwdString(r.platformShareFils)].map(csvCell).join(","));
    }
    return new NextResponse("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="teachers-${range.fromDay}-to-${range.toDay}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  const rows = await reportOrdersForExport(range);
  const header = ["رقم الطلب", "تاريخ الدفع", "اسم العميل", "البريد", "الحالة", "المجموع (د.ك)", "الخصم (د.ك)", "الإجمالي (د.ك)", "كود الخصم", "تجريبي", "المنتجات"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
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
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const body = "﻿" + lines.join("\r\n");
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sales-${range.fromDay}-to-${range.toDay}.csv"`,
      "cache-control": "no-store",
    },
  });
}
