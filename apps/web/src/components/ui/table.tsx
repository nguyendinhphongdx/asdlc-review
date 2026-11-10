import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = ({ className, ...p }: React.ComponentProps<"table">) => (
  <div className="w-full overflow-x-auto"><table className={cn("w-full border-collapse text-sm", className)} {...p} /></div>
);
export const TableHeader = (p: React.ComponentProps<"thead">) => <thead {...p} />;
export const TableBody = (p: React.ComponentProps<"tbody">) => <tbody className="[&_tr:last-child_td]:border-0" {...p} />;
export const TableRow = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("transition-colors hover:bg-muted", className)} {...p} />;
export const TableHead = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("whitespace-nowrap border-b px-4 py-2.5 text-left text-xs font-medium text-muted-foreground", className)} {...p} />
);
export const TableCell = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("border-b px-4 py-3 align-middle", className)} {...p} />;
