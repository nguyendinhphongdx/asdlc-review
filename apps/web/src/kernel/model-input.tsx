import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Model gợi ý theo provider; chọn "Khác…" để gõ tên model bất kỳ mà CLI/API hỗ trợ. */
export const MODEL_SUGGESTIONS: Record<string, { value: string; label: string }[]> = {
  "claude-cli": [
    { value: "claude-opus-5-5", label: "Claude Opus 5.5 (mạnh nhất, đắt)" },
    { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (cân bằng)" },
    { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (nhanh, rẻ)" },
    { value: "claude-fable-5-2", label: "Claude Fable 5.2" },
  ],
  "codex-cli": [{ value: "gpt-5-codex", label: "GPT-5 Codex" }, { value: "gpt-5", label: "GPT-5" }],
  "gemini-api": [{ value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (mạnh nhất)" }, { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (nhanh, rẻ)" }],
  "openai-compatible": [{ value: "gpt-5", label: "GPT-5" }, { value: "gpt-5-mini", label: "GPT-5 mini" }, { value: "gpt-4.1", label: "GPT-4.1" }],
};

const SELECT = "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CUSTOM = "__custom__";

/** Chọn model từ danh sách (hoặc "Mặc định" / "Khác…"). Lưu ngay khi chọn. */
export function ModelInput({ provider, value, defaultLabel, label, onCommit }: { provider: string; value: string; defaultLabel: string; label: string; onCommit: (v: string) => void }) {
  const options = MODEL_SUGGESTIONS[provider] ?? [];
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
