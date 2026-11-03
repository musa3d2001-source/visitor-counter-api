import type * as React from "react";
import { cn } from "@/lib/utils";

/** جدول أبيض بزوايا ٢٤ وظل دافئ، رأس كريمي بخط Cairo، وتمرير أفقي داخلي على الجوال */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-[rgb(23_32_38/0.06)] bg-surface shadow-card">
      <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function THead(props: React.ComponentProps<"thead">) {
  return <thead className="bg-mist/70 font-display text-[0.82rem] text-ink-soft" {...props} />;
}
export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("px-4 py-3.5 text-start font-extrabold whitespace-nowrap first:ps-5 last:pe-5", className)} {...props} />;
}
export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-t border-line transition-colors hover:bg-canvas", className)} {...props} />;
}
export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3.5 align-middle first:ps-5 last:pe-5", className)} {...props} />;
}
