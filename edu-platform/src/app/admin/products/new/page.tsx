import { catalogOptions, teacherOptions } from "@/server/admin/products";
import { requireStaff } from "@/server/auth/permissions";
import { teacherSubjectIds } from "@/server/admin/teachers";
import { getSettings } from "@/server/platform/settings";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { Alert } from "@/components/ui/alert";
import { PRODUCT_TYPES, type ProductType } from "@/lib/labels";
import { createProductAction } from "../actions";

export const metadata = { title: "إضافة محتوى" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ type?: string; grade?: string; subject?: string; teacher?: string }> }) {
  const actor = await requireStaff();
  const owner = actor.kind === "owner";
  const sp = await searchParams;
  const [{ grades, subjects: allSubjects }, settings, teachers] = await Promise.all([catalogOptions(), getSettings(), owner ? teacherOptions() : Promise.resolve([])]);

  // المعلم يرى المواد التي يدرّسها فقط (إن حددها المالك)، وإلا كل المواد
  let subjects = allSubjects;
  let gradeList = grades;
  if (actor.kind === "teacher") {
    const mine = new Set(await teacherSubjectIds(actor.teacherId));
    if (mine.size) {
      subjects = allSubjects.filter((s) => mine.has(s.id));
      const gradeIds = new Set(subjects.map((s) => s.grade_id));
      gradeList = grades.filter((g) => gradeIds.has(g.id));
    }
  }

  const defaultType: ProductType = "unit";
  const type = (PRODUCT_TYPES.includes(sp.type as ProductType) ? sp.type : defaultType) as ProductType;
  const gradeId = gradeList.find((g) => g.id === sp.grade)?.id ?? "";
  const subjectId = subjects.find((s) => s.id === sp.subject && s.grade_id === gradeId)?.id ?? "";
  const teacherId = owner ? (teachers.find((t) => t.id === sp.teacher)?.id ?? "") : "";

  if (actor.kind === "teacher" && !actor.canUpload) {
    return (
      <div className="max-w-2xl">
        <AdminPageHeader title="إضافة محتوى" crumbs={[{ label: "محتواي", href: "/admin/products" }, { label: "إضافة محتوى" }]} />
        <Alert tone="warning" title="صلاحية الرفع موقوفة">تواصل مع إدارة المنصة لإعادة تفعيل صلاحية إضافة المحتوى. محتواك الحالي لم يتأثر.</Alert>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title={type === "bundle" ? "باقة جديدة" : owner ? "إضافة منتج جديد" : "إضافة محتوى جديد"}
        description={
          owner
            ? "املأ البيانات الأساسية ثم احفظ — بعدها ترفع الفيديوهات أو الملفات وتنشر المنتج."
            : "احفظ المسودة أولًا، ثم ارفع الفيديوهات أو الملفات، وأرسلها للمراجعة. تُنشر بعد اعتمادها من إدارة المنصة."
        }
        crumbs={[{ label: owner ? "المحتوى والمنتجات" : "محتواي", href: "/admin/products" }, { label: "إضافة" }]}
      />
      {gradeList.length === 0 ? (
        <Alert tone="warning" title="لا توجد صفوف بعد">
          {owner ? "أضف المراحل والصفوف والمواد من صفحة «المراحل والمواد» أولًا." : "لم تُحدد لك مواد بعد. تواصل مع إدارة المنصة."}
        </Alert>
      ) : (
        <ProductForm
          mode="create"
          role={actor.kind}
          action={createProductAction}
          grades={gradeList}
          subjects={subjects}
          teachers={owner ? teachers : undefined}
          submitLabel="حفظ كمسودة ومتابعة الرفع"
          defaults={{
            type,
            title: "",
            summary: "",
            description: "",
            contents: "",
            gradeId,
            subjectId,
            academicYear: settings.academic_year,
            term: "1",
            price: owner ? "" : "0",
            compareAtPrice: "",
            proposedPrice: "",
            isDownloadable: false,
            isFeatured: false,
            previewPages: "3",
            sortOrder: "0",
            slug: "",
            teacherId,
            accessMode: "unlimited",
            accessUntil: "",
            accessDays: "",
          }}
        />
      )}
    </div>
  );
}
