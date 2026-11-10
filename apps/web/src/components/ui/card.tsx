import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)} {...p} />
);
export const CardHeader = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("flex flex-col gap-0.5 p-5 pb-3", className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.ComponentProps<"h2">) => <h2 className={cn("text-base font-semibold leading-6", className)} {...p} />;
export const CardDescription = ({ className, ...p }: React.ComponentProps<"p">) => <p className={cn("text-[13px] text-muted-foreground", className)} {...p} />;
export const CardContent = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("p-5 pt-0", className)} {...p} />;
