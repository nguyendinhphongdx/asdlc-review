import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, inputCls } from "../../kernel/ui.js";
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
      <PageHeader title="Repository" />
      <Card className="mb-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) add.mutate(); }}>
          <input className={`${inputCls} flex-1`} placeholder="URL repo, ví dụ https://gitlab.com/group/project" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" disabled={add.isPending}>Đăng ký</Button>
        </form>
        {add.error && <div className="mt-2"><ErrorBox error={add.error} /></div>}
        <p className="mt-2 text-xs text-slate-500">Webhook GitLab: <code>/webhooks/gitlab</code> (Merge request events + Comments, kèm Secret token).</p>
      </Card>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? <Empty>Chưa đăng ký repo nào</Empty> : (
        <Card><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th>Repo</th><th>Nền tảng</th><th>Auto review</th><th>Bật</th><th /></tr></thead><tbody>
          {q.data.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="py-2"><a className="text-indigo-700 hover:underline" href={r.webUrl} target="_blank" rel="noreferrer">{r.fullPath}</a></td><td>{r.platform}</td>
              <td><input type="checkbox" checked={r.autoReview} onChange={(e) => patch.mutate({ id: r.id, p: { autoReview: e.target.checked } })} /></td>
              <td><input type="checkbox" checked={r.enabled} onChange={(e) => patch.mutate({ id: r.id, p: { enabled: e.target.checked } })} /></td>
              <td className="text-right"><Button variant="ghost" onClick={() => { if (confirm(`Gỡ ${r.fullPath}?`)) del.mutate(r.id); }}>Gỡ</Button></td>
            </tr>
          ))}
        </tbody></table></Card>
      )}
    </>
  );
}
