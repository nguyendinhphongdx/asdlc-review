import { Input } from "@/components/ui/input";

/** Gợi ý model theo provider (vẫn gõ tay được bất kỳ model nào CLI/API hỗ trợ). */
export const MODEL_SUGGESTIONS: Record<string, string[]> = {
  "claude-cli": ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2", "opus", "sonnet", "haiku"],
  "codex-cli": ["gpt-5-codex", "gpt-5"],
  "openai-compatible": ["gpt-5", "gpt-5-mini", "gpt-4.1"],
};

/** Ô nhập model có gợi ý; lưu khi rời ô. Để trống = mặc định. */
export function ModelInput({ provider, value, placeholder, label, onCommit }: { provider: string; value: string; placeholder: string; label: string; onCommit: (v: string) => void }) {
  const id = `models-${provider}-${label.replace(/\W+/g, "")}`;
  return (
    <>
      <Input aria-label={label} list={id} placeholder={placeholder} defaultValue={value} key={value} onBlur={(e) => { const v = e.target.value.trim(); if (v !== value) onCommit(v); }} />
      <datalist id={id}>{(MODEL_SUGGESTIONS[provider] ?? []).map((m) => <option key={m} value={m} />)}</datalist>
    </>
  );
}
