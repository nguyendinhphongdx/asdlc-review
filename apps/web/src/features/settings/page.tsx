import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { getFrameworks, getHealth, getProviders, getSettings, saveSettings } from "./api.js";

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-4 border-t py-3 first:border-0 first:pt-0"><span>{label}</span>{children}</div>
);

export function SettingsPage() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const p = useQuery({ queryKey: ["providers"], queryFn: getProviders });
  const f = useQuery({ queryKey: ["frameworks"], queryFn: getFrameworks });
  const h = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const save = useMutation({ mutationFn: saveSettings, onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }) });
  if (s.isLoading) return <Loading />;
  if (s.error) return <ErrorBox error={s.error} />;
  const v = s.data!;
  return (
    <>
      <PageHeader title="Cài đặt" description="Cấu hình AI, framework và cách đăng comment lên MR." />
      <Card><CardHeader><CardTitle>Review</CardTitle></CardHeader><CardContent>
        <Row label="AI provider"><Select value={v.reviewProvider} onChange={(e) => save.mutate({ reviewProvider: e.target.value as typeof v.reviewProvider })}>
          {(p.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.label}{x.available ? "" : " (chưa sẵn sàng)"}</option>)}</Select></Row>
        <Row label="Framework mặc định"><Select value={v.defaultFramework} onChange={(e) => save.mutate({ defaultFramework: e.target.value })}>
          {(f.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} v{x.version}</option>)}</Select></Row>
        <Row label="Đăng comment lên MR"><input aria-label="Đăng comment" type="checkbox" className="size-4 accent-[var(--primary)]" checked={v.publishComments} onChange={(e) => save.mutate({ publishComments: e.target.checked })} /></Row>
        <Row label="Mức tối thiểu để comment inline"><Select value={v.inlineMinSeverity} onChange={(e) => save.mutate({ inlineMinSeverity: e.target.value as typeof v.inlineMinSeverity })}>
          {["blocker", "critical", "major", "minor", "nit"].map((x) => <option key={x}>{x}</option>)}</Select></Row>
        <Row label="Số comment inline tối đa"><Input aria-label="Số comment inline" className="w-24" type="number" defaultValue={v.maxInlineComments} onBlur={(e) => save.mutate({ maxInlineComments: Number(e.target.value) })} /></Row>
        <Row label="Điểm đạt"><Input aria-label="Điểm đạt" className="w-24" type="number" defaultValue={v.passScore} onBlur={(e) => save.mutate({ passScore: Number(e.target.value) })} /></Row>
        {save.error && <ErrorBox error={save.error} />}
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
