import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { listRepos, patchRepo, registerRepo, removeRepo } from "./api.js";

export function ReposPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["repos"], queryFn: listRepos });
  const inv = () => qc.invalidateQueries({ queryKey: ["repos"] });
  const [url, setUrl] = useState("");
  const add = useMutation({ mutationFn: () => registerRepo(url.trim()), onSuccess: () => { setUrl(""); void inv(); } });
  const patch = useMutation({ mutationFn: (a: { id: string; p: Parameters<typeof patchRepo>[1] }) => patchRepo(a.id, a.p), onSuccess: inv });
  const del = useMutation({ mutationFn: removeRepo, onSuccess: inv });
  return (
    <>
      <PageHeader title="Repository" description="Đăng ký repo để nhận webhook và review tự động." />
      <Card className="p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); if (url.trim()) add.mutate(); }}>
          <Input aria-label="URL repo" className="flex-[1_1_320px]" placeholder="https://gitlab.example.com/group/project" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" disabled={add.isPending}>Đăng ký</Button>
        </form>
        {add.error && <div className="mt-3"><ErrorBox error={add.error} /></div>}
        <p className="mt-3 text-xs text-muted-foreground">Webhook GitLab: <code className="font-mono">/webhooks/gitlab</code> — bật Merge request events và Comments, kèm Secret token.</p>
      </Card>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? <Empty>Chưa đăng ký repo nào</Empty> : (
        <Card className="overflow-hidden"><Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Repo</TableHead><TableHead>Nền tảng</TableHead><TableHead>Tự review</TableHead><TableHead>Bật</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{q.data.map((r) => (
            <TableRow key={r.id}>
              <TableCell><a className="font-medium hover:underline" href={r.webUrl} target="_blank" rel="noreferrer">{r.fullPath}</a></TableCell>
              <TableCell><Badge>{r.platform}</Badge></TableCell>
              <TableCell><input aria-label="Tự review" type="checkbox" className="size-4 accent-[var(--primary)]" checked={r.autoReview} onChange={(e) => patch.mutate({ id: r.id, p: { autoReview: e.target.checked } })} /></TableCell>
              <TableCell><input aria-label="Bật repo" type="checkbox" className="size-4 accent-[var(--primary)]" checked={r.enabled} onChange={(e) => patch.mutate({ id: r.id, p: { enabled: e.target.checked } })} /></TableCell>
              <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => { if (confirm(`Gỡ ${r.fullPath}?`)) del.mutate(r.id); }}>Gỡ</Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></Card>
      )}
    </>
  );
}
