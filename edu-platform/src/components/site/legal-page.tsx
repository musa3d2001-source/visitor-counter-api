import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

/** الصفحات القانونية: رأس مشمس (PageHeader) + لوح أبيض بنص مريح (‎.prose-sunny‎) */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: title }]}
        eyebrow={{ icon: <ScrollText aria-hidden />, label: "صفحات المنصة" }}
        className="[&>div]:max-w-3xl"
      />
      <div className="mx-auto -mt-6 max-w-3xl px-4 sm:px-6">
        <div className="panel panel-rainbow prose-sunny px-5 pt-10 pb-8 text-[1.02rem] sm:px-10 sm:pt-12 sm:pb-10">{children}</div>
      </div>
    </>
  );
}
