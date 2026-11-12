import { useQuery } from "@tanstack/react-query";
import { TriangleAlert, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type ColumnDef } from "@/components/data-table/data-table";
import { Empty, ErrorBox, Loading } from "../../kernel/page.js";
import { getRepoWebhook } from "./api.js";
import { ResultBadge, WebhookBadge } from "./webhook.js";

type WebhookEventDto = NonNullable<ReturnType<typeof getRepoWebhook> extends Promise<infer R> ? R : never>["events"][number];
const COLUMNS: ColumnDef<WebhookEventDto>[] = [
  { accessorKey: "at", header: "Thời điểm", meta: { className: "whitespace-nowrap tabular-nums" }, cell: ({ getValue }) => <span title={new Date(getValue<string>()).toLocaleString("vi-VN")}>{time(getValue<string>())}</span> },
  { accessorKey: "event", header: "Sự kiện" },
  { accessorKey: "result", header: "Kết quả", cell: ({ getValue }) => <ResultBadge result={getValue<WebhookEventDto["result"]>()} /> },
  { id: "detail", header: "Chi tiết", accessorFn: (e) => e.detail ?? "—", meta: { className: "text-muted-foreground" } },
];
const time = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour12: false });

/** Nhật ký webhook (50 sự kiện gần nhất). */
export function WebhookLog({ id, fullPath, onClose }: { id: string; fullPath: string; onClose?: () => void }) {
  const q = useQuery({ queryKey: ["repo-webhook", id], queryFn: () => getRepoWebhook(id), refetchInterval: 10_000 });
  const d = q.data;
  return (
    <div aria-label={`Hoạt động webhook ${fullPath}`}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5"><CardTitle className="flex flex-wrap items-center gap-2">Hoạt động webhook — <span className="font-mono text-sm">{fullPath}</span>{d && <WebhookBadge status={d.status} />}</CardTitle><CardDescription>Tối đa 50 sự kiện gần nhất, kể cả sự kiện bị từ chối.</CardDescription></div>
        {onClose && <Button variant="ghost" size="icon" aria-label="Đóng chi tiết" onClick={onClose}><X /></Button>}
      </CardHeader>
      {q.isLoading ? <Loading /> : q.error ? <div className="p-5 pt-0"><ErrorBox error={q.error} /></div> : !d?.events.length ? <Empty>Chưa nhận sự kiện nào. Kiểm tra webhook đã được tạo trên GitLab chưa.</Empty> : (
        <>
          <DataTable<WebhookEventDto>
            aria-label="Nhật ký webhook" compact framed={false} columns={COLUMNS} data={d.events} getRowId={(e) => e.id} minWidth={640} initialSort={[{ id: "at", desc: true }]}
          />
          {d.rejectedCount > 0 && (
            <div role="alert" className="m-4 flex gap-3 rounded-lg border border-warning bg-warning-bg px-4 py-3 text-[13px] text-warning-fg">
              <TriangleAlert className="mt-0.5 size-5 flex-none" aria-hidden="true" />
              <span>{d.rejectedCount} sự kiện bị từ chối (thường do secret không khớp). Sao chép lại secret từ <Link className="font-medium underline" to="/settings">Cài đặt → Kết nối → Webhook</Link> và cập nhật trên GitLab.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
