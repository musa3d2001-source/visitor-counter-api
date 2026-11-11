import "server-only";
import { createHash } from "node:crypto";
import type { PendingQuery, Row } from "postgres";
import type { Db } from "../db";

/**
 * مفتاح النسخة المختومة وهويتها: ملف خفيف بلا pdf-lib. يقرؤه التسليم (delivery.ts) وعدّاد جاهزية النسخ وزر المالك
 * (stamp-queue.ts)، فتكون «جاهزة» عند المالك هي بالضبط النسخة التي يسلّمها الفتح، لا أي نسخة من الملف (البند V4).
 */

/** رقم شكل الختم: يتغير إذا تغير نصه أو موضعه في stampDocument، فلا تُعاد نسخة بالشكل القديم ولا تُحسب جاهزة */
export const STAMP_FORMAT_VERSION = 2;

export type Lines = { primary: string; secondary: string };

export type WatermarkIdentity = { orderNumber: string | null; lines: Lines };

/**
 * بيانات العلامة المائية: بريد المشتري ورقم الطلب الذي منح الصلاحية وتاريخ دفعه، أو مرجع الحساب لمن لا طلب له.
 * ثابتة ما لم يتغير الطلب أو البريد، فتصلح مفتاحًا للنسخة المحفوظة (تاريخ اليوم كان يغيّرها كل يوم).
 */
export function identityLines(user: { id: string; email: string }, order: { number: string; paidAt: Date | string | null } | null): WatermarkIdentity {
  const ref = order?.number ?? `U-${user.id.slice(0, 8).toUpperCase()}`;
  const date = order?.paidAt ? new Date(order.paidAt).toISOString().slice(0, 10) : null;
  return {
    orderNumber: order?.number ?? null,
    lines: {
      primary: `${user.email}  ${ref}`,
      secondary: [`Licensed to ${user.email}`, ref, date, "Personal use only"].filter(Boolean).join(" | "),
    },
  };
}

/** مفتاح النسخة المختومة: الملف ونسخته، والحساب، ورقم الطلب، وكل ما يحدد شكل الختم ونصه */
export function stampCacheKey(input: { fileId: string; fileVersion: string; userId: string; orderNumber: string | null; lines: Lines; format?: number }): string {
  const parts = [input.format ?? STAMP_FORMAT_VERSION, input.fileId, input.fileVersion, input.userId, input.orderNumber ?? "", input.lines.primary, input.lines.secondary];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** قيمة في SQL: معامل (نص) أو مرجع عمود من الاستعلام المحيط (sql`p.user_id`) */
export type SqlValue = string | PendingQuery<Row[]>;

/**
 * الطلب الذي تُختم به نسخة هذا الحساب من ملفات هذا المنتج: أحدث طلب منح صلاحية غير مسحوبة على المنتج نفسه
 * أو على باقة تضمه مباشرة. قاعدة واحدة يقرؤها التسليم وعدّاد الجاهزية معًا، فلا يختلفان. صف واحد (number, paid_at) أو لا شيء.
 */
export function identityOrderSql(db: Db, userId: SqlValue, productId: SqlValue) {
  return db`
    select o.number, o.paid_at from entitlements e join orders o on o.id = e.order_id
    where e.user_id = ${userId} and e.revoked_at is null
      and (e.product_id = ${productId}
           or e.product_id in (select bundle_id from bundle_items where product_id = ${productId}))
    order by o.paid_at desc nulls last limit 1
  `;
}
