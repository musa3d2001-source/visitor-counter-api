import "server-only";
import { sql, type Db } from "../db";
import { recordConsent, type ConsentMeta } from "../platform/consent";
import { audit } from "../platform/audit";
import type { Actor } from "../auth/permissions";
import { AdminError } from "./common";
import { CONSENT_VERSIONS } from "@/lib/consent";
import { RIGHTS_ATTESTATION_VERSION } from "@/lib/teacher-agreement";

/**
 * قبول اتفاقية المعلم وإقرار حقوق كل منتج. الحالة تُقرأ من الخادم عند كل إرسال، فلا تكفي واجهة تخفي الزر.
 * المعلم القديم لا يُقفل شيء عنه: يُسأل عند إرساله التالي فقط.
 */
export type AgreementAcceptance = { version: string; acceptedAt: Date; isCurrent: boolean };

/** آخر نسخة قبلها هذا الحساب، أو null إن لم يقبل أي نسخة */
export async function latestAgreementAcceptance(userId: string, db: Db = sql): Promise<AgreementAcceptance | null> {
  const [row] = await db<{ document_version: string; created_at: Date }[]>`
    select document_version, created_at from consent_records
    where user_id = ${userId} and kind = 'teacher_agreement'
    order by (document_version = ${CONSENT_VERSIONS.teacher_agreement}) desc, created_at desc
    limit 1
  `;
  if (!row) return null;
  return { version: row.document_version, acceptedAt: row.created_at, isCurrent: row.document_version === CONSENT_VERSIONS.teacher_agreement };
}

export async function hasCurrentAgreement(userId: string, db: Db = sql): Promise<boolean> {
  return (await latestAgreementAcceptance(userId, db))?.isCurrent ?? false;
}

export async function acceptTeacherAgreement(actor: Actor, meta: ConsentMeta, ip?: string) {
  if (actor.kind !== "teacher") throw new AdminError("هذه الاتفاقية يقبلها المعلم من حسابه");
  if (await hasCurrentAgreement(actor.userId)) return;
  await sql.begin(async (tx) => {
    await recordConsent(tx, { userId: actor.userId, kind: "teacher_agreement", meta });
    await audit({ actorId: actor.userId, action: "teacher.agreement_accept", entityType: "teacher", entityId: actor.teacherId, metadata: { version: CONSENT_VERSIONS.teacher_agreement }, ip }, tx);
  });
}

/** يُستدعى داخل معاملة الإرسال نفسها: لا إرسال بلا إقرار، ولا إقرار لإرسال لم يتم */
export async function recordRightsAttestation(db: Db, input: { productId: string; productTitle: string; actor: Extract<Actor, { kind: "teacher" }>; meta: ConsentMeta }) {
  await db`
    insert into product_rights_attestations (product_id, product_title, teacher_id, user_id, statement_version, agreement_version, ip, user_agent)
    values (${input.productId}, ${input.productTitle}, ${input.actor.teacherId}, ${input.actor.userId}, ${RIGHTS_ATTESTATION_VERSION}, ${CONSENT_VERSIONS.teacher_agreement}, ${input.meta.ip}, ${input.meta.userAgent})
  `;
}

export async function latestRightsAttestation(productId: string, db: Db = sql) {
  const [row] = await db<{ statement_version: string; agreement_version: string; attested_at: Date; attested_by: string | null }[]>`
    select a.statement_version, a.agreement_version, a.attested_at, u.full_name as attested_by
    from product_rights_attestations a left join users u on u.id = a.user_id
    where a.product_id = ${productId}
    order by a.attested_at desc
    limit 1
  `;
  return row ?? null;
}
