import { useState } from "react";
import { Input } from "@/components/ui/input";

const SELECT = "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CUSTOM = "__custom__";

/** Chọn model từ danh sách `models` (lấy từ mô tả provider ở server) (hoặc "Mặc định" / "Khác…"). Lưu ngay khi chọn. */
export function ModelInput({ models: options, value, defaultLabel, label, onCommit }: { models: { value: string; label: string }[]; value: string; defaultLabel: string; label: string; onCommit: (v: string) => void }) {
  const known = value === "" || options.some((o) => o.value === value);
  const [custom, setCustom] = useState(!known);
  return (
    <div className="flex w-full flex-col gap-2">
      <select aria-label={label} className={SELECT} value={custom ? CUSTOM : value} onChange={(e) => {
        if (e.target.value === CUSTOM) { setCustom(true); return; }
        setCustom(false); onCommit(e.target.value);
      }}>
        <option value="">{defaultLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={CUSTOM}>Khác… (gõ tên model)</option>
      </select>
      {custom && <Input aria-label={`${label} (tên model)`} placeholder="vd claude-sonnet-5-5" defaultValue={known ? "" : value} onBlur={(e) => { const v = e.target.value.trim(); if (v !== value) onCommit(v); }} />}
    </div>
  );
}
