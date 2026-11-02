import { catalogOptions } from "@/server/admin/products";
import { getSettings } from "@/server/platform/settings";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { Alert } from "@/components/ui/alert";
import { PRODUCT_TYPES, type ProductType } from "@/lib/labels";
import { createProductAction } from "../actions";

export const metadata = { title: "إضافة منتج" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ type?: string; grade?: string; subject?: string }> }) {
  const sp = await searchParams;
  const [{ grades, subjects }, settings] = await Promise.all([catalogOptions(), getSettings()]);
  const type = (PRODUCT_TYPES.includes(sp.type as ProductType) ? sp.type : "final_notes") as ProductType;
  const gradeId = grades.find((g) => g.id === sp.grade)?.id ?? "";
  const subjectId = subjects.find((s) => s.id === sp.subject && s.grade_id === gradeId)?.id ?? "";
  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title={type === "bundle" ? "باقة جديدة" : "إضافة منتج جديد"}
        description="املأ البيانات الأساسية ثم احفظ — بعدها ترفع الملفات والغلاف وتنشر المنتج."
        crumbs={[{ label: "المذكرات والمنتجات", href: "/admin/products" }, { label: "إضافة منتج" }]}
      />
      {grades.length === 0 ? (
        <Alert tone="warning" title="لا توجد صفوف بعد">أضف المراحل والصفوف والمواد من صفحة «المراحل والمواد» أولًا.</Alert>
      ) : (
        <ProductForm
          mode="create"
          action={createProductAction}
          grades={grades}
          subjects={subjects}
          submitLabel="حفظ كمسودة ومتابعة رفع الملفات"
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
            price: "",
            compareAtPrice: "",
            isDownloadable: false,
            isFeatured: false,
            previewPages: "3",
            sortOrder: "0",
            slug: "",
          }}
        />
      )}
    </div>
  );
}
