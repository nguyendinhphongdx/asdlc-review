import type { FrameworkChangeDto, FrameworkDetailDto } from "@mrd/contracts";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "../../kernel/format.js";
import { Empty, ErrorBox, Loading } from "../../kernel/page.js";
import { getFrameworkDiff } from "./api.js";

/** Lịch sử phiên bản của bản custom; bản mặc định/mẫu chỉ đọc nên chưa có lịch sử. */
export function VersionsView({ d, viewing, onView, onRestore, restoring }: { d: FrameworkDetailDto; viewing: number | undefined; onView: (v: number | undefined) => void; onRestore: (v: number) => void; restoring: boolean }) {
  if (d.kind !== "custom") return <Card><Empty>Bản mặc định và mẫu dựng sẵn chỉ đọc nên không có lịch sử phiên bản. Tạo bản chỉnh sửa (fork) để bắt đầu theo dõi thay đổi.</Empty></Card>;
  const latest = d.versions[0]?.version;
  return (
    <Card>
      <CardHeader><CardTitle>Lịch sử phiên bản</CardTitle><CardDescription>Mỗi lần lưu tạo một phiên bản mới. Khôi phục không xoá lịch sử mà tạo phiên bản mới từ nội dung cũ.</CardDescription></CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-lg border">
          {d.versions.map((v) => {
            const isLatest = v.version === latest;
            const isViewing = (viewing ?? latest) === v.version;
            return (
              <li key={v.version} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <span className="w-10 font-semibold tabular-nums">v{v.version}</span>
                <div className="min-w-0 flex-[1_1_220px]">
                  <div className="flex flex-wrap items-center gap-2 text-sm">{v.note || <span className="text-muted-foreground">(không có ghi chú)</span>}{isLatest && <Badge variant="success">Mới nhất</Badge>}{isViewing && !isLatest && <Badge variant="info">Đang xem</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{v.author} · {fmtDate(v.createdAt)}</div>
                </div>
                <span className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" aria-label={`Xem phiên bản v${v.version}`} disabled={isViewing} onClick={() => onView(isLatest ? undefined : v.version)}>Xem</Button>
                  {!isLatest && <Button type="button" size="sm" variant="outline" aria-label={`Khôi phục phiên bản v${v.version}`} disabled={restoring} onClick={() => onRestore(v.version)}>Khôi phục</Button>}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** So với bản gốc lúc fork. */
export function DiffView({ id, version, baseName }: { id: string; version?: number; baseName: string }) {
  const q = useQuery({ queryKey: ["framework-diff", id, version], queryFn: () => getFrameworkDiff(id, version) });
  return (
    <Card>
      <CardHeader><CardTitle>So với bản gốc</CardTitle><CardDescription>Khác biệt giữa phiên bản này và {baseName} lúc fork.</CardDescription></CardHeader>
      <CardContent>
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? <p className="text-sm text-muted-foreground">Chưa có khác biệt nào so với bản gốc.</p> : (
          <ul className="flex flex-col divide-y rounded-lg border text-sm">{q.data.map((c: FrameworkChangeDto) => (
            <li key={c.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <code className="min-w-0 flex-[1_1_200px] break-all font-mono text-xs">{c.path}</code>
              <span className="flex items-center gap-2 tabular-nums">
                {c.from !== null && <span className="rounded bg-danger-bg px-1.5 py-0.5 text-danger-fg line-through">{c.from}</span>}
                {c.to !== null && <span className="rounded bg-success-bg px-1.5 py-0.5 text-success-fg">{c.to}</span>}
              </span>
            </li>
          ))}</ul>
        )}
      </CardContent>
    </Card>
  );
}
