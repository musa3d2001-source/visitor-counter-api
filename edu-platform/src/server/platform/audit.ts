import "server-only";
import { sql, type Db } from "../db";

/** سجل التدقيق للعمليات الحساسة (منح/سحب صلاحيات، تعديل أسعار، استرداد...) */
export async function audit(
  entry: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  },
  db: Db = sql,
) {
  await db`
    insert into audit_logs (actor_id, action, entity_type, entity_id, reason, metadata, ip)
    values (${entry.actorId}, ${entry.action}, ${entry.entityType}, ${entry.entityId ?? null},
            ${entry.reason ?? null}, ${db.json((entry.metadata ?? {}) as never)}, ${entry.ip ?? null})
  `;
}

/** سجل الوصول للمحتوى المدفوع */
export async function logAccess(entry: {
  userId: string | null;
  productId?: string | null;
  fileId?: string | null;
  lessonId?: string | null;
  action: "view" | "download" | "preview" | "video" | "denied";
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    await sql`
      insert into access_logs (user_id, product_id, file_id, lesson_id, action, ip, user_agent)
      values (${entry.userId}, ${entry.productId ?? null}, ${entry.fileId ?? null}, ${entry.lessonId ?? null},
              ${entry.action}, ${entry.ip ?? null}, ${entry.userAgent?.slice(0, 300) ?? null})
    `;
  } catch (err) {
    // تسجيل الوصول لا يجب أن يمنع الطالب من محتواه
    console.error("[access-log] failed", err);
  }
}
