import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Chú thích nhanh cho một phần tử quan trọng (hiện khi rê chuột hoặc focus bàn phím). `children` phải là một phần tử nhận được ref (button, span…). */
export function Tip({ text, side = "top", children }: { text: ReactNode; side?: "top" | "bottom" | "left" | "right"; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-[12.5px] leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}
