import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { checkFileAccess } from "@/server/access/entitlements";
import { sql } from "@/server/db";
import { PdfReader } from "@/components/reader/pdf-reader";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "قارئ المذكرات", robots: { index: false, follow: false } };

export default async function ReadPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const user = await requireUser();
  const access = await checkFileAccess(fileId, user);
  if (!access.ok) {
    if (access.reason === "not_found") notFound();
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Alert tone="danger" title="لا تملك صلاحية فتح هذا الملف">
          إذا اشتريت هذه المذكرة بحساب آخر، سجّل الدخول به. <Link href="/library">العودة إلى مكتبتي</Link>
        </Alert>
      </div>
    );
  }
  if (access.file.kind !== "main") notFound();
  const [progress] = await sql<{ last_page: number }[]>`
    select last_page from reading_progress where user_id = ${user.id} and file_id = ${fileId}
  `;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuwait" }).format(new Date());
  return (
    <PdfReader
      src={`/api/files/${fileId}`}
      title={access.file.title}
      backHref="/library"
      backLabel="مكتبتي"
      initialPage={progress?.last_page ?? 1}
      watermark={`${user.email} · ${date}`}
      downloadHref={access.product.isDownloadable ? `/api/files/${fileId}?download=1` : null}
      progressFileId={fileId}
      badge={access.product.isDownloadable ? "متاح للتنزيل" : "للقراءة داخل المنصة"}
    />
  );
}
