import type { Rubric } from "@mrd/contracts";
import { useQuery } from "@tanstack/react-query";
import { Bot, Cog } from "lucide-react";
import { useState } from "react";
import { SeverityBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { STAGES } from "../../kernel/stages.js";
import { getFramework, listFrameworks } from "./api.js";

/** Mỗi bước của pipeline: ai thực hiện (code tất định hay AI) và làm gì. */
const FLOW: Record<string, { by: "code" | "ai"; what: string }> = {
  clone: { by: "code", what: "Clone repo, fetch head của MR, tính diff so với nhánh đích. Diff vượt ngân sách thì giữ file ưu tiên và ghi lại file bị bỏ qua." },
  framework: { by: "code", what: "Nạp bộ tiêu chí này, rồi gộp với `.asdlc.yml` của repo (đọc từ base commit, không tin cấu hình do chính MR gửi lên)." },
  harness: { by: "code", what: "Tìm AGENTS.md, CLAUDE.md, rules, tài liệu kiến trúc trong repo; đây là quy tắc riêng của repo mà tác giả phải tuân theo." },
  analysis: { by: "code", what: "Phân tích tĩnh tất định trên diff: lộ secret, debug code, test bị skip, tắt lint, TODO..." },
  review: { by: "ai", what: "AI đối chiếu diff + harness với các rule bên dưới và chỉ trả về finding (có file, dòng, bằng chứng, lý do, câu hỏi). AI không chấm điểm." },
  score: { by: "code", what: "Code tính điểm từ finding: trừ theo severity × độ tin cậy, trung bình có trọng số theo hạng mục, rồi áp gate." },
  publish: { by: "code", what: "Đăng/cập nhật một comment tổng và inline comment cho finding đủ ngưỡng; không đăng trùng finding đã nêu." },
};

const By = ({ by }: { by: "code" | "ai" }) => (
  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", by === "ai" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
    {by === "ai" ? <Bot className="size-3" /> : <Cog className="size-3" />}{by === "ai" ? "AI" : "Code"}
  </span>
);

function Workflow() {
  return (
    <Card>
      <CardHeader><CardTitle>Quy trình review</CardTitle><CardDescription>Mỗi MR đi qua 7 bước. Chỉ một bước dùng AI; điểm luôn do code tính.</CardDescription></CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {STAGES.map((s, i) => {
            const f = FLOW[s.id]!;
            return (
              <li key={s.id} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums">{i + 1}</span>
                <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium">{s.label}<By by={f.by} /></div><p className="text-sm text-muted-foreground">{f.what}</p></div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function Categories({ r }: { r: Rubric }) {
  const [open, setOpen] = useState<string | null>(r.categories[0]?.id ?? null);
  const total = r.categories.reduce((s, c) => s + c.weight, 0) || 1;
  return (
    <Card>
      <CardHeader><CardTitle>Review cái gì</CardTitle><CardDescription>{r.categories.length} hạng mục, {r.categories.reduce((s, c) => s + c.criteria.length, 0)} rule. Trọng số quyết định phần đóng góp vào điểm tổng.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2">
        {r.categories.map((c) => {
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="rounded-lg border">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.criteria.length} rule</span>
                <span className="w-24"><span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(c.weight / total) * 100}%` }} /></span></span>
                <span className="w-10 text-right text-xs font-semibold tabular-nums">{c.weight}</span>
              </button>
              {isOpen && (
                <ul className="divide-y border-t">
                  {c.criteria.map((k) => (
                    <li key={k.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2"><code className="font-mono text-xs text-muted-foreground">{k.id}</code><span className="text-sm font-medium">{k.title}</span><SeverityBadge severity={k.defaultSeverity} /></div>
                      <p className="mt-1 text-sm text-muted-foreground">{k.check}</p>
                      <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Hỏi tác giả:</span> {k.why}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Scoring({ r }: { r: Rubric }) {
  return (
    <Card>
      <CardHeader><CardTitle>Cách chấm điểm</CardTitle><CardDescription>Mỗi hạng mục bắt đầu 100 điểm; điểm tổng là trung bình có trọng số, sau đó áp gate.</CardDescription></CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <div><h3 className="mb-2 text-sm font-medium">Mức độ và điểm trừ</h3><ul className="flex flex-col gap-2">{(Object.entries(r.severity)).map(([k, v]) => (
          <li key={k} className="text-sm"><div className="flex items-center gap-2"><SeverityBadge severity={k} /><span className="tabular-nums text-muted-foreground">−{v.deduction}</span></div><p className="mt-0.5 text-xs text-muted-foreground">{v.description}</p></li>))}</ul></div>
        <div><h3 className="mb-2 text-sm font-medium">Gate chặn điểm</h3><ul className="flex flex-col gap-2">{r.gates.map((g) => (
          <li key={g.id} className="text-sm"><span className="font-semibold tabular-nums">≤ {g.capTotal}</span> <span className="text-muted-foreground">{g.reason}</span></li>))}</ul>
          <p className="mt-3 text-xs text-muted-foreground">Với minor/nit, điểm trừ được chia cho √(dòng thay đổi / {r.sizeBaseline}) để MR lớn không bị phạt dồn.</p></div>
        <div><h3 className="mb-2 text-sm font-medium">Xếp loại</h3><ul className="flex flex-col gap-1">{r.grades.map((g) => (<li key={g.grade} className="flex justify-between text-sm"><span className="font-semibold">{g.grade}</span><span className="tabular-nums text-muted-foreground">≥ {g.min}</span></li>))}</ul></div>
      </CardContent>
    </Card>
  );
}

export function FrameworkPage() {
  const list = useQuery({ queryKey: ["frameworks"], queryFn: listFrameworks });
  const id = list.data?.[0]?.id;
  const fw = useQuery({ queryKey: ["framework", id], queryFn: () => getFramework(id!), enabled: Boolean(id) });
  if (list.isLoading || fw.isLoading) return <Loading />;
  if (list.error || fw.error) return <ErrorBox error={list.error ?? fw.error} />;
  const r = fw.data;
  if (!r) return <PageHeader title="Framework" description="Chưa có framework nào." />;
  return (
    <>
      <PageHeader title="Framework" description={`${r.name} · v${r.version}. Bộ tiêu chí mặc định áp cho mọi repo; repo có thể ghi đè bằng .asdlc.yml.`} />
      <Workflow />
      <Categories r={r} />
      <Scoring r={r} />
      <Card>
        <CardHeader><CardTitle>Harness của repo</CardTitle><CardDescription>Tầng bổ sung nằm trong từng repo.</CardDescription></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Ngoài các rule trên, AI đọc AGENTS.md / CLAUDE.md / rules / tài liệu kiến trúc của repo và coi mọi quy tắc MUST/NEVER/ALWAYS trong đó là tiêu chí review (ưu tiên hơn quy ước chung). Repo không có harness vẫn được review bằng bộ rule ở trên.</CardContent>
      </Card>
    </>
  );
}
