import { Bot, Cog } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { STAGES } from "../../kernel/stages.js";

/** Mỗi bước của pipeline: ai thực hiện (code tất định hay AI) và làm gì. */
const FLOW: Record<string, { by: "code" | "ai"; what: string }> = {
  queue: { by: "code", what: "MR được xếp hàng và chờ worker rảnh (tối đa vài review chạy song song)." },
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
    {by === "ai" ? <Bot className="size-3" aria-hidden="true" /> : <Cog className="size-3" aria-hidden="true" />}{by === "ai" ? "AI" : "Code"}
  </span>
);

export function Workflow() {
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Quy trình review</CardTitle><CardDescription>Mỗi MR đi qua {STAGES.length} bước. Chỉ một bước dùng AI; điểm luôn do code tính.</CardDescription></CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3">
            {STAGES.map((s, i) => {
              const f = FLOW[s.id] ?? { by: "code" as const, what: "" };
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
      <Card>
        <CardHeader><CardTitle>Harness của repo</CardTitle><CardDescription>Tầng bổ sung nằm trong từng repo.</CardDescription></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Ngoài các rule của framework, AI đọc AGENTS.md / CLAUDE.md / rules / tài liệu kiến trúc của repo và coi mọi quy tắc MUST/NEVER/ALWAYS trong đó là tiêu chí review (ưu tiên hơn quy ước chung). Thứ tự ưu tiên: <code className="font-mono text-xs">.asdlc.yml</code> của repo &gt; framework gán cho repo &gt; framework mặc định. Repo không có harness vẫn được review bằng bộ rule của framework.</CardContent>
      </Card>
    </>
  );
}
