import { ModelInput } from "../../kernel/model-input.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ErrorBox, Loading } from "../../kernel/page.js";
import { checkStorage, getStorage, getFrameworks, getHealth, getProviders, getSettings, saveSettings } from "./api.js";

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-4 border-t py-3 first:border-0 first:pt-0"><span className="min-w-0"><span className="block">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>{children}</div>
);
const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <input aria-label={label} type="checkbox" className="size-4 flex-none accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
);

const fmtBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`);

function StorageCard({ workDir, save }: { workDir: string; save: (p: { workDir: string }) => Promise<unknown> }) {
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["storage"], queryFn: getStorage });
  const [val, setVal] = useState(workDir);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const apply = useMutation({
    mutationFn: async (path: string) => {
      if (path.trim()) {
        const c = await checkStorage(path.trim());
        if (!c.ok) throw new Error(c.error ?? "Thư mục không dùng được");
      }
      await save({ workDir: path.trim() });
    },
    onSuccess: () => { setMsg({ ok: true, text: "Đã lưu. Repo clone từ lần review sau sẽ nằm ở thư mục mới (repo cũ không tự di chuyển)." }); void qc.invalidateQueries({ queryKey: ["storage"] }); },
    onError: (e) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <Card><CardHeader><CardTitle>Lưu trữ</CardTitle><CardDescription>Nơi app clone repo (bản bare, chỉ có lịch sử git) và dựng thư mục làm việc tạm khi review.</CardDescription></CardHeader><CardContent>
      <Row label="Thư mục lưu repo" hint="Để trống = dùng thư mục dữ liệu mặc định. App tạo thư mục con repos/ và runs/ bên trong.">
        <div className="flex gap-2"><Input aria-label="Thư mục lưu repo" className="w-80" placeholder={st.data?.dataDir ?? ""} value={val} onChange={(e) => { setVal(e.target.value); setMsg(null); }} />
          <Button size="sm" disabled={apply.isPending || val.trim() === workDir} onClick={() => apply.mutate(val)}>Lưu</Button>
          {workDir && <Button size="sm" variant="outline" disabled={apply.isPending} onClick={() => { setVal(""); apply.mutate(""); }}>Mặc định</Button>}</div>
      </Row>
      {msg && <p role="status" className={`pb-2 text-sm ${msg.ok ? "text-success-fg" : "text-danger-fg"}`}>{msg.text}</p>}
      {st.data && <dl className="grid gap-1 border-t pt-3 text-xs text-muted-foreground">
        <div>Repo clone: <code>{st.data.reposDir}</code> · {fmtBytes(st.data.reposBytes)}</div>
        <div>Thư mục làm việc tạm: <code>{st.data.runsDir}</code></div>
        <div>Dữ liệu app (cơ sở dữ liệu, khoá): <code>{st.data.dataDir}</code></div>
      </dl>}
    </CardContent></Card>
  );
}

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
        <Row label="Model" hint={v.reviewProvider === "claude-cli" ? "Model Claude dùng để review (vd claude-opus-5-5). Repo có thể chọn model riêng." : v.reviewProvider === "codex-cli" ? "Để trống = model mặc định của Codex CLI." : "Bắt buộc với OpenAI-compatible (tên model của server)."}>
          <ModelInput provider={v.reviewProvider} label="Model review" placeholder="(mặc định của provider)"
            value={v.reviewProvider === "claude-cli" ? v.claudeModel : v.reviewProvider === "codex-cli" ? v.codexModel : v.openaiModel}
            onCommit={(m) => save.mutate(v.reviewProvider === "claude-cli" ? { claudeModel: m } : v.reviewProvider === "codex-cli" ? { codexModel: m } : { openaiModel: m })} /></Row>
        <Row label="Model cho chat" hint="Model riêng cho trợ lý chat (nên rẻ/nhanh hơn model review). Để trống = dùng model review."><ModelInput provider={v.reviewProvider} label="Model chat" placeholder="(dùng model review)" value={v.chatModel} onCommit={(m) => save.mutate({ chatModel: m })} /></Row>
        <Row label="Framework mặc định"><Select aria-label="Framework mặc định" value={v.defaultFramework} onChange={(e) => save.mutate({ defaultFramework: e.target.value })}>
          {(f.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} v{x.version}</option>)}</Select></Row>
        <Row label="Điểm đạt"><Input aria-label="Điểm đạt" className="w-24" type="number" min={0} max={100} key={`p${v.passScore}`} defaultValue={v.passScore} onBlur={(e) => num(e.target.value, 0, (n) => n !== v.passScore && save.mutate({ passScore: n }))} /></Row>
        {save.error && <div className="mt-3"><ErrorBox error={save.error} /></div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Cách nhận MR mới</CardTitle><CardDescription>Quyết định khi nào app tự review. Chỉ áp dụng cho repo đã bật tự động review.</CardDescription></CardHeader><CardContent>
        <Row label="Chế độ" hint={v.triggerMode === "polling" ? "App tự hỏi GitLab định kỳ. Chạy được trên máy cá nhân/sau NAT, không cần webhook." : v.triggerMode === "webhook" ? "GitLab gọi về app ngay khi có MR. Cần PUBLIC_URL truy cập được từ internet (server/tunnel); localhost thì GitLab không gọi được." : "Không tự review; chỉ review khi bạn bấm hoặc comment /review."}>
          <Select aria-label="Chế độ nhận MR" value={v.triggerMode} onChange={(e) => save.mutate({ triggerMode: e.target.value as typeof v.triggerMode })}>
            <option value="polling">Quét định kỳ (polling)</option><option value="webhook">Webhook</option><option value="manual">Thủ công</option></Select></Row>
        {v.triggerMode === "polling" && <Row label="Chu kỳ quét (phút)" hint="Đừng đặt quá thấp để tránh bị GitLab giới hạn tốc độ (429)."><Input aria-label="Chu kỳ quét (phút)" className="w-24" type="number" min={1} max={120} key={`pm${v.pollIntervalMin}`} defaultValue={v.pollIntervalMin} onBlur={(e) => num(e.target.value, 1, (n) => n !== v.pollIntervalMin && n <= 120 && save.mutate({ pollIntervalMin: n }))} /></Row>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Giới hạn khi review</CardTitle><CardDescription>Kiểm soát chi phí và thời gian trên MR lớn.</CardDescription></CardHeader><CardContent>
        <Row label="Bỏ qua MR nháp (Draft/WIP)" hint="MR có tiền tố Draft:/WIP: sẽ không được review cho tới khi sẵn sàng."><Check label="Bỏ qua MR nháp" checked={v.skipDrafts} onChange={(c) => save.mutate({ skipDrafts: c })} /></Row>
        <Row label="Ngân sách diff (ký tự)" hint="Vượt mức này, file ưu tiên thấp bị bỏ qua."><Input aria-label="Ngân sách diff (ký tự)" className="w-32" type="number" min={1000} step={1000} key={`b${v.diffBudgetChars}`} defaultValue={v.diffBudgetChars} onBlur={(e) => num(e.target.value, 1000, (n) => n !== v.diffBudgetChars && save.mutate({ diffBudgetChars: n }))} /></Row>
      </CardContent></Card>
      <StorageCard workDir={v.workDir} save={(p) => save.mutateAsync(p)} />
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
