import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: title }]} />
      <h1 className="mt-4 text-3xl font-bold">{title}</h1>
      <div className="mt-6 space-y-5 rounded-2xl border border-line bg-surface p-6 leading-8 text-ink-soft shadow-card [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ms-5 [&_li]:list-disc">
        {children}
      </div>
    </div>
  );
}
