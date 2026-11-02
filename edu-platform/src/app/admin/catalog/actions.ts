"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors, slugSchema } from "@/lib/validation";
import { SUBJECT_ICONS } from "@/lib/labels";
import { sql } from "@/server/db";
import { audit } from "@/server/platform/audit";
import { AdminError, adminAction, bool, int, isUuid, str } from "@/server/admin/common";

function done(message = "تم الحفظ") {
  revalidatePath("/admin/catalog");
  revalidatePath("/", "layout");
  return { ok: true, message };
}

const nameSchema = z.string().trim().min(2, "الاسم قصير جدًا").max(80, "الاسم طويل جدًا");

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new AdminError(r.error.issues[0]?.message ?? "بيانات غير صحيحة", fieldErrors(r.error));
  return r.data;
}

// ---------------------------------------------------------------- المراحل
const stageSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: z.string().trim().max(500),
  sortOrder: z.number().int(),
  isPublished: z.boolean(),
});

export async function saveStageAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const id = str(fd, "id");
    const d = parseOrThrow(stageSchema, {
      name: str(fd, "name"),
      slug: str(fd, "slug"),
      description: str(fd, "description"),
      sortOrder: int(fd, "sortOrder"),
      isPublished: bool(fd, "isPublished"),
    });
    if (id) {
      if (!isUuid(id)) throw new AdminError("طلب غير صالح");
      await sql`update stages set name = ${d.name}, slug = ${d.slug}, description = ${d.description}, sort_order = ${d.sortOrder}, is_published = ${d.isPublished} where id = ${id}`;
    } else {
      await sql`insert into stages (name, slug, description, sort_order, is_published) values (${d.name}, ${d.slug}, ${d.description}, ${d.sortOrder}, ${d.isPublished})`;
    }
    await audit({ actorId: adminId, action: id ? "catalog.stage_update" : "catalog.stage_create", entityType: "stage", entityId: id || d.slug, metadata: d });
    return done(id ? "تم حفظ المرحلة" : "تمت إضافة المرحلة");
  });
}

// ---------------------------------------------------------------- الصفوف
const gradeSchema = z.object({
  stageId: z.string().uuid("اختر المرحلة"),
  name: nameSchema,
  slug: slugSchema,
  level: z.number().int().min(1, "رقم الصف من 1 إلى 12").max(12, "رقم الصف من 1 إلى 12"),
  currentTerm: z.union([z.literal(1), z.literal(2)]),
  sortOrder: z.number().int(),
  isPublished: z.boolean(),
});

export async function saveGradeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const id = str(fd, "id");
    const d = parseOrThrow(gradeSchema, {
      stageId: str(fd, "stageId"),
      name: str(fd, "name"),
      slug: str(fd, "slug"),
      level: int(fd, "level"),
      currentTerm: int(fd, "currentTerm", 1) === 2 ? 2 : 1,
      sortOrder: int(fd, "sortOrder"),
      isPublished: bool(fd, "isPublished"),
    });
    if (id) {
      if (!isUuid(id)) throw new AdminError("طلب غير صالح");
      await sql`
        update grades set stage_id = ${d.stageId}, name = ${d.name}, slug = ${d.slug}, level = ${d.level},
          current_term = ${d.currentTerm}, sort_order = ${d.sortOrder}, is_published = ${d.isPublished}
        where id = ${id}
      `;
    } else {
      await sql`
        insert into grades (stage_id, name, slug, level, current_term, sort_order, is_published)
        values (${d.stageId}, ${d.name}, ${d.slug}, ${d.level}, ${d.currentTerm}, ${d.sortOrder}, ${d.isPublished})
      `;
    }
    await audit({ actorId: adminId, action: id ? "catalog.grade_update" : "catalog.grade_create", entityType: "grade", entityId: id || d.slug, metadata: d });
    return done(id ? "تم حفظ الصف" : "تمت إضافة الصف");
  });
}

// ---------------------------------------------------------------- المواد
const subjectSchema = z.object({
  gradeId: z.string().uuid("اختر الصف"),
  name: nameSchema,
  slug: slugSchema,
  icon: z.enum(SUBJECT_ICONS),
  sortOrder: z.number().int(),
  isPublished: z.boolean(),
});

export async function saveSubjectAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const id = str(fd, "id");
    const d = parseOrThrow(subjectSchema, {
      gradeId: str(fd, "gradeId"),
      name: str(fd, "name"),
      slug: str(fd, "slug"),
      icon: str(fd, "icon") || "book",
      sortOrder: int(fd, "sortOrder"),
      isPublished: bool(fd, "isPublished"),
    });
    if (id) {
      if (!isUuid(id)) throw new AdminError("طلب غير صالح");
      const [cur] = await sql<{ grade_id: string }[]>`select grade_id from subjects where id = ${id}`;
      if (!cur) throw new AdminError("المادة غير موجودة");
      if (cur.grade_id !== d.gradeId) {
        const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from products where subject_id = ${id}`;
        if (n > 0) throw new AdminError("لا يمكن نقل مادة لصف آخر وهي تحتوي منتجات");
      }
      await sql`
        update subjects set grade_id = ${d.gradeId}, name = ${d.name}, slug = ${d.slug}, icon = ${d.icon},
          sort_order = ${d.sortOrder}, is_published = ${d.isPublished}
        where id = ${id}
      `;
    } else {
      await sql`
        insert into subjects (grade_id, name, slug, icon, sort_order, is_published)
        values (${d.gradeId}, ${d.name}, ${d.slug}, ${d.icon}, ${d.sortOrder}, ${d.isPublished})
      `;
    }
    await audit({ actorId: adminId, action: id ? "catalog.subject_update" : "catalog.subject_create", entityType: "subject", entityId: id || d.slug, metadata: d });
    return done(id ? "تم حفظ المادة" : "تمت إضافة المادة");
  });
}

// ---------------------------------------------------------------- إظهار/إخفاء/حذف
const TABLES = { stage: "stages", grade: "grades", subject: "subjects" } as const;

export async function togglePublishAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const kind = str(fd, "kind") as keyof typeof TABLES;
    const id = str(fd, "id");
    if (!(kind in TABLES) || !isUuid(id)) throw new AdminError("طلب غير صالح");
    const publish = str(fd, "publish") === "1";
    await sql`update ${sql(TABLES[kind])} set is_published = ${publish} where id = ${id}`;
    await audit({ actorId: adminId, action: `catalog.${kind}_${publish ? "show" : "hide"}`, entityType: kind, entityId: id });
    return done(publish ? "أصبح ظاهرًا للطلاب (عند وجود منتجات منشورة)" : "تم الإخفاء عن الطلاب");
  });
}

export async function deleteCatalogAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const kind = str(fd, "kind") as keyof typeof TABLES;
    const id = str(fd, "id");
    if (!(kind in TABLES) || !isUuid(id)) throw new AdminError("طلب غير صالح");
    if (kind === "stage") {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from grades where stage_id = ${id}`;
      if (n > 0) throw new AdminError("المرحلة تحتوي صفوفًا. احذف الصفوف أولًا أو استخدم الإخفاء.");
    }
    if (kind === "grade") {
      const [{ p, s }] = await sql<{ p: number; s: number }[]>`
        select (select count(*)::int from products where grade_id = ${id}) as p, (select count(*)::int from subjects where grade_id = ${id}) as s
      `;
      if (p > 0) throw new AdminError("الصف يحتوي منتجات — استخدم الإخفاء بدل الحذف.");
      if (s > 0) throw new AdminError("الصف يحتوي مواد. احذف المواد أولًا أو استخدم الإخفاء.");
      await sql`update users set grade_id = null where grade_id = ${id}`;
    }
    if (kind === "subject") {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from products where subject_id = ${id}`;
      if (n > 0) throw new AdminError("المادة تحتوي منتجات — استخدم الإخفاء بدل الحذف.");
    }
    await sql`delete from ${sql(TABLES[kind])} where id = ${id}`;
    await audit({ actorId: adminId, action: `catalog.${kind}_delete`, entityType: kind, entityId: id });
    return done("تم الحذف");
  });
}
