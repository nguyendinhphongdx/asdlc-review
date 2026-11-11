import type { RepoDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { ErrorBox, Loading } from "../../kernel/page.js";
import { getSettings, listFrameworks, patchRepo } from "./api.js";

const KIND = { default: "Mặc định", template: "Mẫu", custom: "Đã chỉnh" } as const;

/** Chọn framework cho repo; rỗng = dùng framework mặc định của hệ thống. */
export function FrameworkPicker({ repo }: { repo: RepoDto }) {
  const qc = useQueryClient();
  const fw = useQuery({ queryKey: ["frameworks"], queryFn: listFrameworks });
  const st = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const save = useMutation({ mutationFn: (frameworkId: string | null) => patchRepo(repo.id, { frameworkId }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["repos"] }); void qc.invalidateQueries({ queryKey: ["frameworks"] }); } });
  if (fw.isLoading || st.isLoading) return <Loading />;
  if (fw.error || st.error) return <ErrorBox error={fw.error ?? st.error} />;
  const list = fw.data ?? [];
  const def = list.find((f) => f.id === st.data?.defaultFramework);
  const effective = list.find((f) => f.id === (repo.frameworkId ?? st.data?.defaultFramework));
  return (
    <Card>
      <CardHeader><CardTitle>Framework của repo</CardTitle><CardDescription>Bộ tiêu chí dùng khi review MR của repo này. Áp dụng từ lần review kế tiếp; review đã chấm giữ nguyên điểm.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="repo-fw" className="text-sm font-medium">Framework</label>
          <Select id="repo-fw" className="min-w-64 max-w-full" disabled={save.isPending} value={repo.frameworkId ?? ""} onChange={(e) => save.mutate(e.target.value || null)}>
            <option value="">Mặc định hệ thống{def ? ` (${def.name} v${def.version})` : ""}</option>
            {list.map((f) => <option key={f.id} value={f.id}>{f.name} v{f.version} · {KIND[f.kind]}</option>)}
          </Select>
          {save.isPending && <span className="text-xs text-muted-foreground" role="status">Đang lưu…</span>}
          {save.isSuccess && !save.isPending && <span className="text-xs text-success-fg" role="status">Đã lưu</span>}
        </div>
        {save.error && <ErrorBox error={save.error} />}
        {effective && <p className="text-[13px] text-muted-foreground">Đang áp dụng: <b className="text-foreground">{effective.name}</b> v{effective.version} <Badge variant="secondary">{effective.ruleCount} rule</Badge></p>}
        <div>
          <h3 className="mb-2 text-sm font-medium">Thứ tự ưu tiên</h3>
          <ol className="flex flex-col gap-1.5 text-sm">
            {[["File .asdlc.yml trong repo", "Ghi đè trọng số, tắt/bật rule, thêm rule riêng. Đọc từ base commit."], ["Framework gán cho repo", "Lựa chọn ở trên."], ["Framework mặc định hệ thống", "Dùng khi repo không chọn framework riêng."]].map(([t, d], i) => (
              <li key={t} className="flex gap-3"><span className="flex size-5 flex-none items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums">{i + 1}</span><span><span className="font-medium">{t}.</span> <span className="text-muted-foreground">{d}</span></span></li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
