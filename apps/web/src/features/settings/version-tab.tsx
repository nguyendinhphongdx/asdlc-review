import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { desktop, type UpdateEvent, type UpdateInfo } from "../../kernel/desktop.js";
import { getHealth } from "./api.js";

const PHASE = { download: "Đang tải", verify: "Đang kiểm tra gói", extract: "Đang giải nén", restart: "Đang khởi động lại…" } as const;

export function VersionTab() {
  const health = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const d = desktop();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<Extract<UpdateEvent, { type: "progress" }> | null>(null);
  const [cur, setCur] = useState<string>("");

  useEffect(() => {
    if (!d) return;
    void d.version().then((v) => setCur(v.version)).catch(() => undefined);
    void d.state().then((s) => { if (s) { setInfo(s); setChecked(true); } }).catch(() => undefined);
    return d.onEvent((e) => {
      if (e.type === "available") setInfo(e.info);
      else if (e.type === "progress") setProgress(e);
      else { setErr(e.message); setProgress(null); }
    });
  }, [d]);

  const version = cur || health.data?.version || "";
  const check = async () => {
    if (!d) return;
    setBusy(true); setErr("");
    try { setInfo(await d.check()); setChecked(true); } catch (e) { setErr(String((e as Error).message ?? e)); } finally { setBusy(false); }
  };
  const install = () => { setErr(""); setProgress({ type: "progress", phase: "download", percent: 0 }); void d?.install(); };
  const updating = progress != null;

  return (
    <>
      <Card>
        <CardHeader><CardTitle>ASDLC Review</CardTitle><CardDescription>Review merge request bằng AI, chấm điểm tất định, thống kê và xếp hạng.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Phiên bản</span><span className="font-mono">{version ? `v${version}` : "–"}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Hàng đợi</span><span className="font-mono">{health.data?.queue ?? "–"}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Mã nguồn</span><a className="underline" href="https://github.com/nguyendinhphongdx/asdlc-review" target="_blank" rel="noreferrer">github.com/nguyendinhphongdx/asdlc-review</a></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cập nhật</CardTitle><CardDescription>{d ? "App tự kiểm tra bản mới mỗi 6 giờ. Cập nhật xong app tự khởi động lại, dữ liệu được giữ nguyên." : "Chỉ khả dụng trong app desktop. Với bản chạy server/trình duyệt, hãy cập nhật bằng git hoặc tải bản mới."}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {d && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={busy || updating} onClick={() => void check()}>{busy ? "Đang kiểm tra…" : "Kiểm tra cập nhật"}</Button>
              {info?.available && info.canAuto && <Button disabled={updating} onClick={install}>{updating ? "Đang cập nhật…" : `Cập nhật lên v${info.latest}`}</Button>}
              {info?.available && !info.canAuto && <a className="text-sm font-medium underline" href={info.page} target="_blank" rel="noreferrer">Tải v{info.latest} thủ công</a>}
            </div>
          )}
          {checked && info && !info.available && <p role="status" className="text-sm text-muted-foreground">Bạn đang dùng bản mới nhất (v{info.current}).</p>}
          {info?.available && <p role="status" className="text-sm">Có bản mới <b>v{info.latest}</b> (đang dùng v{info.current}).{!info.canAuto && " Máy này không tự cập nhật được (app chưa đóng gói hoặc thư mục cài không ghi được)."}</p>}
          {progress && (
            <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
              <div className="text-sm">{PHASE[progress.phase]}{progress.phase === "download" ? ` ${progress.percent ?? 0}%` : ""}</div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${progress.phase === "download" ? progress.percent ?? 0 : 100}%` }} /></div>
            </div>
          )}
          {err && <p role="alert" className="text-sm text-danger-fg">{err}</p>}
        </CardContent>
      </Card>
    </>
  );
}
