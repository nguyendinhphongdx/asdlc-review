import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Nút sao chép; `getValue` có thể async (vd lấy secret theo yêu cầu). Giá trị không được lưu lại. */
export function CopyButton({ getValue, label = "Sao chép", disabled }: { getValue: () => string | null | undefined | Promise<string | null | undefined>; label?: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async () => {
    try {
      const v = await getValue();
      if (!v) throw new Error("empty");
      await navigator.clipboard.writeText(v);
      setState("done");
    } catch { setState("fail"); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void run()}>
      {state === "done" ? <Check /> : <Copy />}
      <span aria-live="polite">{state === "done" ? "Đã chép" : state === "fail" ? "Không chép được" : label}</span>
    </Button>
  );
}
