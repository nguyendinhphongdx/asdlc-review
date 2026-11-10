import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { fmtDate, fmtDur } from "../../kernel/format.js";
import { Button, Card, Empty, ErrorBox, GradeBadge, Loading, PageHeader, inputCls } from "../../kernel/ui.js";
import { listRuns, requestReview } from "./api.js";

export function ReviewsPage() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const q = useQuery({ queryKey: ["runs"], queryFn: () => listRuns({ limit: 100 }), refetchInterval: 5000 });
  const m = useMutation({ mutationFn: requestReview, onSuccess: () => { setUrl(""); void qc.invalidateQueries({ queryKey: ["runs"] }); } });
  return (
    <>
      <PageHeader title="Các lần review" />
      <Card className="mb-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) m.mutate(url.trim()); }}>
          <input className={`${inputCls} flex-1`} placeholder="Dán link MR (GitLab/GitHub) để review thủ công…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" disabled={m.isPending}>Review</Button>
        </form>
        {m.error && <div className="mt-2"><ErrorBox error={m.error} /></div>}
        {m.data && <div className="mt-2 text-sm text-slate-600">Kết quả: {m.data.status}</div>}
      </Card>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.items.length ? <Empty>Chưa có lần review nào</Empty> : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th>MR</th><th>Tác giả</th><th>Vòng</th><th>Điểm</th><th>File</th><th>Thời gian</th><th>Trạng thái</th><th>Lúc</th></tr></thead>
            <tbody>
              {q.data.items.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2"><Link className="text-indigo-700 hover:underline" to={`/reviews/${r.id}`}>!{r.mr.iid} {r.mr.title}</Link></td>
                  <td>{r.mr.authorUsername}</td><td>{r.round}</td>
                  <td>{r.status === "succeeded" ? <GradeBadge grade={r.grade} score={r.score} /> : "–"}</td>
                  <td>{r.filesChanged}</td><td>{fmtDur(r.durationMs)}</td>
                  <td>{r.status}{r.stage && r.status === "running" ? ` (${r.stage})` : ""}</td><td className="text-xs text-slate-500">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
