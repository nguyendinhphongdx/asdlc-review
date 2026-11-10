import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { fmtDate, fmtDur } from "../../kernel/format.js";
import { Badge, Button, Card, Empty, ErrorBox, GradeBadge, Loading, PageHeader, SeverityBadge, Stat } from "../../kernel/ui.js";
import { getRun, rerun, setFeedback } from "./api.js";

export function ReviewDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["run", id], queryFn: () => getRun(id), refetchInterval: (s) => (s.state.data && ["queued", "running"].includes(s.state.data.status) ? 3000 : false) });
  const re = useMutation({ mutationFn: (mrId: string) => rerun(mrId), onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }) });
  const fb = useMutation({ mutationFn: (a: { id: string; v: "agree" | "disagree" | "fixed" | null }) => setFeedback(a.id, a.v), onSuccess: () => qc.invalidateQueries({ queryKey: ["run", id] }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const r = q.data!;
  return (
    <>
      <PageHeader title={`!${r.mr.iid} ${r.mr.title}`}>
        <a className="text-sm text-indigo-700 hover:underline" href={r.mr.webUrl} target="_blank" rel="noreferrer">Mở MR</a>
        <Button variant="ghost" disabled={re.isPending} onClick={() => re.mutate(r.mr.id)}>Review lại</Button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Điểm" value={<GradeBadge grade={r.grade} score={r.score} />} hint={r.rawScore != null && r.rawScore !== r.score ? `thô ${Math.round(r.rawScore)}` : undefined} />
        <Stat label="Verdict" value={r.verdict ?? "–"} />
        <Stat label="File / dòng" value={`${r.filesChanged} / +${r.additions} −${r.deletions}`} />
        <Stat label="Thời gian" value={fmtDur(r.durationMs)} hint={r.model ?? r.provider ?? undefined} />
        <Stat label="Vòng" value={r.round} hint={fmtDate(r.createdAt)} />
      </div>
      {r.error && <div className="mt-3"><ErrorBox error={r.error} /></div>}
      {r.gates.length > 0 && <Card className="mt-4 border-red-200" title="Cổng chặn điểm">{r.gates.map((g) => <div key={g.id} className="text-sm">⛔ {g.reason} (trần {g.cap})</div>)}</Card>}
      {r.summary && <Card className="mt-4" title="Tóm tắt">{r.intent && <p className="mb-2 text-sm text-slate-500">Ý định MR: {r.intent}</p>}<p className="text-sm">{r.summary}</p>
        {r.strengths.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-emerald-700">{r.strengths.map((s) => <li key={s}>{s}</li>)}</ul>}</Card>}
      <Card className="mt-4" title="Điểm theo hạng mục">
        <table className="w-full text-sm"><tbody>
          {r.categoryScores.map((c) => (
            <tr key={c.category} className="border-t border-slate-100"><td className="py-1.5">{c.name}</td><td className="w-1/2"><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-indigo-500" style={{ width: `${c.score}%` }} /></div></td><td className="text-right">{Math.round(c.score)}</td><td className="text-right text-xs text-slate-400">{c.findings} finding</td></tr>
          ))}
        </tbody></table>
      </Card>
      <Card className="mt-4" title={`Finding (${r.findings.length})`}>
        {r.findings.length === 0 ? <Empty>Không có finding</Empty> : r.findings.map((f) => (
          <div key={f.id} className="border-t border-slate-100 py-3 first:border-0">
            <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} /><Badge className="bg-slate-100 text-slate-600">{f.ruleId ?? f.category}</Badge><Badge className="bg-slate-50 text-slate-500">{f.source}</Badge>
              <span className="font-medium">{f.title}</span></div>
            {f.file && <div className="mt-1 font-mono text-xs text-slate-500">{f.file}{f.lineStart ? `:${f.lineStart}` : ""}</div>}
            <p className="mt-1 text-sm">{f.why}</p>
            {f.evidence && <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{f.evidence}</pre>}
            {f.suggestion && <p className="mt-1 text-sm text-emerald-700">Gợi ý: {f.suggestion}</p>}
            {f.question && <p className="mt-1 text-sm text-indigo-700">Câu hỏi: {f.question}</p>}
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span>tin cậy {Math.round(f.confidence * 100)}% · trừ {f.deduction.toFixed(1)}</span>
              {(["agree", "disagree", "fixed"] as const).map((v) => (
                <button key={v} className={`rounded border px-1.5 py-0.5 ${f.feedback === v ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`} onClick={() => fb.mutate({ id: f.id, v: f.feedback === v ? null : v })}>
                  {{ agree: "Đồng ý", disagree: "Không đồng ý", fixed: "Đã sửa" }[v]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
