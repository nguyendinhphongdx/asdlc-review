import type { RepoDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CopyButton } from "../../kernel/copy.js";
import { ErrorBox } from "../../kernel/page.js";
import { checkRepo, createRepoWebhook, getConnection, getRepoWebhook, getWebhookSecret, registerRepo } from "./api.js";

const Step = ({ n, active, done, title, children }: { n: number; active: boolean; done: boolean; title: string; children?: React.ReactNode }) => (
  <li className={cn("flex gap-3 py-3", !active && !done && "opacity-50")} aria-current={active ? "step" : undefined}>
    <span className={cn("mt-0.5 flex size-6 flex-none items-center justify-center rounded-full text-xs font-semibold", done ? "bg-success-bg text-success-fg" : active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{done ? <CircleCheck className="size-4" aria-hidden="true" /> : n}</span>
    <div className="min-w-0 flex-1"><div className="font-medium">{title}</div>{children}</div>
  </li>
);

export function AddRepoWizard({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [url, setUrl] = useState("");
  const [repo, setRepo] = useState<RepoDto | null>(null);
  const [created, setCreated] = useState(false);
  const [shown, setShown] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const f = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),a[href]")];
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);

  const check = useMutation({ mutationFn: () => checkRepo(url.trim()) });
  const register = useMutation({
    mutationFn: () => registerRepo(url.trim()),
    onSuccess: (r) => { setRepo(r); setStep(2); void qc.invalidateQueries({ queryKey: ["repos"] }); },
  });
  const auto = useMutation({ mutationFn: () => createRepoWebhook(repo!.id), onSuccess: () => { setCreated(true); void qc.invalidateQueries({ queryKey: ["repos"] }); } });
  const conn = useQuery({ queryKey: ["connection"], queryFn: getConnection, enabled: step === 2 });
  const secret = useQuery({ queryKey: ["webhook-secret"], queryFn: getWebhookSecret, enabled: step === 2, gcTime: 0, staleTime: 0 });
  const poll = useQuery({
    queryKey: ["repo-webhook", repo?.id], queryFn: () => getRepoWebhook(repo!.id), enabled: step === 3 && !!repo,
    refetchInterval: (s) => (s.state.data?.events.some((e) => e.result === "accepted") ? false : 3000),
  });
  const got = !!poll.data?.events.some((e) => e.result === "accepted");
  const rejected = poll.data?.events.filter((e) => e.result === "rejected").length ?? 0;
  const c = check.data;
  const canNext = !!c?.ok && !check.isPending;
  const finish = () => { void qc.invalidateQueries({ queryKey: ["repos"] }); void qc.invalidateQueries({ queryKey: ["repo-webhook", repo?.id] }); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="wiz-title" className="w-full max-w-xl rounded-xl border bg-card p-5 text-card-foreground shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="wiz-title" className="text-base font-semibold">Thêm repository</h2><p className="text-[13px] text-muted-foreground">Bước {step} / 3</p></div>
          <Button variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}><X /></Button>
        </div>
        <ol className="mt-2 divide-y">
          <Step n={1} active={step === 1} done={step > 1} title="Chọn repository">
            {step === 1 ? (
              <form className="mt-2 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (!url.trim()) return; if (canNext) register.mutate(); else check.mutate(); }}>
                <div className="flex flex-wrap gap-2">
                  <Input autoFocus aria-label="Link repository" className="flex-[1_1_260px]" placeholder="https://gitlab.example.com/group/project" value={url} onChange={(e) => { setUrl(e.target.value); if (check.data || check.error) check.reset(); register.reset(); }} />
                  <Button type="button" variant="outline" disabled={!url.trim() || check.isPending} onClick={() => check.mutate()}>{check.isPending && <Loader2 className="animate-spin" />}Kiểm tra</Button>
                </div>
                {check.error && <ErrorBox error={check.error} />}
                {c && !c.ok && <div role="alert" className="rounded-lg border border-danger bg-danger-bg p-3 text-sm text-danger-fg">{c.error ?? "Không truy cập được repository này bằng token hiện tại."}</div>}
                {c?.ok && <p role="status" className="text-[13px] text-success-fg"><span className="font-mono">{c.fullPath}</span> · token truy cập được{c.defaultBranch ? ` · nhánh mặc định ${c.defaultBranch}` : ""}</p>}
                {register.error && <ErrorBox error={register.error} />}
                <div className="flex justify-end"><Button type="submit" disabled={!canNext || register.isPending}>{register.isPending && <Loader2 className="animate-spin" />}Tiếp tục</Button></div>
              </form>
            ) : repo && <p className="text-[13px] text-muted-foreground"><span className="font-mono">{repo.fullPath}</span> · token truy cập được{repo.defaultBranch ? ` · nhánh mặc định ${repo.defaultBranch}` : ""}</p>}
          </Step>

          <Step n={2} active={step === 2} done={step > 2} title="Tạo webhook trên GitLab">
            {step === 2 && (
              <div className="mt-2 flex flex-col gap-4">
                {c?.canCreateWebhook && (
                  <div className="flex flex-col gap-2 rounded-lg bg-muted p-3 text-[13px]">
                    <p>Tự động: token của bạn có quyền Maintainer trên repo này, hệ thống có thể tạo webhook giúp bạn.</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm" disabled={auto.isPending || created} onClick={() => auto.mutate()}>{auto.isPending && <Loader2 className="animate-spin" />}{created ? "Đã tạo webhook" : "Tạo tự động"}</Button>
                      {created && <span role="status" className="text-success-fg">Webhook đã được tạo trên GitLab.</span>}
                    </div>
                    {auto.error && <ErrorBox error={auto.error} />}
                  </div>
                )}
                {!c?.canCreateWebhook && <p className="text-[13px] text-muted-foreground">Token chưa đủ quyền Maintainer để tạo webhook tự động, hãy tạo thủ công.</p>}
                <div className="flex flex-col gap-2 text-[13px]">
                  <p>{c?.canCreateWebhook ? "Hoặc làm thủ công: " : ""}Settings → Webhooks → Add new webhook, dán 2 giá trị dưới, tích <b>Merge request events</b> và <b>Comments</b>, rồi Save.</p>
                  <div><label htmlFor="wz-url" className="mb-1 block font-medium">URL</label>
                    <div className="flex flex-wrap gap-2"><Input id="wz-url" readOnly className="flex-[1_1_220px] font-mono text-[13px]" value={conn.data?.webhook.url ?? ""} placeholder={conn.isLoading ? "Đang tải…" : ""} /><CopyButton disabled={!conn.data} getValue={() => conn.data?.webhook.url} /></div></div>
                  <div><label htmlFor="wz-secret" className="mb-1 block font-medium">Secret token</label>
                    <div className="flex flex-wrap gap-2"><Input id="wz-secret" readOnly autoComplete="off" className="flex-[1_1_220px] font-mono text-[13px]" value={shown && secret.data ? secret.data.secret : "•".repeat(24)} />
                      <Button type="button" variant="outline" size="sm" className="h-9" disabled={!secret.data} aria-pressed={shown} onClick={() => setShown((v) => !v)}>{shown ? <EyeOff /> : <Eye />}{shown ? "Ẩn" : "Hiện"}</Button>
                      <CopyButton disabled={!secret.data} getValue={() => secret.data?.secret} /></div></div>
                  {(conn.error || secret.error) && <ErrorBox error={conn.error ?? secret.error} />}
                  <p className="text-xs text-muted-foreground">Chưa có secret? Tạo trong <Link to="/settings" className="underline">Cài đặt → Kết nối</Link>.</p>
                </div>
                <div className="flex justify-end"><Button onClick={() => setStep(3)}>Tiếp tục</Button></div>
              </div>
            )}
          </Step>

          <Step n={3} active={step === 3} done={got} title="Gửi sự kiện thử">
            {step === 3 && (
              <div className="mt-2 flex flex-col gap-3 text-[13px]">
                <p>Sau khi lưu webhook, bấm "Test → Merge request events" trên GitLab. Trang này sẽ tự cập nhật khi nhận được.</p>
                {got ? <p role="status" className="flex items-center gap-2 font-medium text-success-fg"><CircleCheck className="size-4" aria-hidden="true" />Đã nhận sự kiện đầu tiên. Webhook hoạt động.</p>
                  : <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Đang chờ sự kiện đầu tiên…</p>}
                {!got && rejected > 0 && <div role="alert" className="rounded-lg border border-warning bg-warning-bg p-3 text-warning-fg">Đã có {rejected} sự kiện bị từ chối — thường do secret không khớp. Kiểm tra lại secret đã dán trên GitLab.</div>}
                {poll.error && <ErrorBox error={poll.error} />}
              </div>
            )}
          </Step>
        </ol>
        <div className="mt-3 flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>{step === 3 && !got ? "Làm sau" : "Huỷ"}</Button>
          <Button disabled={!got} onClick={finish}>Hoàn tất</Button>
        </div>
      </div>
    </div>
  );
}
