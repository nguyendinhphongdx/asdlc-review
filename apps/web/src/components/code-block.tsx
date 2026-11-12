import { Highlight, themes } from "prism-react-renderer";
import { cn } from "@/lib/utils";

const LANG: Record<string, string> = { ts: "tsx", tsx: "tsx", js: "jsx", jsx: "jsx", mjs: "jsx", cjs: "jsx", py: "python", go: "go", rs: "rust", kt: "kotlin", swift: "swift", json: "json", yml: "yaml", yaml: "yaml", css: "css", html: "markup", xml: "markup", md: "markdown", cpp: "cpp", cc: "cpp", c: "cpp", h: "cpp", java: "java", cs: "csharp", sh: "bash" };
const langOf = (file?: string | null) => LANG[(file?.split(".").pop() ?? "").toLowerCase()] ?? "tsx";

/** Khối code/diff có tô màu cú pháp. Tự nhận diff (đa số dòng bắt đầu bằng +/−/khoảng trắng). */
export function CodeBlock({ code, file, className }: { code: string; file?: string | null; className?: string }) {
  const lines = code.replace(/\s+$/, "").split("\n");
  const marked = lines.filter((l) => /^[+-]/.test(l)).length;
  const diff = marked > 0 && lines.every((l) => l === "" || /^[+\- ]/.test(l) || l.startsWith("@@"));
  const body = diff ? lines.map((l) => (l.startsWith("@@") ? l : l.slice(1))).join("\n") : lines.join("\n");
  return (
    <div className={cn("overflow-hidden rounded-lg border border-zinc-800 bg-[#1e1e1e] text-xs", className)}>
      {file && <div className="border-b border-zinc-800 bg-zinc-900/80 px-3.5 py-1.5 font-mono text-[11px] text-zinc-400">{file}</div>}
      <Highlight theme={themes.vsDark} code={body} language={langOf(file)}>
        {({ tokens, getTokenProps }) => (
          <pre className="overflow-x-auto py-2 font-mono leading-[1.7]" style={{ background: "transparent" }}>
            {tokens.map((line, i) => {
              const raw = lines[i] ?? "";
              const kind = diff ? (raw.startsWith("+") ? "add" : raw.startsWith("-") ? "del" : raw.startsWith("@@") ? "hunk" : "ctx") : "ctx";
              return (
                <div key={i}
                  className={cn("flex min-w-full w-max px-3.5", kind === "add" && "bg-emerald-500/15", kind === "del" && "bg-red-500/15", kind === "hunk" && "bg-indigo-500/15 text-indigo-300")}>
                  {diff && <span aria-hidden="true" className={cn("mr-3 w-3 shrink-0 select-none text-center", kind === "add" && "text-emerald-400", kind === "del" && "text-red-400", kind === "ctx" && "text-zinc-600")}>{kind === "add" ? "+" : kind === "del" ? "−" : ""}</span>}
                  <span className="whitespace-pre">{kind === "hunk" ? raw : line.map((t, k) => <span key={k} {...getTokenProps({ token: t })} />)}</span>
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
