export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="mb-6 border-b-2 border-ink pb-5">
        <h1 className="text-[clamp(2rem,6vw,2.6rem)]">{title}</h1>
        {subtitle ? <p className="mt-2 leading-7 text-ink-soft">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
