import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PageHeader } from "../../kernel/page.js";
import { ConnectionTab } from "./connection.js";
import { ReviewTab } from "./review-tab.js";
import { VersionTab } from "./version-tab.js";

const TABS = [{ id: "connection", label: "Kết nối" }, { id: "review", label: "Review" }, { id: "version", label: "Phiên bản" }] as const;

export function SettingsPage() {
  const [sp, setSp] = useSearchParams();
  const t = sp.get("tab");
  const tab = t === "review" || t === "version" ? t : "connection";
  return (
    <>
      <PageHeader title="Cài đặt" description="Kết nối nền tảng, cấu hình AI, framework và cách đăng comment lên MR." />
      <div role="tablist" aria-label="Nhóm cài đặt" className="-mt-2 flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setSp(t.id === "connection" ? {} : { tab: t.id }, { replace: true })}
            onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = TABS[(TABS.findIndex((x) => x.id === tab) + 1) % TABS.length]!; setSp(n.id === "connection" ? {} : { tab: n.id }, { replace: true }); document.getElementById(`tab-${n.id}`)?.focus(); } }}
            className={cn("-mb-px h-9 border-b-2 px-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-6">
        {tab === "connection" ? <ConnectionTab /> : tab === "review" ? <ReviewTab /> : <VersionTab />}
      </div>
    </>
  );
}
