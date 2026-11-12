import { useQuery } from "@tanstack/react-query";
import { Brain, CheckCircle2, ChevronDown, Coins, Cpu, Database, Download, GitMerge, ListChecks, Receipt, RefreshCw, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtDur } from "../../kernel/format.js";
import { ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { getUsage, usageCsvUrl, type UsageQuery } from "./api.js";
import { colorOf, DayChart, Donut, fmtNum, fmtUsd, Heatmap, HBars, Histogram, Legend, Sparkline, type Metric } from "./charts.js";

const PRESETS = [7, 14, 30, 90, 180];
const METRICS: { id: Metric; label: string }[] = [{ id: "cost", label: "Chi phí" }, { id: "tokens", label: "Token" }, { id: "runs", label: "Số run" }];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function MultiSelect({ icon: Icon, label, options, value, onChange }: { icon: LucideIcon; label: string; options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <details className="group relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.removeAttribute("open"); }}>
      <summary className={cn("flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border bg-card px-2.5 text-[13px] hover:bg-muted/50", value.length && "border-primary/50 bg-primary/5")}>
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span>{label}{value.length ? `: ${value.length} đã chọn` : ""}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 top-9 z-20 flex max-h-64 min-w-56 flex-col overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lg">
        {options.length === 0 && <span className="px-2 py-1.5 text-xs text-muted-foreground">Không có lựa chọn</span>}
        {options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted">
            <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} className="size-3.5 accent-[var(--chart-1)]" />
            <span className="truncate">{o.name}</span>
          </label>
        ))}
        {value.length > 0 && <button type="button" className="mt-1 rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-muted" onClick={() => onChange([])}>Bỏ chọn tất cả</button>}
      </div>
    </details>
  );
}

function Kpi({ icon: Icon, tone, label, value, sub, delta, spark }: { icon: LucideIcon; tone: string; label: string; value: ReactNode; sub?: ReactNode; delta?: { pct: number | null; goodWhenDown?: boolean }; spark?: number[] }) {
  const d = delta?.pct;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted/50 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><span className="grid size-5 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}><Icon className="size-3.5" aria-hidden="true" /></span>{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {d != null && Number.isFinite(d) && <Badge variant={d === 0 ? "secondary" : d > 0 === !delta?.goodWhenDown ? "success" : "danger"}>{d > 0 ? "▲" : d < 0 ? "▼" : "="} {Math.abs(Math.round(d))}%</Badge>}
        {sub}
      </span>
      {spark && <Sparkline values={spark} color={tone} />}
    </div>
  );
}

const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

export function UsagePage() {
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [repoIds, setRepoIds] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [status, setStatus] = useState<"all" | "succeeded" | "failed">("all");
  const [metric, setMetric] = useState<Metric>("cost");
  const query = useMemo<UsageQuery>(() => ({ days, ...(custom ?? {}), repoIds, providers, models, frameworks, status }), [days, custom, repoIds, providers, models, frameworks, status]);
  const q = useQuery({ queryKey: ["usage", query], queryFn: () => getUsage(query), placeholderData: (p) => p });
  const filtered = repoIds.length + providers.length + models.length + frameworks.length > 0 || status !== "all";
  const clear = () => { setRepoIds([]); setProviders([]); setModels([]); setFrameworks([]); setStatus("all"); };

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? new Error("Không tải được usage")} />;
  const r = q.data;
  const t = r.totals;
  const modelOrder = r.byModel.filter((m) => m.key !== "_other").map((m) => m.key);
  const strOpt = (a: string[]) => a.map((x) => ({ id: x, name: x }));
  const from = r.range.from.slice(0, 10), to = r.range.to.slice(0, 10);
  const totalTok = t.tokens.input + t.tokens.output + t.tokens.cacheRead + t.tokens.cacheWrite;
  const noCost = Math.max(0, t.runs - t.failedRuns - t.runsWithCost);

  return (
    <>
      <PageHeader title="Usage" description="Chi phí và token của các lượt review AI theo ngày, repo, model và framework.">
        <Button variant="outline" size="sm" onClick={() => { const a = document.createElement("a"); a.href = usageCsvUrl(r); a.download = `usage-${from}_${to}.csv`; a.click(); }}><Download />Xuất CSV</Button>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}><RefreshCw className={cn(q.isFetching && "animate-spin")} />Làm mới</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-xs">
        <div role="group" aria-label="Khoảng thời gian" className="inline-flex overflow-hidden rounded-lg border">
          {PRESETS.map((d) => (
            <button key={d} type="button" aria-pressed={!custom && days === d} onClick={() => { setCustom(null); setDays(d); }} className={cn("h-8 px-3 text-[13px]", !custom && days === d ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50")}>{d} ngày</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[13px]">
          <Input type="date" aria-label="Từ ngày" className="h-8 w-36" max={to} value={custom?.from ?? from} onChange={(e) => e.target.value && setCustom({ from: e.target.value, to: custom?.to ?? iso(new Date()) })} />
          <span className="text-muted-foreground">–</span>
          <Input type="date" aria-label="Đến ngày" className="h-8 w-36" min={from} value={custom?.to ?? to} onChange={(e) => e.target.value && setCustom({ from: custom?.from ?? from, to: e.target.value })} />
        </div>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <MultiSelect icon={GitMerge} label="Repo" options={r.options.repos} value={repoIds} onChange={setRepoIds} />
        <MultiSelect icon={Cpu} label="Provider" options={strOpt(r.options.providers)} value={providers} onChange={setProviders} />
        <MultiSelect icon={Brain} label="Model" options={strOpt(r.options.models)} value={models} onChange={setModels} />
        <MultiSelect icon={ListChecks} label="Framework" options={strOpt(r.options.frameworks)} value={frameworks} onChange={setFrameworks} />
        <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-muted-foreground" aria-hidden="true" /><Select aria-label="Trạng thái" className="h-8 w-auto py-0 text-[13px]" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">Mọi trạng thái</option><option value="succeeded">Thành công</option><option value="failed">Thất bại</option></Select></span>
        {(filtered || custom) && <button type="button" className="text-[13px] text-primary hover:underline" onClick={() => { clear(); setCustom(null); }}>Xoá bộ lọc</button>}
      </div>

      {t.runs === 0 ? (
        <Card><div className="px-6 py-14 text-center text-sm text-muted-foreground">Không có lượt review nào khớp bộ lọc trong khoảng này.{(filtered || custom) && <> <button type="button" className="text-primary hover:underline" onClick={() => { clear(); setCustom(null); }}>Xoá bộ lọc</button></>}</div></Card>
      ) : (
        <>
          <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-3">
            <Kpi icon={Coins} tone="var(--chart-1)" label="Tổng chi phí" value={fmtUsd(t.costUsd)} delta={{ pct: pct(t.costUsd, t.prevCostUsd), goodWhenDown: true }} sub="so với kỳ trước" spark={r.byDay.map((d) => d.costUsd)} />
            <Kpi icon={Receipt} tone="var(--chart-5)" label="Lượt review" value={t.runs} sub={t.failedRuns ? `${t.failedRuns} lỗi · ${fmtUsd(t.failedCostUsd)}` : "không lỗi"} delta={{ pct: pct(t.runs, t.prevRuns) }} spark={r.byDay.map((d) => d.runs)} />
            <Kpi icon={Zap} tone="var(--chart-3)" label="TB mỗi review" value={t.avgCostUsd != null ? fmtUsd(t.avgCostUsd) : "–"} sub={t.avgDurationMs != null ? `${fmtDur(t.avgDurationMs)} / lượt` : undefined} />
            <Kpi icon={Database} tone="var(--chart-2)" label="Token" value={fmtNum(totalTok)} sub={`vào ${fmtNum(t.tokens.input)} · ra ${fmtNum(t.tokens.output)} · cache ${fmtNum(t.tokens.cacheRead + t.tokens.cacheWrite)}`} />
            <Kpi icon={Zap} tone="var(--chart-4)" label="Cache hit" value={t.cacheHitRate != null ? `${Math.round(t.cacheHitRate * 100)}%` : "–"} sub="prompt đọc từ cache" />
            <Kpi icon={TrendingUp} tone="var(--chart-1)" label="Dự báo 30 ngày" value={fmtUsd(t.projectedMonthUsd)} sub="theo tốc độ hiện tại" />
          </section>
          {noCost > 0 && <p className="-mt-1 text-xs text-muted-foreground">{noCost} run dùng provider không báo tiền (Gemini, OpenAI-compatible, Codex): chỉ có token, không tính vào chi phí.</p>}

          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div><CardTitle>Theo ngày</CardTitle><CardDescription>Xếp chồng theo model · chấm đỏ dưới cột = có run lỗi</CardDescription></div>
              <div role="group" aria-label="Chỉ số" className="inline-flex overflow-hidden rounded-lg border">
                {METRICS.map((m) => <button key={m.id} type="button" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)} className={cn("h-8 px-3 text-[13px]", metric === m.id ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50")}>{m.label}</button>)}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Legend items={[...r.byModel.filter((m) => m.key !== "_other").slice(0, 5).map((m, i) => ({ label: m.label, color: colorOf(i) })), ...(r.byModel.length > 5 ? [{ label: "Khác", color: colorOf(5) }] : [])]} />
              <DayChart days={r.byDay} metric={metric} models={modelOrder} />
            </CardContent>
          </Card>

          <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-4">
            <Card><CardHeader><CardTitle>Theo model</CardTitle><CardDescription>Tỉ trọng chi phí</CardDescription></CardHeader><CardContent><Donut data={r.byModel} metric={t.costUsd > 0 ? "costUsd" : "tokens"} center={t.costUsd > 0 ? fmtUsd(t.costUsd) : fmtNum(totalTok)} sub={`${r.byModel.length} model`} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Theo repo</CardTitle><CardDescription>Chi phí · số run</CardDescription></CardHeader><CardContent><HBars data={r.byRepo.slice(0, 8)} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Theo provider</CardTitle><CardDescription>Số run</CardDescription></CardHeader><CardContent><Donut data={r.byProvider} metric="runs" center={String(t.runs)} sub="run" /></CardContent></Card>
            <Card><CardHeader><CardTitle>Theo framework</CardTitle><CardDescription>Chi phí · số run</CardDescription></CardHeader><CardContent><HBars data={r.byFramework.slice(0, 8)} color="var(--chart-2)" /></CardContent></Card>
            <Card><CardHeader><CardTitle>Giờ chạy review</CardTitle><CardDescription>Số run theo thứ × giờ (giờ máy chủ)</CardDescription></CardHeader><CardContent><Heatmap heat={r.heat} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Phân bố chi phí mỗi run</CardTitle><CardDescription>Số run theo mức chi phí</CardDescription></CardHeader><CardContent><Histogram data={r.costBuckets} /></CardContent></Card>
          </section>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Review tốn nhất</CardTitle><CardDescription>10 lượt có chi phí cao nhất trong bộ lọc</CardDescription></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed text-[13px]"><colgroup><col /><col className="w-40" /><col className="w-24" /><col className="w-24" /><col className="w-28" /></colgroup>
                <thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="px-6 py-2 font-normal">MR</th><th className="px-2 py-2 font-normal">Model</th><th className="px-2 py-2 text-right font-normal">Token</th><th className="px-2 py-2 text-right font-normal">Thời gian</th><th className="px-6 py-2 text-right font-normal">Chi phí</th></tr></thead>
                <tbody>
                  {r.topRuns.map((x) => (
                    <tr key={x.runId} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="max-w-0 px-6 py-2"><Link to={`/reviews/${x.mrId}`} className="flex min-w-0 items-center gap-2 hover:underline"><span className="truncate"><span className="text-muted-foreground">{x.repo.split("/").pop()} !{x.iid}</span> · {x.title}</span>{x.status === "failed" && <Badge variant="danger">lỗi</Badge>}</Link></td>
                      <td className="px-2 py-2 text-muted-foreground">{x.model ?? "–"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{x.tokens ? fmtNum(x.tokens) : "–"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtDur(x.durationMs)}</td>
                      <td className="px-6 py-2 text-right font-medium tabular-nums">{x.costUsd != null ? fmtUsd(x.costUsd) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
