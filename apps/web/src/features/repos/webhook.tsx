import type { RepoDto, WebhookEventDto, WebhookStatus } from "@mrd/contracts";
import { Badge } from "@/components/ui/badge";
import { fmtAgo } from "../../kernel/format.js";

type Summary = NonNullable<RepoDto["webhook"]> | undefined;

/** Huy hiệu trạng thái webhook: ok / none / bad. */
export function WebhookBadge({ status }: { status: WebhookStatus | undefined }) {
  if (status === "ok") return <Badge variant="success">Hoạt động</Badge>;
  if (status === "bad") return <Badge variant="danger">Sai secret</Badge>;
  return <Badge variant="warning">Chưa nhận sự kiện</Badge>;
}

export function WebhookSummary({ w }: { w: Summary }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <WebhookBadge status={w?.status} />
      <span className="text-xs text-muted-foreground">{w?.lastEventAt ? fmtAgo(w.lastEventAt) : "—"}</span>
    </div>
  );
}

const RESULT: Record<WebhookEventDto["result"], { label: string; variant: "success" | "danger" | "secondary" }> = {
  accepted: { label: "Đã xếp hàng", variant: "success" }, rejected: { label: "Từ chối", variant: "danger" },
  ignored: { label: "Bỏ qua", variant: "secondary" }, skipped: { label: "Bỏ qua", variant: "secondary" },
};
export const ResultBadge = ({ result }: { result: WebhookEventDto["result"] }) => <Badge variant={RESULT[result]?.variant ?? "secondary"}>{RESULT[result]?.label ?? result}</Badge>;
