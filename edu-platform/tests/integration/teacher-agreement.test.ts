import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ar } from "@/lib/design";
import { CONSENT_VERSIONS } from "@/lib/consent";
import { REFUND_HOLD_DAYS } from "@/lib/teacher-terms";
import { RIGHTS_ATTESTATION_TEXT, RIGHTS_ATTESTATION_VERSION, TEACHER_AGREEMENT_DRAFT_NOTICE, TEACHER_AGREEMENT_SECTIONS } from "@/lib/teacher-agreement";
import { getAdminProduct, submitForReview } from "@/server/admin/products";
import { acceptTeacherAgreement, hasCurrentAgreement, latestAgreementAcceptance, latestRightsAttestation } from "@/server/admin/teacher-agreement";
import type { Actor } from "@/server/auth/permissions";
import { closeDb, resetDb, sql } from "../helpers/db";
import { acceptAgreement, ATTESTED, createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";

const ctx = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.73", userAgent: async () => "agent-73" }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), useRouter: () => ({ refresh() {} }), usePathname: () => "/admin/agreement" }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => (ctx.user ? { user: ctx.user, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));

const { submitForReviewAction } = await import("@/app/admin/products/actions");
const { acceptAgreementAction } = await import("@/app/admin/agreement/actions");
const { default: AgreementPage } = await import("@/app/admin/agreement/page");

const actorOf = (t: TestTeacher): Extract<Actor, { kind: "teacher" }> => ({ kind: "teacher", userId: t.user!.id, name: t.displayName, email: t.user!.email, teacherId: t.id, teacherName: t.displayName, canUpload: true });
const sessionOf = (t: TestTeacher) => ({ id: t.user!.id, email: t.user!.email, fullName: t.displayName, phone: null, role: "teacher" as const, gradeId: null, isActive: true });
const newTeacher = () => createTeacher({ mode: "self_managed", shareBps: 4000 });
const draftFor = (t: TestTeacher) => createVideoProduct({ teacherId: t.id, status: "draft" });
const statusOf = async (id: string) => (await sql<{ status: string }[]>`select status from products where id = ${id}`)[0].status;
const attestations = (id: string) => sql`select * from product_rights_attestations where product_id = ${id} order by attested_at`;
const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(() => {
  ctx.user = null;
});

describe("الخادم يرفض الإرسال بدون الاتفاقية والإقرار", () => {
  it("a crafted request without the agreement is refused even with the attestation ticked", async () => {
    const t = await newTeacher();
    const p = await draftFor(t);
    ctx.user = sessionOf(t);
    const res = await submitForReviewAction(null, form({ id: p.id, rightsAttested: "on" }));
    expect(res?.error).toContain("اتفاقية المعلم");
    expect(await statusOf(p.id)).toBe("draft");
    expect(await attestations(p.id)).toHaveLength(0);
  });

  it("a crafted request without the attestation is refused", async () => {
    const t = await newTeacher();
    await acceptAgreement(t.user!.id);
    const p = await draftFor(t);
    ctx.user = sessionOf(t);
    const res = await submitForReviewAction(null, form({ id: p.id }));
    expect(res?.error).toContain("أقرّ بحقوق");
    expect(await statusOf(p.id)).toBe("draft");
    expect(await attestations(p.id)).toHaveLength(0);
  });

  it("with both it goes to review and the attestation is stored for this product with its evidence", async () => {
    const t = await newTeacher();
    await acceptAgreement(t.user!.id);
    const p = await draftFor(t);
    ctx.user = sessionOf(t);
    expect((await submitForReviewAction(null, form({ id: p.id, rightsAttested: "on" })))?.ok).toBe(true);
    expect(await statusOf(p.id)).toBe("in_review");
    const [row] = await attestations(p.id);
    expect(row).toMatchObject({ teacher_id: t.id, user_id: t.user!.id, statement_version: RIGHTS_ATTESTATION_VERSION, agreement_version: CONSENT_VERSIONS.teacher_agreement, ip: "192.0.2.73", user_agent: "agent-73" });
    expect(row.attested_at).toBeInstanceOf(Date);
    const [log] = await sql`select actor_id from audit_logs where entity_id = ${p.id} and action = 'product.submit_review'`;
    expect(log.actor_id).toBe(t.user!.id);
  });

  it("every submission attests again, including after the owner returns it", async () => {
    const t = await newTeacher();
    await acceptAgreement(t.user!.id);
    const p = await draftFor(t);
    await submitForReview(p.id, actorOf(t), undefined, ATTESTED);
    await sql`update products set status = 'draft' where id = ${p.id}`;
    await expect(submitForReview(p.id, actorOf(t))).rejects.toThrow(/أقرّ بحقوق/);
    await submitForReview(p.id, actorOf(t), undefined, ATTESTED);
    expect(await attestations(p.id)).toHaveLength(2);
    expect(await latestRightsAttestation(p.id)).toMatchObject({ statement_version: RIGHTS_ATTESTATION_VERSION });
  });

  it("a failed status change leaves no attestation behind", async () => {
    const t = await newTeacher();
    await acceptAgreement(t.user!.id);
    const p = await draftFor(t);
    await sql`update products set status = 'in_review' where id = ${p.id}`;
    await expect(submitForReview(p.id, actorOf(t), undefined, ATTESTED)).rejects.toThrow();
    expect(await attestations(p.id)).toHaveLength(0);
  });

  it("the owner sending a draft is not asked and no attestation is invented", async () => {
    const owner = await createUser({ role: "admin" });
    const ownerActor: Actor = { kind: "owner", userId: owner.id, name: "م", email: owner.email, teacherId: null, canUpload: true };
    const t = await newTeacher();
    const p = await draftFor(t);
    await expect(submitForReview(p.id, ownerActor)).resolves.toBeUndefined();
    expect(await statusOf(p.id)).toBe("in_review");
    expect(await latestRightsAttestation(p.id)).toBeNull();
  });
});

describe("قبول الاتفاقية", () => {
  it("the action needs the tick, then stores version and time once, audited", async () => {
    const t = await newTeacher();
    ctx.user = sessionOf(t);
    expect((await acceptAgreementAction(null, form({})))?.error).toBeTruthy();
    expect(await hasCurrentAgreement(t.user!.id)).toBe(false);

    expect((await acceptAgreementAction(null, form({ accept: "on" })))?.ok).toBe(true);
    expect((await acceptAgreementAction(null, form({ accept: "on" })))?.ok).toBe(true);
    const rows = await sql<{ document_version: string; ip: string; created_at: Date }[]>`select document_version, ip, created_at from consent_records where user_id = ${t.user!.id} and kind = 'teacher_agreement'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ document_version: CONSENT_VERSIONS.teacher_agreement, ip: "192.0.2.73" });
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(await sql`select 1 from audit_logs where entity_id = ${t.id} and action = 'teacher.agreement_accept'`).toHaveLength(1);
  });

  it("the owner does not accept on a teacher's behalf", async () => {
    const owner = await createUser({ role: "admin" });
    ctx.user = { id: owner.id, email: owner.email, fullName: "م", phone: null, role: "admin", gradeId: null, isActive: true };
    expect((await acceptAgreementAction(null, form({ accept: "on" })))?.error).toBeTruthy();
    await expect(acceptTeacherAgreement({ kind: "owner", userId: owner.id, name: "م", email: owner.email, teacherId: null, canUpload: true }, { ip: null, userAgent: null })).rejects.toThrow();
  });

  it("a new version asks again at the next submission and an old acceptance no longer counts", async () => {
    const t = await newTeacher();
    await sql`insert into consent_records (user_id, kind, document_version) values (${t.user!.id}, 'teacher_agreement', '2025-old')`;
    expect(await latestAgreementAcceptance(t.user!.id)).toMatchObject({ version: "2025-old", isCurrent: false });
    const p = await draftFor(t);
    await expect(submitForReview(p.id, actorOf(t), undefined, ATTESTED)).rejects.toThrow(/اتفاقية المعلم/);
    await acceptAgreement(t.user!.id);
    await expect(submitForReview(p.id, actorOf(t), undefined, ATTESTED)).resolves.toBeUndefined();
  });

  it("a teacher who already has content keeps it without accepting anything", async () => {
    const t = await newTeacher();
    const published = await createVideoProduct({ teacherId: t.id, status: "published" });
    const draft = await draftFor(t);
    expect(await hasCurrentAgreement(t.user!.id)).toBe(false);
    expect(await getAdminProduct(published.id, actorOf(t))).toMatchObject({ status: "published" });
    expect(await getAdminProduct(draft.id, actorOf(t))).toMatchObject({ status: "draft" });
    // المنشور يبقى منشورًا، والسؤال يأتي عند الإرسال فقط
    expect(await statusOf(published.id)).toBe("published");
  });

  it("the database only allows the known consent kinds", async () => {
    const u = await createUser();
    await expect(sql`insert into consent_records (user_id, kind, document_version) values (${u.id}, 'made_up', 'v')`).rejects.toThrow();
  });
});

describe("نص الاتفاقية", () => {
  const sha = createHash("sha256").update(JSON.stringify({ notice: TEACHER_AGREEMENT_DRAFT_NOTICE, sections: TEACHER_AGREEMENT_SECTIONS, rights: RIGHTS_ATTESTATION_TEXT })).digest("hex");

  /** إذا فشل بعد تعديل النص: ارفع رقم النسخة في src/lib/consent.ts (أو نسخة الإقرار)، ثم حدّث الرقم والبصمة هنا */
  it("cannot change while its version stays the same", () => {
    expect({ agreement: CONSENT_VERSIONS.teacher_agreement, rights: RIGHTS_ATTESTATION_VERSION, sha }).toEqual({
      agreement: "2026-11-draft-1",
      rights: "2026-11-draft-1",
      sha: "8e6ad88c6aef183092b9e09ef7936d1fb90ed99104a3fdddc2d3c44417c9955a",
    });
  });

  it("is marked as a draft for a lawyer, on the page itself", async () => {
    const t = await newTeacher();
    ctx.user = sessionOf(t);
    const html = renderToStaticMarkup(await AgreementPage());
    expect(html).toContain("مسودة بانتظار مراجعة محامٍ");
    expect(html).toContain(CONSENT_VERSIONS.teacher_agreement);
    for (const s of TEACHER_AGREEMENT_SECTIONS) expect(html).toContain(s.title);
  });

  it("covers what the deal has to cover and matches the system", () => {
    const text = TEACHER_AGREEMENT_SECTIONS.map((s) => `${s.title} ${s.body}`).join(" ");
    for (const part of ["ملكية", "كتب وزارة التربية", "النسبة والرسوم", "الاسترداد", "التسويات", "بيانات الطلاب", "إخفاء المحتوى", "إنهاء التعامل"]) expect(text).toContain(part);
    expect(text).toContain(`${ar(REFUND_HOLD_DAYS)} أيام`);
    expect(text).toContain("لا تحفظ المنصة بيانات حسابك البنكي");
    expect(text).toContain("لا يوجد موعد تلقائي للتسوية ولا تحويل آلي");
  });

  it("uses no long dashes", () => {
    for (const s of [TEACHER_AGREEMENT_DRAFT_NOTICE, RIGHTS_ATTESTATION_TEXT, ...TEACHER_AGREEMENT_SECTIONS.flatMap((x) => [x.title, x.body])]) expect(s).not.toMatch(/[—–]/);
  });
});
