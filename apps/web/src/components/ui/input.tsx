import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input type={type} className={cn("h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)} {...props} />
  );
}

/** Select gốc của trình duyệt, tô theo token (đủ dùng cho dashboard nội bộ). */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn("h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />;
}
