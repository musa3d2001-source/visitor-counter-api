import type * as React from "react";
import { cn } from "@/lib/utils";

/** حقول دافئة: ارتفاع ٤٨px، تعبئة كريمية خفيفة، حلقة تركيز فيروزية، وحد أحمر عند الخطأ */
const fieldBase =
  "w-full rounded-[0.9rem] border border-line-strong bg-field px-4 text-base text-ink shadow-[inset_0_1px_2px_rgb(23_32_38/0.04)] placeholder:text-muted/75 transition-[border-color,box-shadow,background-color] duration-150 hover:border-brand-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger-50";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-28 py-3 leading-8", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(fieldBase, "h-12 cursor-pointer appearance-none bg-[length:1.05rem] bg-[left_0.8rem_center] bg-no-repeat ps-4 pe-9 rtl:bg-[left_0.8rem_center] ltr:bg-[right_0.8rem_center]", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230a6b66' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-2 block font-display text-[0.92rem] font-bold text-ink", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
  required,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[0.82rem] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: React.ComponentProps<"input"> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-[0.95rem] text-ink-soft", className)}>
      <input type="checkbox" className="size-5 shrink-0 cursor-pointer rounded-md border-line-strong accent-[var(--brand)]" {...props} />
      <span>{label}</span>
    </label>
  );
}
