import type { FrameworkDetailDto, FrameworkInfoDto, FrameworkKind } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitFork, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { InlineConfirm } from "../../kernel/confirm.js";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { deleteFramework, getFramework, listFrameworks, restoreFramework } from "./api.js";
import { FrameworkChat } from "./chat.js";
import { FrameworkEditor } from "./edit.js";
import { ForkDialog } from "./fork-dialog.js";
import { OverviewView } from "./overview-editor.js";
import { RulesView, ScoringView } from "./view.js";
import { DiffView, VersionsView } from "./versions.js";
import { Workflow } from "./workflow.js";

const KIND: Record<FrameworkKind, { label: string; variant: "success" | "info" | "secondary" }> = {
  default: { label: "Mặc định", variant: "success" }, template: { label: "Mẫu", variant: "info" }, custom: { label: "Đã chỉnh", variant: "secondary" },
};
const ORDER: Record<FrameworkKind, number> = { default: 0, template: 1, custom: 2 };
const TABS = [{ id: "flow", label: "Quy trình" }, { id: "rules", label: "Hạng mục & rule" }, { id: "scoring", label: "Chấm điểm" }, { id: "overview", label: "Đánh giá tổng quan" }, { id: "versions", label: "Phiên bản" }] as const;
type TabId = (typeof TABS)[number]["id"];

function FrameworkList({ items, selected, onSelect, onCreate }: { items: FrameworkInfoDto[]; selected: string | undefined; onSelect: (id: string) => void; onCreate: () => void }) {
  return (
    <Card className="flex flex-col overflow-hidden lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-center justify-between gap-2 border-b p-4"><h2 className="text-sm font-semibold">Framework ({items.length})</h2><Button size="sm" onClick={onCreate}><Plus />Tạo từ mẫu</Button></div>
      <ul className="flex flex-col p-2" aria-label="Danh sách framework">
        {items.map((f) => (
          <li key={f.id}>
            <button type="button" aria-current={f.id === selected ? "true" : undefined} onClick={() => onSelect(f.id)}
              className={cn("flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", f.id === selected ? "bg-muted" : "hover:bg-muted/60")}>
              <span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span><Badge variant={KIND[f.kind].variant}>{KIND[f.kind].label}</Badge></span>
              <span className="text-xs text-muted-foreground">v{f.version} · {f.categories.length} hạng mục · {f.ruleCount} rule · {f.repoCount} repo</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Detail({ info, bases, onSelect, onDirty, onFork }: { info: FrameworkInfoDto; bases: FrameworkInfoDto[]; onSelect: (id: string | undefined) => void; onDirty: (n: number) => void; onFork: (baseId: string) => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("flow");
  const [version, setVersion] = useState<number | undefined>();
  const [editing, setEditing] = useState(false);
  const [diff, setDiff] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["framework", info.id, version ?? "latest"], queryFn: () => getFramework(info.id, version) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["frameworks"] }); void qc.invalidateQueries({ queryKey: ["framework", info.id] }); void qc.invalidateQueries({ queryKey: ["framework-diff", info.id] }); };
  const saved = (d: FrameworkDetailDto) => { qc.setQueryData(["framework", info.id, "latest"], d); setEditing(false); setVersion(undefined); refresh(); };
  const del = useMutation({ mutationFn: () => deleteFramework(info.id), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["frameworks"] }); onSelect(undefined); } });
  const restore = useMutation({ mutationFn: (v: number) => restoreFramework(info.id, v), onSuccess: (d) => { setConfirmRestore(null); saved(d); setTab("versions"); } });
  const d = q.data;
  if (q.isLoading) return <Loading />;
  if (q.error || !d) return <ErrorBox error={q.error ?? new Error("Không tải được framework")} />;
  const custom = d.kind === "custom";
  const latest = d.versions[0]?.version;
  const old = custom && version !== undefined && version !== latest;
  const baseName = bases.find((b) => b.id === d.baseId)?.name ?? d.baseId ?? "bản gốc";
  const view = (v: number | undefined) => { setVersion(v); setConfirmRestore(null); };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{d.name}</h2><Badge variant={KIND[d.kind].variant}>{KIND[d.kind].label}</Badge><Badge variant="outline">v{d.version}</Badge></div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {d.readOnly ? "Chỉ đọc. Muốn chỉnh trọng số, rule hay gate, hãy tạo bản chỉnh sửa (fork)." : `Bản chỉnh sửa từ ${baseName}. ${info.repoCount} repo đang dùng.`}
          </p>
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            {d.readOnly && <Button onClick={() => onFork(d.id)}><GitFork />Tạo bản chỉnh sửa (fork)</Button>}
            {custom && <Button variant="outline" aria-pressed={diff} onClick={() => setDiff(!diff)}>So với bản gốc</Button>}
            {custom && !old && <Button onClick={() => { setTab("rules"); setEditing(true); }}><Pencil />Chỉnh sửa</Button>}
            {custom && <Button variant="outline" onClick={() => { setConfirmDel(true); del.reset(); }}><Trash2 />Xoá</Button>}
          </div>
        )}
      </Card>
      {confirmDel && <InlineConfirm message={`Xoá "${d.name}" cùng toàn bộ lịch sử phiên bản? Không thể hoàn tác.${info.repoCount ? ` ${info.repoCount} repo đang dùng sẽ khiến thao tác bị từ chối.` : ""}`} confirmLabel="Xoá framework" pending={del.isPending} onConfirm={() => del.mutate()} onCancel={() => setConfirmDel(false)} />}
      {del.error && <ErrorBox error={del.error} />}
      {restore.error && <ErrorBox error={restore.error} />}

      {old && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning bg-warning-bg px-4 py-3 text-sm text-warning-fg">
          <span className="min-w-0 flex-1">Đang xem phiên bản cũ v{version}, không phải bản mới nhất (v{latest}). Chỉ xem, không sửa được.</span>
          <Button size="sm" variant="outline" onClick={() => view(undefined)}>Về bản mới nhất</Button>
          <Button size="sm" disabled={restore.isPending} onClick={() => setConfirmRestore(version!)}>Khôi phục bản này</Button>
        </div>
      )}
      {confirmRestore !== null && <InlineConfirm message={`Khôi phục v${confirmRestore}? Hệ thống tạo phiên bản mới có nội dung của v${confirmRestore}; ${info.repoCount} repo đang dùng sẽ áp dụng từ review kế tiếp.`} confirmLabel="Khôi phục" pending={restore.isPending} onConfirm={() => restore.mutate(confirmRestore)} onCancel={() => setConfirmRestore(null)} />}
      {diff && custom && <DiffView id={d.id} version={version} baseName={baseName} />}

      {editing ? <FrameworkEditor key={`${d.id}-${d.version}`} detail={d} repoCount={info.repoCount} onCancel={() => setEditing(false)} onSaved={saved} onDirty={onDirty} /> : (
        <>
          <div role="tablist" aria-label="Nội dung framework" className="flex gap-1 overflow-x-auto border-b">
            {TABS.map((t, i) => (
              <button key={t.id} id={`fw-tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls="fw-panel" tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}
                onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!; setTab(n.id); document.getElementById(`fw-tab-${n.id}`)?.focus(); } }}
                className={cn("-mb-px h-9 shrink-0 border-b-2 px-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>
            ))}
          </div>
          <div role="tabpanel" id="fw-panel" aria-labelledby={`fw-tab-${tab}`} className="flex flex-col gap-4">
            {tab === "flow" && <Workflow />}
            {tab === "rules" && <RulesView d={d} />}
            {tab === "scoring" && <ScoringView d={d} />}
            {tab === "overview" && <OverviewView overview={d.overview} mrDescription={d.mrDescription} />}
            {tab === "versions" && <VersionsView d={d} viewing={version} onView={view} onRestore={setConfirmRestore} restoring={restore.isPending} />}
          </div>
        </>
      )}
    </div>
  );
}

export function FrameworkPage() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["frameworks"], queryFn: listFrameworks });
  const [dirty, setDirty] = useState(0);
  const [fork, setFork] = useState<string | null>(null);
  const items = [...(list.data ?? [])].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const selected = items.find((f) => f.id === sp.get("id")) ?? items[0];
  const onDirty = useCallback((n: number) => setDirty(n), []);
  useEffect(() => { if (!selected) setDirty(0); }, [selected]);
  const select = (id: string | undefined) => {
    if (dirty > 0 && !confirm("Có thay đổi chưa lưu. Rời đi sẽ mất chúng. Tiếp tục?")) return;
    setDirty(0);
    setSp(id ? { id } : {}, { replace: true });
  };
  const bases = items.filter((f) => f.kind !== "custom");
  return (
    <>
      <PageHeader title="Framework" description="Bộ tiêu chí review: quy trình, hạng mục, rule và cách chấm điểm. Mỗi repo chọn một framework; .asdlc.yml của repo có thể ghi đè." />
      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : !selected ? <Card><Empty>Chưa có framework nào.</Empty></Card> : (
        <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <FrameworkList items={items} selected={selected.id} onSelect={select} onCreate={() => setFork(bases.find((b) => b.kind === "default")?.id ?? bases[0]?.id ?? "")} />
          <Detail key={selected.id} info={selected} bases={bases} onSelect={select} onDirty={onDirty} onFork={setFork} />
        </div>
      )}
      {selected && (
        <FrameworkChat key={selected.id} frameworkId={selected.id} name={selected.name} onApplied={(id) => {
          void qc.invalidateQueries({ queryKey: ["frameworks"] });
          void qc.invalidateQueries({ queryKey: ["framework"] });
          void qc.invalidateQueries({ queryKey: ["framework-diff"] });
          if (id !== selected.id) { setDirty(0); setSp({ id }, { replace: true }); }
        }} />
      )}
      {fork !== null && bases.length > 0 && <ForkDialog bases={bases} initialBaseId={fork} onClose={() => setFork(null)} onDone={(d) => { setFork(null); setDirty(0); setSp({ id: d.id }, { replace: true }); void list.refetch(); }} />}
    </>
  );
}
