import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { listRepos, patchRepo, removeRepo } from "./api.js";
import { RepoDetail } from "./detail.js";
import { WebhookSummary } from "./webhook.js";
import { AddRepoWizard } from "./wizard.js";

export function ReposPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["repos"], queryFn: listRepos });
  const inv = () => qc.invalidateQueries({ queryKey: ["repos"] });
  const [search, setSearch] = useState("");
  const [wizard, setWizard] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const patch = useMutation({ mutationFn: (a: { id: string; p: Parameters<typeof patchRepo>[1] }) => patchRepo(a.id, a.p), onSuccess: inv });
  const del = useMutation({ mutationFn: removeRepo, onSuccess: (_d, id) => { if (id === selected) setSelected(null); void inv(); } });
  const items = (q.data ?? []).filter((r) => !search || r.fullPath.toLowerCase().includes(search.toLowerCase()));
  const sel = q.data?.find((r) => r.id === selected);
  return (
    <>
      <PageHeader title="Repository" description="Repo nào được review tự động và webhook có đang hoạt động không.">
        <Button onClick={() => setWizard(true)}><Plus />Thêm repository</Button>
      </PageHeader>
      <Input aria-label="Tìm repository" className="max-w-xs" placeholder="Tìm repository…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {(patch.error || del.error) && <ErrorBox error={patch.error ?? del.error} />}
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? (
        <Card><Empty><p>Chưa đăng ký repo nào</p><Button className="mt-4" onClick={() => setWizard(true)}><Plus />Thêm repository đầu tiên</Button></Empty></Card>
      ) : !items.length ? <Empty>Không có repository khớp "{search}"</Empty> : (
        <Card className="overflow-hidden"><Table className="min-w-[860px]">
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Repository</TableHead><TableHead>Nền tảng</TableHead><TableHead>Webhook</TableHead><TableHead>Tự review</TableHead><TableHead>Bật</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{items.map((r) => (
            <TableRow key={r.id} className={r.id === selected ? "bg-muted" : undefined}>
              <TableCell><a className="font-medium hover:underline" href={r.webUrl} target="_blank" rel="noreferrer">{r.fullPath}</a></TableCell>
              <TableCell><Badge>{r.platform}</Badge></TableCell>
              <TableCell><WebhookSummary w={r.webhook} /></TableCell>
              <TableCell><input aria-label={`Tự review ${r.fullPath}`} type="checkbox" className="size-4 accent-[var(--primary)]" checked={r.autoReview} onChange={(e) => patch.mutate({ id: r.id, p: { autoReview: e.target.checked } })} /></TableCell>
              <TableCell><input aria-label={`Bật repo ${r.fullPath}`} type="checkbox" className="size-4 accent-[var(--primary)]" checked={r.enabled} onChange={(e) => patch.mutate({ id: r.id, p: { enabled: e.target.checked } })} /></TableCell>
              <TableCell className="whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" aria-expanded={r.id === selected} onClick={() => setSelected(r.id === selected ? null : r.id)}>Chi tiết</Button>{" "}
                <Button size="sm" variant="outline" onClick={() => { if (confirm(`Gỡ ${r.fullPath}?`)) del.mutate(r.id); }}>Gỡ</Button>
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></Card>
      )}
      {sel && <RepoDetail key={sel.id} repo={sel} onClose={() => setSelected(null)} />}
      {wizard && <AddRepoWizard onClose={() => setWizard(false)} />}
    </>
  );
}
