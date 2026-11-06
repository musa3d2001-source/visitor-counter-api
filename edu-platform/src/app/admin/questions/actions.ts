"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors } from "@/lib/validation";
import { PermissionError } from "@/server/auth/permissions";
import { AdminError, bool, isUuid, staffAction, str } from "@/server/admin/common";
import { questionInputSchema } from "@/server/questions/rules";
import {
  approveQuestion,
  createQuestion,
  deleteOrArchiveQuestion,
  returnQuestion,
  reviseQuestion,
  setQuestionPaused,
  submitQuestion,
  updateQuestion,
  withdrawQuestion,
} from "@/server/questions/bank";

/**
 * إجراءات بنك الأسئلة للمالك والمعلم. نطاق المعلم (أسئلته ومواده والمسودة فقط) تفرضه دوال الخادم،
 * والإجراءات الخاصة بالمالك تتحقق منه هنا أيضًا كخط أول.
 */

// ---------------------------------------------------------------- أدوات داخلية

/** أقصى عدد للخيارات في النموذج (choice1..choice4) */
const MAX_CHOICES = 4;

/** يحوّل حقول النموذج إلى شكل مدخلات questionInputSchema (الأرقام نصوص يحوّلها المخطط) */
function questionInputFromForm(fd: FormData) {
  const type = str(fd, "type");
  const correct = str(fd, "correct");
  // الخيارات المعروضة فقط وبترتيبها: الفهرس i في المصفوفة = الحقل choice{i+1} (لربط الخطأ بالحقل)
  const choices: { text: string; isCorrect: boolean }[] = [];
  if (type === "mcq") {
    for (let i = 1; i <= MAX_CHOICES; i++) {
      if (!fd.has(`choice${i}`)) break;
      choices.push({ text: str(fd, `choice${i}`), isCorrect: correct === String(i) });
    }
  }
  const tf = str(fd, "trueFalseAnswer");
  return {
    lessonId: str(fd, "lessonId"),
    page: str(fd, "page"),
    exerciseRef: str(fd, "exerciseRef") || undefined,
    sourceKind: str(fd, "sourceKind"),
    type,
    lang: str(fd, "lang"),
    stem: str(fd, "stem"),
    explanation: str(fd, "explanation"),
    hint: str(fd, "hint") || undefined,
    difficulty: str(fd, "difficulty"),
    choices,
    trueFalseAnswer: type === "true_false" && (tf === "true" || tf === "false") ? tf : undefined,
    rightsConfirmed: bool(fd, "rightsConfirmed"),
  };
}

/** تحقق مبكر لعرض كل أخطاء الحقول معًا برسائل أوضح (الخادم يتحقق مرة أخرى) */
function precheck(input: ReturnType<typeof questionInputFromForm>) {
  const r = questionInputSchema.safeParse(input);
  if (r.success) return;
  const fe = fieldErrors(r.error);
  if (fe.lessonId && !input.lessonId) fe.lessonId = "اختر الدرس";
  if (fe.page && !input.page) fe.page = "اكتب رقم الصفحة";
  if (fe.sourceKind && !input.sourceKind) fe.sourceKind = "اختر مصدر السؤال";
  if (fe.difficulty && !input.difficulty) fe.difficulty = "اختر الصعوبة";
  throw new AdminError("راجع الحقول المظللة", fe);
}

function revalidateQuestion(id?: string | null) {
  if (id) revalidatePath(`/admin/questions/${id}`);
  revalidatePath("/admin/questions");
  revalidatePath("/admin/review");
  // شارة المراجعة في الشريط الجانبي (التخطيط)
  revalidatePath("/admin", "layout");
}

function idFrom(fd: FormData): string {
  const id = str(fd, "id");
  if (!isUuid(id)) throw new AdminError("طلب غير صالح");
  return id;
}

// ---------------------------------------------------------------- الإنشاء والتعديل

export async function createQuestionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let createdId: string | null = null;
  const res = await staffAction(async ({ actor, ip }) => {
    const input = questionInputFromForm(fd);
    precheck(input);
    createdId = await createQuestion(input, actor, ip);
    revalidateQuestion(createdId);
    return { ok: true, message: "تم حفظ السؤال كمسودة" };
  });
  if (createdId) redirect(`/admin/questions/${createdId}?created=1`);
  return res;
}

export async function updateQuestionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    const id = idFrom(fd);
    const input = questionInputFromForm(fd);
    precheck(input);
    await updateQuestion(id, input, actor, ip);
    revalidateQuestion(id);
    return { ok: true, message: "تم حفظ التعديلات على المسودة" };
  });
}

// ---------------------------------------------------------------- سير الاعتماد

export async function submitQuestionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    const id = idFrom(fd);
    await submitQuestion(id, actor, ip);
    revalidateQuestion(id);
    return { ok: true, message: "أُرسل السؤال للمراجعة. يظهر للطلاب بعد اعتماده من إدارة المنصة." };
  });
}

export async function withdrawQuestionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    const id = idFrom(fd);
    await withdrawQuestion(id, actor, ip);
    revalidateQuestion(id);
    return { ok: true, message: "أُعيد السؤال إلى المسودات للتعديل" };
  });
}

export async function approveQuestionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let approvedId: string | null = null;
  const res = await staffAction(async ({ actor, ip }) => {
    if (actor.kind !== "owner") throw new PermissionError("اعتماد الأسئلة متاح لإدارة المنصة فقط");
    const id = idFrom(fd);
    await approveQuestion(id, actor, ip);
    revalidateQuestion(id);
    approvedId = id;
    return { ok: true, message: "تم اعتماد السؤال ونشره" };
  });
  if (approvedId) redirect(`/admin/questions/${approvedId}?approved=1`);
  return res;
}

export async function returnQuestionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let returnedId: string | null = null;
  const res = await staffAction(async ({ actor, ip }) => {
    if (actor.kind !== "owner") throw new PermissionError("مراجعة الأسئلة متاحة لإدارة المنصة فقط");
    const id = idFrom(fd);
    await returnQuestion(id, str(fd, "reason"), actor, ip);
    revalidateQuestion(id);
    returnedId = id;
    return { ok: true, message: "أُعيد السؤال للمعلم مع الملاحظات" };
  });
  if (returnedId) redirect(`/admin/questions/${returnedId}?returned=1`);
  return res;
}

/** نسخة معدّلة من سؤال منشور: ينتقل إلى المسودة الجديدة (أو المفتوحة إن وُجدت) */
export async function reviseQuestionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let draftId: string | null = null;
  const res = await staffAction(async ({ actor, ip }) => {
    const id = idFrom(fd);
    draftId = await reviseQuestion(id, actor, ip);
    revalidateQuestion(id);
    revalidateQuestion(draftId);
    return { ok: true, message: "أُنشئت نسخة معدّلة كمسودة" };
  });
  if (draftId) redirect(`/admin/questions/${draftId}?revised=1`);
  return res;
}

export async function setQuestionPausedAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    if (actor.kind !== "owner") throw new PermissionError("إيقاف الأسئلة متاح لإدارة المنصة فقط");
    const id = idFrom(fd);
    const paused = str(fd, "paused") === "1";
    await setQuestionPaused(id, paused, actor, ip);
    revalidateQuestion(id);
    return { ok: true, message: paused ? "أُوقف تقديم السؤال للطلاب مؤقتًا" : "أُعيد تفعيل السؤال للطلاب" };
  });
}

/** حذف المسودة نهائيًا، أو أرشفة ما سواها (المالك) */
export async function deleteQuestionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let deleted = false;
  const res = await staffAction(async ({ actor, ip }) => {
    const id = idFrom(fd);
    const outcome = await deleteOrArchiveQuestion(id, actor, ip);
    revalidateQuestion(id);
    deleted = outcome === "deleted";
    return { ok: true, message: deleted ? "تم حذف المسودة نهائيًا" : "تمت أرشفة السؤال" };
  });
  if (deleted) redirect("/admin/questions?deleted=1");
  return res;
}
