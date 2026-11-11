import type { ConnectionErrorCode, ConnectionStatusDto, ConnectionTestDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Eye, EyeOff, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InlineConfirm } from "../../kernel/confirm.js";
import { CopyButton } from "../../kernel/copy.js";
import { fmtDate } from "../../kernel/format.js";
import { ErrorBox, Loading } from "../../kernel/page.js";
import { deleteGitlabConnection, getConnection, getWebhookSecret, regenerateWebhookSecret, saveGitlabConnection, testConnection } from "./api.js";

const Label = ({ htmlFor, children }: { htmlFor?: string; children: string }) => <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium">{children}</label>;
const Hint = ({ id, children }: { id?: string; children: React.ReactNode }) => <p id={id} className="mt-1.5 text-xs text-muted-foreground">{children}</p>;

const ERR_TITLE: Record<ConnectionErrorCode, string> = {
  not_configured: "Chưa cấu hình GitLab", unreachable: "Không kết nối được tới GitLab", unauthorized: "Token không hợp lệ",
  no_projects: "Token chưa truy cập được repository nào", missing_scope: "Token thiếu quyền (scope)", expired: "Token đã hết hạn", unknown: "Kiểm tra kết nối thất bại",
};

function TestResult({ pending, result, error }: { pending: boolean; result?: ConnectionTestDto; error: unknown }) {
  if (pending) return <div role="status" className="flex items-center gap-2 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Đang kiểm tra kết nối…</div>;
  if (error) return <ErrorBox error={error} />;
  if (!result) return null;
  if (!result.ok) {
    const e = result.error;
    return (
      <section role="alert" className="flex gap-3 rounded-lg border border-danger bg-danger-bg px-4 py-3 text-danger-fg">
        <CircleAlert className="mt-0.5 size-5 flex-none" aria-hidden="true" />
        <div className="text-[13px]"><div className="text-sm font-semibold">{ERR_TITLE[e?.code ?? "unknown"]}</div><p className="mt-0.5">{e?.message ?? "Không rõ nguyên nhân."}</p>{e?.hint && <p className="mt-1">{e.hint}</p>}</div>
      </section>
    );
  }
  const days = result.expiresAt ? Math.ceil((new Date(result.expiresAt).getTime() - Date.now()) / 86_400_000) : null;
  const rows: [string, React.ReactNode][] = [
    ["Tài khoản bot", result.user ? <>{result.user.name} <span className="text-muted-foreground">(@{result.user.username})</span></> : "–"],
    ["Scope", result.scopes?.length ? <span className="inline-flex flex-wrap gap-1">{result.scopes.map((x) => <Badge key={x} className="font-mono">{x}</Badge>)}</span> : "–"],
    ["Hết hạn", result.expiresAt ? <>{new Date(result.expiresAt).toLocaleDateString("vi-VN")}{days != null && <span className={days <= 14 ? "text-warning-fg" : "text-muted-foreground"}> ({days >= 0 ? `còn ${days} ngày` : "đã hết hạn"})</span>}</> : "Không hết hạn"],
    ["Repo truy cập được", result.projectCount != null ? `${result.projectCount} repository` : "–"],
    ["LLM", <span className="inline-flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{result.llm.provider}</span><Badge variant={result.llm.available ? "success" : "warning"}>{result.llm.available ? "sẵn sàng" : "chưa sẵn sàng"}</Badge>{result.llm.detail && <span className="text-xs text-muted-foreground">{result.llm.detail}</span>}</span>],
  ];
  return (
    <section role="status" className="rounded-lg border border-success bg-success-bg px-4 py-3 text-success-fg">
      <div className="flex items-center gap-2 text-sm font-semibold"><CircleCheck className="size-5" aria-hidden="true" />Kết nối thành công · kiểm tra lúc {fmtDate(result.checkedAt)}</div>
      <dl className="mt-2.5 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-[13px] text-foreground">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  );
}

function GitlabCard({ c }: { c: ConnectionStatusDto }) {
  const qc = useQueryClient();
  const g = c.gitlab;
  const [url, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const baseUrl = url ?? g.baseUrl;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["connection"] }); void qc.invalidateQueries({ queryKey: ["health"] }); };
  const test = useMutation({ mutationFn: testConnection });
  const save = useMutation({
    mutationFn: () => saveGitlabConnection({ baseUrl: baseUrl.trim(), ...(token.trim() ? { token: token.trim() } : {}) }),
    onSuccess: () => { setToken(""); setReplacing(false); void qc.invalidateQueries({ queryKey: ["connection"] }).then(() => setUrl(null)); void qc.invalidateQueries({ queryKey: ["health"] }); test.mutate(); },
  });
  const del = useMutation({ mutationFn: deleteGitlabConnection, onSuccess: () => { setConfirmDel(false); setToken(""); setReplacing(false); setUrl(null); test.reset(); save.reset(); refresh(); } });
  const dirty = baseUrl.trim() !== g.baseUrl || token.trim() !== "";
  const showTokenInput = !g.tokenSet || replacing;
  const busy = save.isPending || test.isPending;
  const masked = g.tokenSet ? `${"•".repeat(16)}${g.tokenHint ?? ""}` : "";
  return (
    <Card>
      <CardHeader><CardTitle>GitLab</CardTitle><CardDescription>Bot dùng token này để đọc MR, clone code và đăng comment.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!c.canStoreSecrets && (
          <div role="alert" className="flex gap-3 rounded-lg border border-warning bg-warning-bg px-4 py-3 text-[13px] text-warning-fg">
            <TriangleAlert className="mt-0.5 size-5 flex-none" aria-hidden="true" />
            <div><div className="text-sm font-semibold">Chưa thể lưu token từ giao diện</div>Máy chủ chưa có khoá mã hoá nên ô nhập token bị khoá. Đặt khoá mã hoá trong cấu hình máy chủ (biến môi trường) rồi khởi động lại, hoặc cấu hình token qua biến môi trường.</div>
          </div>
        )}
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (dirty) save.mutate(); else test.mutate(); }}>
          <div>
            <Label htmlFor="gl-url">URL GitLab</Label>
            <Input id="gl-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://gitlab.com" aria-describedby="gl-url-h" value={baseUrl} onChange={(e) => setUrl(e.target.value)} />
            <Hint id="gl-url-h">Mặc định gitlab.com. Instance tự host: nhập đầy đủ https://…</Hint>
          </div>
          <div>
            <Label htmlFor="gl-token">Access token</Label>
            <div className="flex flex-wrap gap-2">
              {showTokenInput ? (
                <Input id="gl-token" type="password" autoComplete="new-password" spellCheck={false} className="flex-[1_1_280px]" placeholder="glpat-xxxxxxxxxxxxxxxxxxxx" aria-describedby="gl-token-h" disabled={!c.canStoreSecrets} value={token} onChange={(e) => setToken(e.target.value)} />
              ) : (
                <Input id="gl-token" readOnly autoComplete="off" className="flex-[1_1_280px] font-mono" aria-describedby="gl-token-h" value={g.source === "env" ? "Đang dùng token từ biến môi trường" : masked} />
              )}
              {g.tokenSet && !replacing && <Button type="button" variant="outline" size="sm" className="h-9" disabled={!c.canStoreSecrets} onClick={() => setReplacing(true)}>Thay token</Button>}
              {replacing && <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setReplacing(false); setToken(""); }}>Huỷ thay</Button>}
            </div>
            <Hint id="gl-token-h">Token được mã hoá khi lưu và không bao giờ hiển thị lại. Cần scope <code className="font-mono">api</code> và vai trò Developer trở lên.</Hint>
            <details className="mt-2 rounded-lg border bg-muted/30 text-sm">
              <summary className="cursor-pointer select-none px-3 py-2 font-medium">Cách tạo token</summary>
              <ol className="list-decimal space-y-1.5 px-3 pb-3 pl-8 text-muted-foreground">
                <li>Nên dùng <b className="text-foreground">tài khoản bot riêng</b> hoặc Project/Group Access Token để comment hiện dưới tên bot.</li>
                <li>GitLab → <b className="text-foreground">Preferences → Access tokens</b> (token của project/group: <b className="text-foreground">Settings → Access tokens</b>) → <b className="text-foreground">Add new token</b>.</li>
                <li>Chọn scope: <code className="font-mono text-foreground">api</code> và <code className="font-mono text-foreground">read_repository</code>. Thiếu <code className="font-mono">api</code> sẽ không comment được.</li>
                <li>Vai trò: <b className="text-foreground">Developer</b> để review và comment; <b className="text-foreground">Maintainer</b> nếu muốn tạo webhook tự động.</li>
                <li>Đặt hạn dùng (≤ 1 năm), bấm tạo rồi <b className="text-foreground">sao chép ngay</b>: GitLab chỉ hiện token một lần.</li>
                <li>Thêm bot vào repo/group cần review, dán token vào ô trên và bấm <b className="text-foreground">Lưu &amp; kiểm tra</b>.</li>
              </ol>
            </details>
          </div>
          <div aria-live="polite" className="flex flex-col gap-3">
            <TestResult pending={busy} result={test.data} error={save.error ?? test.error} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || (!dirty && g.source === "none") || (dirty && !baseUrl.trim())}>{dirty ? "Lưu & kiểm tra" : "Kiểm tra kết nối"}</Button>
            {g.source === "db" && !confirmDel && <Button type="button" variant="ghost" disabled={busy || del.isPending} onClick={() => setConfirmDel(true)}>Xoá kết nối</Button>}
          </div>
        </form>
        {confirmDel && <InlineConfirm message="Xoá kết nối GitLab? Token đã lưu sẽ bị xoá và bot ngừng review cho tới khi bạn kết nối lại." confirmLabel="Xoá kết nối" pending={del.isPending} onConfirm={() => del.mutate()} onCancel={() => setConfirmDel(false)} />}
        {del.error && <ErrorBox error={del.error} />}
      </CardContent>
    </Card>
  );
}

function WebhookCard({ c }: { c: ConnectionStatusDto }) {
  const qc = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const load = useMutation({ mutationFn: getWebhookSecret, onSuccess: (d) => setSecret(d.secret) });
  const regen = useMutation({ mutationFn: regenerateWebhookSecret, onSuccess: (d) => { setSecret(d.secret); setShown(true); setConfirm(false); void qc.invalidateQueries({ queryKey: ["connection"] }); } });
  const ensure = async () => secret ?? (await load.mutateAsync()).secret;
  const toggle = async () => { if (shown) return setShown(false); try { await ensure(); setShown(true); } catch { /* lỗi hiện qua load.error */ } };
  const w = c.webhook;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5"><CardTitle>Webhook</CardTitle><CardDescription>GitLab gọi về địa chỉ này mỗi khi MR được tạo hoặc có commit mới.</CardDescription></div>
        <Badge variant={w.secretSet ? "success" : "warning"}>{w.secretSet ? "Secret đã đặt" : "Chưa có secret"}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Label htmlFor="wh-url">URL</Label>
          <div className="flex flex-wrap gap-2"><Input id="wh-url" readOnly className="flex-[1_1_280px] font-mono text-[13px]" value={w.url} /><CopyButton getValue={() => w.url} /></div>
        </div>
        <div>
          <Label htmlFor="wh-secret">Secret token</Label>
          {w.secretSet || secret ? (
            <div className="flex flex-wrap gap-2">
              <Input id="wh-secret" readOnly autoComplete="off" className="flex-[1_1_280px] font-mono text-[13px]" value={shown && secret ? secret : "•".repeat(24)} />
              <Button type="button" variant="outline" size="sm" className="h-9" disabled={load.isPending} aria-pressed={shown} onClick={() => void toggle()}>{shown ? <EyeOff /> : <Eye />}{shown ? "Ẩn" : "Hiện"}</Button>
              <CopyButton getValue={ensure} />
              {!confirm && <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setConfirm(true)}><RefreshCw />Tạo lại</Button>}
            </div>
          ) : <Button type="button" variant="outline" size="sm" disabled={regen.isPending} onClick={() => regen.mutate()}>Tạo secret</Button>}
          <Hint>Tạo lại secret sẽ làm webhook cũ bị từ chối cho tới khi cập nhật trên GitLab.</Hint>
        </div>
        {confirm && <InlineConfirm message="Tạo lại secret? Mọi webhook đang dùng secret cũ sẽ bị từ chối cho tới khi bạn cập nhật secret mới trên GitLab." confirmLabel="Tạo lại" pending={regen.isPending} onConfirm={() => regen.mutate()} onCancel={() => setConfirm(false)} />}
        {(load.error || regen.error) && <ErrorBox error={load.error ?? regen.error} />}
      </CardContent>
    </Card>
  );
}

export function ConnectionTab() {
  const q = useQuery({ queryKey: ["connection"], queryFn: getConnection });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const c = q.data!;
  return <><GitlabCard c={c} /><WebhookCard c={c} /></>;
}
