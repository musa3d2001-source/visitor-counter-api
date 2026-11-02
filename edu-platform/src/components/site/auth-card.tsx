import { GraduationCap } from "lucide-react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
