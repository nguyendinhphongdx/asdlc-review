import type { RepoDto } from "@mrd/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModelInput } from "../../kernel/model-input.js";
import { ErrorBox } from "../../kernel/page.js";
import { patchRepo } from "./api.js";

type Patch = Parameters<typeof patchRepo>[1];

const SELECT = "h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t px-5 py-4 first:border-t-0 sm:grid-cols-[1fr_260px] sm:items-center sm:gap-6">
      <div><div className="text-sm font-medium">{label}</div><p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p></div>
      <div className="sm:justify-self-end sm:w-full">{children}</div>
    </div>
  );
}

const tri = (v: boolean | null) => (v === null ? "default" : v ? "yes" : "no");
const untri = (s: string): boolean | null => (s === "default" ? null : s === "yes");

/** Cài đặt riêng cho repo: ghi đè cài đặt chung. Lưu ngay khi đổi. */
export function RepoSettings({ repo }: { repo: RepoDto }) {
  const qc = useQueryClient();
  const save = useMutation({ mutationFn: (p: Patch) => patchRepo(repo.id, p), onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }) });
  const [branches, setBranches] = useState(repo.targetBranches ?? "");
  const [budget, setBudget] = useState(repo.diffBudgetChars?.toString() ?? "");
  const check = (label: string, checked: boolean, on: (v: boolean) => void) => <input aria-label={label} type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked} onChange={(e) => on(e.target.checked)} />;
  return (
    <div className="flex flex-col gap-3">
      {save.error && <ErrorBox error={save.error} />}
      <Card><CardContent className="p-0">
        <Row label="Bật repo" hint="Tắt thì không poll, không review, bỏ qua webhook.">{check("Bật repo", repo.enabled, (v) => save.mutate({ enabled: v }))}</Row>
        <Row label="Tự động review" hint="Poller / webhook tự xếp hàng review MR mới. Tắt thì chỉ review khi bạn bấm (tốn tiền AI mỗi lần).">{check("Tự động review", repo.autoReview, (v) => save.mutate({ autoReview: v }))}</Row>
        <Row label="Nhánh đích cần review" hint="Chỉ tự review MR nhắm vào các nhánh này, cách nhau bằng dấu phẩy, hỗ trợ *. Để trống = mọi nhánh.">
          <Input aria-label="Nhánh đích" placeholder="develop, release/*" value={branches} onChange={(e) => setBranches(e.target.value)} onBlur={() => { if ((repo.targetBranches ?? "") !== branches.trim()) save.mutate({ targetBranches: branches.trim() || null }); }} />
        </Row>
        <Row label="Bỏ qua MR draft" hint="Không tự review MR đang ở trạng thái draft.">
          <select aria-label="Bỏ qua MR draft" className={SELECT} value={tri(repo.skipDrafts)} onChange={(e) => save.mutate({ skipDrafts: untri(e.target.value) })}>
            <option value="default">Theo cài đặt chung</option><option value="yes">Có, bỏ qua draft</option><option value="no">Không, review cả draft</option>
          </select>
        </Row>
        <Row label="Đăng comment lên MR" hint="Có đăng comment tổng hợp và inline lên GitLab sau mỗi lần review hay chỉ lưu kết quả trên dashboard.">
          <select aria-label="Đăng comment lên MR" className={SELECT} value={tri(repo.publishComments)} onChange={(e) => save.mutate({ publishComments: untri(e.target.value) })}>
            <option value="default">Theo framework</option><option value="yes">Luôn đăng</option><option value="no">Không đăng</option>
          </select>
        </Row>
        <Row label="Provider AI" hint="Công cụ AI dùng để review repo này.">
          <select aria-label="Provider AI" className={SELECT} value={repo.provider ?? ""} onChange={(e) => save.mutate({ provider: (e.target.value || null) as Patch["provider"] })}>
            <option value="">Theo cài đặt chung</option><option value="claude-cli">Claude Code CLI</option><option value="codex-cli">Codex CLI</option><option value="openai-compatible">OpenAI-compatible API</option>
          </select>
        </Row>
        <Row label="Model" hint="Model dùng review và chat cho repo này. Để trống = theo cài đặt chung của provider.">
          <ModelInput provider={repo.provider ?? "claude-cli"} label="Model của repo" placeholder="(theo cài đặt chung)" value={repo.model ?? ""} onCommit={(m) => save.mutate({ model: m || null })} />
        </Row>
        <Row label="Ngân sách diff (ký tự)" hint="Giới hạn lượng diff đưa vào prompt; MR lớn hơn sẽ bị cắt. Để trống = theo cài đặt chung.">
          <Input aria-label="Ngân sách diff" type="number" min={10000} max={1000000} step={10000} placeholder="120000" value={budget} onChange={(e) => setBudget(e.target.value)}
            onBlur={() => { const n = budget.trim() ? Number(budget) : null; if (n !== repo.diffBudgetChars && (n === null || (n >= 10000 && n <= 1000000))) save.mutate({ diffBudgetChars: n }); }} />
        </Row>
      </CardContent></Card>
    </div>
  );
}
