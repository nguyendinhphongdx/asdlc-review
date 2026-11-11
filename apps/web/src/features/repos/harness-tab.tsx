import type { ConfigPreviewDto, RepoDto } from "@mrd/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HarnessPanel } from "../../kernel/harness.js";
import { Empty, ErrorBox, Loading } from "../../kernel/page.js";
import { getRepoHarness, previewConfig } from "./api.js";

const List = ({ title, items }: { title: string; items: string[] }) => (
  <div><h4 className="mb-1 text-[13px] font-medium">{title}</h4>{items.length ? <ul className="list-disc pl-5 text-[13px] text-muted-foreground">{items.map((c) => <li key={c} className="break-words">{c}</li>)}</ul> : <p className="text-[13px] text-muted-foreground">Không có.</p>}</div>
);

/** Dán nội dung .asdlc.yml để xem trước: hợp lệ hay lỗi và rubric thay đổi thế nào. */
function ConfigViewer({ frameworkId }: { frameworkId?: string | null }) {
  const [yaml, setYaml] = useState("");
  const prev = useMutation<ConfigPreviewDto, Error, void>({ mutationFn: () => previewConfig(yaml, frameworkId ?? undefined) });
  const r = prev.data;
  return (
    <Card>
      <CardHeader><CardTitle>Trình xem .asdlc.yml</CardTitle><CardDescription>Dán nội dung file để kiểm tra trước khi commit. Không lưu lại. File lỗi không làm hỏng review: bị bỏ qua và comment tổng ghi cảnh báo.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label htmlFor="asdlc-yaml" className="text-[13px] font-medium">Nội dung .asdlc.yml</label>
        <textarea id="asdlc-yaml" spellCheck={false} rows={8} value={yaml} onChange={(e) => setYaml(e.target.value)} placeholder={"weights:\n  security: 40\ndisable: [ACM-03]"}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
        <div className="flex items-center gap-3"><Button type="button" disabled={!yaml.trim() || prev.isPending} onClick={() => prev.mutate()}>{prev.isPending ? "Đang kiểm tra…" : "Xem trước"}</Button>{prev.isPending && <span role="status" className="text-xs text-muted-foreground">Đang kiểm tra…</span>}</div>
        {prev.error && <ErrorBox error={prev.error} />}
        {r && (
          <div className="flex flex-col gap-3" aria-live="polite">
            {r.valid ? (
              <div className="flex items-center gap-2 rounded-lg bg-success-bg px-3 py-2 text-sm font-medium text-success-fg"><CircleCheck className="size-4" aria-hidden="true" />.asdlc.yml hợp lệ</div>
            ) : (
              <div role="alert" className="rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm text-danger-fg"><div className="flex items-center gap-2 font-semibold"><CircleX className="size-4" aria-hidden="true" />.asdlc.yml lỗi, sẽ bị bỏ qua khi review</div><ul className="mt-1 list-disc pl-5 text-[13px]">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
            )}
            {r.valid && <div className="grid gap-4 md:grid-cols-3"><List title="Thay đổi so với framework nền" items={r.changes} /><List title="Tài liệu bổ sung" items={r.docs} /><List title="Bỏ qua (ignore)" items={r.ignore} /></div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HarnessTab({ repo }: { repo: RepoDto }) {
  const q = useQuery({ queryKey: ["repo-harness", repo.id], queryFn: () => getRepoHarness(repo.id) });
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Độ phủ harness</CardTitle><CardDescription>Repo có đủ AGENTS.md, rules, tài liệu kiến trúc để AI review đúng ngữ cảnh không. Tính bằng code từ lần review gần nhất.</CardDescription></CardHeader>
        <CardContent>
          {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.report ? <Empty>Chưa có review nào nên chưa quét harness. Điểm sẽ xuất hiện sau lần review đầu tiên của repo này.</Empty> : <HarnessPanel report={q.data.report} />}
        </CardContent>
      </Card>
      <ConfigViewer frameworkId={repo.frameworkId} />
    </>
  );
}
