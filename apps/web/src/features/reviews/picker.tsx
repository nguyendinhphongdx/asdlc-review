import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { DiscoverMrDto } from "@mrd/contracts";
import { ArrowLeft, GitMerge, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate } from "../../kernel/format.js";
import { Empty, ErrorBox, Loading } from "../../kernel/page.js";
import { discoverMrs, discoverProjects, requestReview } from "./api.js";

const STATES = [{ v: "opened", l: "Đang mở" }, { v: "merged", l: "Đã merge" }, { v: "all", l: "Tất cả" }];

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Chọn repo → chọn MR từ tài khoản GitLab đã kết nối (dùng trong hộp thoại Tìm MR). */
export function MrPicker({ onSent }: { onSent?: () => void }) {
  const qc = useQueryClient();
  const [project, setProject] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [state, setState] = useState("opened");
  const q = useDebounced(term);
  const projects = useQuery({ queryKey: ["discover-projects", q], queryFn: () => discoverProjects(q), enabled: project === null });
  const mrs = useQuery({ queryKey: ["discover-mrs", project, state, q], queryFn: () => discoverMrs(project!, state, q), enabled: project !== null });
  const run = useMutation({ mutationFn: (url: string) => requestReview(url), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["runs"] }); void qc.invalidateQueries({ queryKey: ["inbox"] }); onSent?.(); } });
  const busy = run.isPending ? run.variables : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {project !== null && <Button variant="outline" size="sm" onClick={() => { setProject(null); setTerm(""); run.reset(); }}><ArrowLeft className="size-4" />Đổi repo</Button>}
        <div className="relative flex-[1_1_280px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label={project === null ? "Tìm repo" : "Tìm MR"} className="pl-9" value={term} onChange={(e) => setTerm(e.target.value)}
            placeholder={project === null ? "Tìm repo của bạn theo tên…" : `Tìm MR trong ${project}…`} />
        </div>
        {project !== null && (
          <div role="group" aria-label="Trạng thái MR" className="flex rounded-lg border p-0.5">
            {STATES.map((s) => (
              <button key={s.v} type="button" aria-pressed={state === s.v} onClick={() => setState(s.v)}
                className={`rounded-md px-3 py-1 text-sm ${state === s.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{s.l}</button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        {project === null ? (
          projects.isLoading ? <Loading /> : projects.error ? <ErrorBox error={projects.error} /> : !projects.data?.length ? <Empty>Không tìm thấy repo nào</Empty> : (
            <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
              {projects.data.map((p) => (
                <li key={p.path}>
                  <button type="button" onClick={() => { setProject(p.path); setTerm(""); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                    <GitMerge className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.path}</span></span>
                    {p.registered && <Badge variant="success">Đã thêm</Badge>}
                    {p.lastActivityAt && <span className="hidden text-xs text-muted-foreground sm:inline">{fmtDate(p.lastActivityAt)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : mrs.isLoading ? <Loading /> : mrs.error ? <ErrorBox error={mrs.error} /> : !mrs.data?.length ? <Empty>Repo này chưa có MR nào ở trạng thái đã chọn</Empty> : (
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
            {mrs.data.map((m: DiscoverMrDto) => (
              <li key={m.iid} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">!{m.iid} {m.title}{m.draft && <Badge className="ml-2">Draft</Badge>}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.authorUsername} · {m.sourceBranch} → {m.targetBranch} · {fmtDate(m.updatedAt)}</span>
                </span>
                <Button size="sm" disabled={run.isPending} onClick={() => run.mutate(m.webUrl)}>{busy === m.webUrl ? "Đang gửi…" : "Review"}</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {run.error && <div className="mt-3"><ErrorBox error={run.error} /></div>}
    </div>
  );
}
