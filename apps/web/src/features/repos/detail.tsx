import type { RepoDto } from "@mrd/contracts";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FrameworkPicker } from "./framework-picker.js";
import { HarnessTab } from "./harness-tab.js";
import { MemoryTab } from "./memory-tab.js";
import { RepoSettings } from "./settings-tab.js";
import { WebhookLog } from "./webhook-log.js";

const TABS = [{ id: "settings", label: "Cài đặt" }, { id: "framework", label: "Framework" }, { id: "harness", label: "Harness" }, { id: "memory", label: "Bộ nhớ" }, { id: "webhook", label: "Webhook" }] as const;
type TabId = (typeof TABS)[number]["id"];

/** Khung chi tiết repo: framework áp dụng, độ phủ harness và nhật ký webhook. */
export function RepoDetail({ repo, onClose }: { repo: RepoDto; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("settings");
  return (
    <div className="flex flex-col gap-4" aria-label={`Chi tiết ${repo.fullPath}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-semibold">Chi tiết — <span className="font-mono text-sm">{repo.fullPath}</span></h2>
        <Button variant="ghost" size="icon" aria-label="Đóng chi tiết" onClick={onClose}><X /></Button>
      </div>
      <div role="tablist" aria-label="Chi tiết repo" className="-mt-2 flex gap-1 border-b">
        {TABS.map((t, i) => (
          <button key={t.id} id={`repo-tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls="repo-panel" tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}
            onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!; setTab(n.id); document.getElementById(`repo-tab-${n.id}`)?.focus(); } }}
            className={cn("-mb-px h-9 border-b-2 px-3.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id="repo-panel" aria-labelledby={`repo-tab-${tab}`} className="flex flex-col gap-4">
        {tab === "settings" && <RepoSettings repo={repo} />}
        {tab === "framework" && <FrameworkPicker repo={repo} />}
        {tab === "harness" && <HarnessTab repo={repo} />}
        {tab === "memory" && <MemoryTab repo={repo} />}
        {tab === "webhook" && <Card className="overflow-hidden"><WebhookLog id={repo.id} fullPath={repo.fullPath} /></Card>}
      </div>
    </div>
  );
}
