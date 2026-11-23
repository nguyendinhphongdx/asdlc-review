import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelRun } from "./api.js";

/** Nút dừng một lần review đang chờ/đang chạy (hai bước để không bấm nhầm; tiến trình AI đang chạy sẽ bị kill). */
export function StopButton({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const [ask, setAsk] = useState(false);
  const stop = useMutation({
    mutationFn: () => cancelRun(runId),
    onSettled: () => { setAsk(false); void qc.invalidateQueries({ queryKey: ["run", runId] }); void qc.invalidateQueries({ queryKey: ["runs"] }); },
  });
  if (stop.isSuccess) return <span className="text-xs text-muted-foreground">Đang dừng…</span>;
  if (!ask) return <Button size="sm" variant="outline" onClick={() => setAsk(true)} aria-label="Dừng review"><Square className="size-3 fill-current" aria-hidden="true" />Dừng</Button>;
  return (
    <span className="inline-flex items-center gap-1.5" role="group" aria-label="Xác nhận dừng review">
      <span className="text-xs text-muted-foreground">Dừng review này?</span>
      <Button size="sm" variant="destructive" disabled={stop.isPending} onClick={() => stop.mutate()}>{stop.isPending ? "Đang dừng…" : "Dừng"}</Button>
      <Button size="sm" variant="ghost" disabled={stop.isPending} onClick={() => setAsk(false)}>Không</Button>
    </span>
  );
}
