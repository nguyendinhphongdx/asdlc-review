import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Card, ErrorBox, Loading, PageHeader, inputCls } from "../../kernel/ui.js";
import { getFrameworks, getHealth, getProviders, getSettings, saveSettings } from "./api.js";

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
  const row = "flex items-center justify-between border-t border-slate-100 py-2 first:border-0 text-sm";
  return (
    <>
      <PageHeader title="Cài đặt" />
      <Card title="Review">
        <div className={row}><span>AI provider</span>
          <select className={inputCls} value={v.reviewProvider} onChange={(e) => save.mutate({ reviewProvider: e.target.value as typeof v.reviewProvider })}>
            {(p.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.label}{x.available ? "" : " (chưa sẵn sàng)"}</option>)}
          </select></div>
        <div className={row}><span>Framework mặc định</span>
          <select className={inputCls} value={v.defaultFramework} onChange={(e) => save.mutate({ defaultFramework: e.target.value })}>
            {(f.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} v{x.version}</option>)}
          </select></div>
        <div className={row}><span>Đăng comment lên MR</span><input type="checkbox" checked={v.publishComments} onChange={(e) => save.mutate({ publishComments: e.target.checked })} /></div>
        <div className={row}><span>Mức tối thiểu để comment inline</span>
          <select className={inputCls} value={v.inlineMinSeverity} onChange={(e) => save.mutate({ inlineMinSeverity: e.target.value as typeof v.inlineMinSeverity })}>
            {["blocker", "critical", "major", "minor", "nit"].map((x) => <option key={x}>{x}</option>)}
          </select></div>
        <div className={row}><span>Số comment inline tối đa</span><input className={`${inputCls} w-24`} type="number" defaultValue={v.maxInlineComments} onBlur={(e) => save.mutate({ maxInlineComments: Number(e.target.value) })} /></div>
        <div className={row}><span>Điểm đạt</span><input className={`${inputCls} w-24`} type="number" defaultValue={v.passScore} onBlur={(e) => save.mutate({ passScore: Number(e.target.value) })} /></div>
        {save.error && <ErrorBox error={save.error} />}
      </Card>
      <Card className="mt-4" title="Hệ thống">
        {h.data && <div className="flex flex-wrap gap-2 text-sm">
          <Badge className="bg-slate-100">Queue: {h.data.queue}</Badge>
          <Badge className={h.data.gitlab.configured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100"}>GitLab {h.data.gitlab.configured ? "đã cấu hình" : "chưa cấu hình"}</Badge>
          <Badge className={h.data.github.configured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100"}>GitHub {h.data.github.configured ? "đã cấu hình" : "chưa cấu hình"}</Badge>
        </div>}
      </Card>
    </>
  );
}
