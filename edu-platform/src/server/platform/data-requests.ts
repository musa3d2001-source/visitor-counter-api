import "server-only";
import { sql } from "../db";
import { hitRateLimit } from "../auth/rate-limit";
import { AdminError } from "../admin/common";
import { audit } from "./audit";
import { alertAfterResponse } from "./ops-alerts";
import { DATA_REQUEST_NOTE_MAX, type DataRequestKind, type DataRequestStatus } from "@/lib/data-requests";

/**
 * طلب الطالب حذف حسابه أو نسخة من بياناته (K039).
 * لا ينفذ النظام شيئًا وحده: الطلب يصل المالك في لوحته ويبقى حتى يقرر، وكل خطوة في سجل التدقيق.
 * الحذف نفسه يمر من anonymizeStudent بشروطه كلها، وهو الذي يغلق الطلب.
 */
const REQUESTS_PER_HOUR = 10;

export type MyDataRequest = { id: string; kind: DataRequestKind; status: DataRequestStatus; created_at: Date; closed_at: Date | null; close_note: string | null };
export type OpenDataRequest = { id: string; kind: DataRequestKind; created_at: Date; user_id: string; full_name: string; email: string };

export type DataRequestResult = { ok: true; message: string } | { ok: false; error: string };

const RECEIVED = "وصل طلبك إلى إدارة المنصة، وستراجعه وتتواصل معك على بريدك.";
const SESSION_OVER = "انتهت الجلسة، سجّل الدخول مرة أخرى";

export async function requestAccountData(input: { userId: string; kind: DataRequestKind; ip?: string | null }): Promise<DataRequestResult> {
  const limit = await hitRateLimit(`data-request:${input.userId}`, REQUESTS_PER_HOUR, 60 * 60);
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. حاول بعد ساعة." };
  const state = await sql.begin(async (tx) => {
    const [user] = await tx`select 1 from users where id = ${input.userId} and role = 'student' and anonymized_at is null and is_active for no key update`;
    if (!user) return "gone" as const;
    const [created] = await tx<{ id: string }[]>`
      insert into account_data_requests (user_id, kind) values (${input.userId}, ${input.kind})
      on conflict (user_id, kind) where status = 'open' do nothing
      returning id
    `;
    if (!created) return "already" as const;
    await audit({ actorId: input.userId, action: "data_request.opened", entityType: "user", entityId: input.userId, metadata: { requestId: created.id, kind: input.kind }, ip: input.ip ?? null }, tx);
    return "created" as const;
  });
  if (state === "gone") return { ok: false, error: SESSION_OVER };
  if (state === "created") await alertAfterResponse("data_request");
  return { ok: true, message: RECEIVED };
}

export async function withdrawAccountData(input: { userId: string; requestId: string; ip?: string | null }): Promise<DataRequestResult> {
  const done = await sql.begin(async (tx) => {
    const [row] = await tx<{ kind: DataRequestKind }[]>`
      update account_data_requests set status = 'withdrawn', closed_at = now()
      where id = ${input.requestId} and user_id = ${input.userId} and status = 'open'
      returning kind
    `;
    if (!row) return false;
    await audit({ actorId: input.userId, action: "data_request.withdrawn", entityType: "user", entityId: input.userId, metadata: { requestId: input.requestId, kind: row.kind }, ip: input.ip ?? null }, tx);
    return true;
  });
  return done ? { ok: true, message: "سحبنا طلبك، ولن يتغير شيء في حسابك." } : { ok: false, error: "أُغلق هذا الطلب من قبل." };
}

/** المفتوح أولًا ثم أحدث ما أُغلق: يرى الطالب ما حدث لطلبه، وسبب الرفض إن رُفض */
export async function myDataRequests(userId: string): Promise<MyDataRequest[]> {
  return sql<MyDataRequest[]>`
    select id, kind, status, created_at, closed_at, close_note from account_data_requests
    where user_id = ${userId}
    order by (status = 'open') desc, created_at desc
    limit 12
  `;
}

export async function openDataRequestCount(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from account_data_requests where status = 'open'`;
  return row.n;
}

export async function listOpenDataRequests(): Promise<OpenDataRequest[]> {
  return sql<OpenDataRequest[]>`
    select r.id, r.kind, r.created_at, r.user_id, u.full_name, u.email
    from account_data_requests r join users u on u.id = r.user_id
    where r.status = 'open'
    order by r.created_at
    limit 200
  `;
}

export async function studentOpenDataRequests(userId: string): Promise<{ id: string; kind: DataRequestKind; created_at: Date }[]> {
  return sql`select id, kind, created_at from account_data_requests where user_id = ${userId} and status = 'open' order by created_at`;
}

/** قرار المالك. طلب الحذف لا يُغلق «تم» من هنا: الحذف الحقيقي بشروطه هو الذي يغلقه، فلا يقرأ الطالب «تم» وحسابه باقٍ */
export async function closeDataRequest(input: { requestId: string; adminId: string; outcome: "done" | "declined"; note: string; ip?: string }): Promise<void> {
  const note = input.note.trim();
  if (note.length > DATA_REQUEST_NOTE_MAX) throw new AdminError("السبب طويل جدًا");
  if (input.outcome === "declined" && note.length < 3) throw new AdminError("اكتب سبب الرفض (٣ أحرف على الأقل)، يظهر للطالب ويُحفظ في سجل التدقيق");
  await sql.begin(async (tx) => {
    const [row] = await tx<{ user_id: string; kind: DataRequestKind; status: DataRequestStatus }[]>`select user_id, kind, status from account_data_requests where id = ${input.requestId} for update`;
    if (!row) throw new AdminError("الطلب غير موجود");
    if (row.status !== "open") throw new AdminError("أُغلق هذا الطلب من قبل.");
    if (input.outcome === "done" && row.kind === "delete") throw new AdminError("نفّذ الحذف من قسم «حذف بيانات الطالب» في صفحته، ويُغلق الطلب وحده.");
    await tx`update account_data_requests set status = ${input.outcome}, closed_at = now(), closed_by = ${input.adminId}, close_note = ${note || null} where id = ${input.requestId}`;
    await audit({ actorId: input.adminId, action: "data_request.closed", entityType: "user", entityId: row.user_id, reason: note || null, metadata: { requestId: input.requestId, kind: row.kind, outcome: input.outcome }, ip: input.ip ?? null }, tx);
  });
}
