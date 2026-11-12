import type { RepoDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type ColumnDef } from "@/components/data-table/data-table";
import { ErrorBox, PageHeader } from "../../kernel/page.js";
import { listRepos, patchRepo, removeRepo } from "./api.js";
import { RepoDetail } from "./detail.js";
import { WebhookSummary } from "./webhook.js";
import { AddRepoWizard } from "./wizard.js";

export function ReposPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["repos"], queryFn: listRepos });
  const inv = () => qc.invalidateQueries({ queryKey: ["repos"] });
  const [wizard, setWizard] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const patch = useMutation({ mutationFn: (a: { id: string; p: Parameters<typeof patchRepo>[1] }) => patchRepo(a.id, a.p), onSuccess: inv });
  const del = useMutation({ mutationFn: removeRepo, onSuccess: (_d, id) => { if (id === selected) setSelected(null); void inv(); } });
  const sel = q.data?.find((r) => r.id === selected);
  const columns: ColumnDef<RepoDto>[] = [
    { accessorKey: "fullPath", header: "Repository", cell: ({ row: { original: r } }) => <a className="font-medium hover:underline" href={r.webUrl} target="_blank" rel="noreferrer">{r.fullPath}</a> },
    { accessorKey: "platform", header: "Nền tảng", cell: ({ getValue }) => <Badge>{getValue<string>()}</Badge> },
    { id: "webhook", header: "Webhook", accessorFn: (r) => r.webhook?.status ?? "none", cell: ({ row: { original: r } }) => <WebhookSummary w={r.webhook} /> },
    { accessorKey: "autoReview", header: "Tự review", cell: ({ row: { original: r } }) => <input aria-label={`Tự review ${r.fullPath}`} type="checkbox" className="size-4 accent-[var(--primary)]" checked={r.autoReview} onChange={(e) => patch.mutate({ id: r.id, p: { autoReview: e.target.checked } })} /> },
    { accessorKey: "enabled", header: "Bật", cell: ({ row: { original: r } }) => <input aria-label={`Bật repo ${r.fullPath}`} type="checkbox" className="size-4 accent-[var(--primary)]" checked={r.enabled} onChange={(e) => patch.mutate({ id: r.id, p: { enabled: e.target.checked } })} /> },
  ];
  return (
    <>
      <PageHeader title="Repository" description="Repo nào được poller quét và review tự động; thêm repo bằng cách tìm trong tài khoản GitLab.">
        <Button onClick={() => setWizard(true)}><Plus />Thêm repository</Button>
      </PageHeader>
      {(patch.error || del.error) && <ErrorBox error={patch.error ?? del.error} />}
      <DataTable<RepoDto>
        aria-label="Danh sách repository" columns={columns} data={q.data ?? []} loading={q.isLoading} error={q.error} getRowId={(r) => r.id}
        unit="repository" minWidth={860} search={{ placeholder: "Tìm repository…" }} filters={[{ columnId: "platform", label: "Nền tảng" }, { columnId: "webhook", label: "Webhook" }]}
        initialSort={[{ id: "fullPath", desc: false }]} rowClassName={(r) => (r.id === selected ? "bg-muted" : undefined)}
        empty={<><p>Chưa đăng ký repo nào</p><Button className="mt-4" onClick={() => setWizard(true)}><Plus />Thêm repository đầu tiên</Button></>}
        rowActions={(r) => [
          { label: r.id === selected ? "Đóng chi tiết" : "Chi tiết", onSelect: () => setSelected(r.id === selected ? null : r.id) },
          { label: "Mở trên GitLab", onSelect: () => window.open(r.webUrl, "_blank", "noopener") },
          { label: "Gỡ repository", destructive: true, onSelect: () => { if (confirm(`Gỡ ${r.fullPath}?`)) del.mutate(r.id); } },
        ]}
      />
      {sel && <RepoDetail key={sel.id} repo={sel} onClose={() => setSelected(null)} />}
      {wizard && <AddRepoWizard onClose={() => setWizard(false)} />}
    </>
  );
}
