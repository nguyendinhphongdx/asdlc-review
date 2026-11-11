import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { ErrorBox, Loading } from "../../kernel/page.js";
import { getFrameworks, getHealth, getProviders, getSettings, saveSettings } from "./api.js";

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-4 border-t py-3 first:border-0 first:pt-0"><span className="min-w-0"><span className="block">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>{children}</div>
);
const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <input aria-label={label} type="checkbox" className="size-4 flex-none accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
);

export function ReviewTab() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const p = useQuery({ queryKey: ["providers"], queryFn: getProviders });
  const f = useQuery({ queryKey: ["frameworks"], queryFn: getFrameworks });
  const h = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const save = useMutation({ mutationFn: saveSettings, onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }) });
  if (s.isLoading) return <Loading />;
  if (s.error) return <ErrorBox error={s.error} />;
  const v = s.data!;
  const num = (raw: string, min: number, apply: (n: number) => void) => { const n = Number(raw); if (raw.trim() !== "" && Number.isFinite(n) && n >= min) apply(Math.round(n)); };
  return (
    <>
      <Card><CardHeader><CardTitle>Review</CardTitle></CardHeader><CardContent>
        <Row label="AI provider"><Select aria-label="AI provider" value={v.reviewProvider} onChange={(e) => save.mutate({ reviewProvider: e.target.value as typeof v.reviewProvider })}>
          {(p.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.label}{x.available ? "" : " (chưa sẵn sàng)"}</option>)}</Select></Row>
        <Row label="Framework mặc định"><Select aria-label="Framework mặc định" value={v.defaultFramework} onChange={(e) => save.mutate({ defaultFramework: e.target.value })}>
          {(f.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} v{x.version}</option>)}</Select></Row>
        <Row label="Đăng comment lên MR" hint="Tắt để chỉ xem kết quả trên dashboard (chế độ thử)."><Check label="Đăng comment" checked={v.publishComments} onChange={(c) => save.mutate({ publishComments: c })} /></Row>
        <Row label="Mức tối thiểu để comment inline"><Select aria-label="Mức tối thiểu để comment inline" value={v.inlineMinSeverity} onChange={(e) => save.mutate({ inlineMinSeverity: e.target.value as typeof v.inlineMinSeverity })}>
          {["blocker", "critical", "major", "minor", "nit"].map((x) => <option key={x}>{x}</option>)}</Select></Row>
        <Row label="Số comment inline tối đa"><Input aria-label="Số comment inline" className="w-24" type="number" min={0} key={`i${v.maxInlineComments}`} defaultValue={v.maxInlineComments} onBlur={(e) => num(e.target.value, 0, (n) => n !== v.maxInlineComments && save.mutate({ maxInlineComments: n }))} /></Row>
        <Row label="Điểm đạt"><Input aria-label="Điểm đạt" className="w-24" type="number" min={0} max={100} key={`p${v.passScore}`} defaultValue={v.passScore} onBlur={(e) => num(e.target.value, 0, (n) => n !== v.passScore && save.mutate({ passScore: n }))} /></Row>
        {save.error && <div className="mt-3"><ErrorBox error={save.error} /></div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Giới hạn khi review</CardTitle><CardDescription>Kiểm soát chi phí và thời gian trên MR lớn.</CardDescription></CardHeader><CardContent>
        <Row label="Bỏ qua MR nháp (Draft/WIP)" hint="MR có tiền tố Draft:/WIP: sẽ không được review cho tới khi sẵn sàng."><Check label="Bỏ qua MR nháp" checked={v.skipDrafts} onChange={(c) => save.mutate({ skipDrafts: c })} /></Row>
        <Row label="Ngân sách diff (ký tự)" hint="Vượt mức này, file ưu tiên thấp bị bỏ qua."><Input aria-label="Ngân sách diff (ký tự)" className="w-32" type="number" min={1000} step={1000} key={`b${v.diffBudgetChars}`} defaultValue={v.diffBudgetChars} onBlur={(e) => num(e.target.value, 1000, (n) => n !== v.diffBudgetChars && save.mutate({ diffBudgetChars: n }))} /></Row>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Hệ thống</CardTitle></CardHeader><CardContent>
        {h.data && <div className="flex flex-wrap gap-2">
          <Badge>Queue: {h.data.queue}</Badge>
          <Badge variant={h.data.gitlab.configured ? "success" : "secondary"}>GitLab {h.data.gitlab.configured ? "đã cấu hình" : "chưa cấu hình"}</Badge>
          <Badge variant={h.data.github.configured ? "success" : "secondary"}>GitHub {h.data.github.configured ? "đã cấu hình" : "chưa cấu hình"}</Badge>
        </div>}
      </CardContent></Card>
    </>
  );
}
