import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Rubric } from "@mrd/contracts";
import { createAnalysisModule } from "../../modules/analysis/index.js";
import type { Modules } from "../modules.js";
import { designFindings, pool, reviewByAreas } from "../workflows/review-areas.js";

const analysis = createAnalysisModule();
const mkDiff = (p: string, n = 5) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1,1 +1,${n} @@ fn()\n${Array.from({ length: n }, (_, i) => `+line ${i}`).join("\n")}\n`;
const rubric = { language: "vi", categories: [{ id: "arch", name: "Kiến trúc & thiết kế", weight: 1, criteria: [] }] } as unknown as Rubric;

function setup(opts: { failArea?: string; failAll?: boolean } = {}) {
  const calls = { understand: 0, design: 0, review: [] as { label: string | undefined; files: string[]; hasMap: boolean }[] };
  const cache = new Map<string, string>();
  const m = {
    analysis,
    reviews: { getDesignMap: async (_r: string, b: string, a: string) => cache.get(`${b}|${a}`) ?? null, saveDesignMap: async (_r: string, b: string, a: string, t: string) => void cache.set(`${b}|${a}`, t) },
    reviewer: {
      understand: async () => { calls.understand++; return { text: "thiết kế cũ", usage: { provider: "p", model: "m", costUsd: 0.1, durationMs: 1 } }; },
      assessDesign: async (r: { areas: { label: string }[] }) => { calls.design++; return { design: { verdict: "conditional" as const, summary: "cần xem lại", concerns: [{ area: r.areas[0]!.label, severity: "major" as const, text: "Đặt sai lớp. Nên chuyển." }, { area: null, severity: "info" as const, text: "ghi chú" }], focus: [r.areas[0]!.label], splitSuggestion: "" }, usage: { provider: "p", model: "m", costUsd: 0.2, durationMs: 1 } }; },
      review: async (r: { focus?: { label: string; files: string[]; designMap?: string } }) => {
        calls.review.push({ label: r.focus?.label, files: r.focus?.files ?? [], hasMap: !!r.focus?.designMap });
        if (opts.failAll || (opts.failArea && r.focus?.label === opts.failArea)) throw new Error("boom");
        const f = r.focus!.files[0]!;
        return { blocks: [], review: { summary: "", intent: "", strengths: [], overview: [], checks: [], blocks: [], harnessUsed: ["AGENTS.md"], findings: [
          { category: "arch", ruleId: null, severity: "minor" as const, kind: "issue" as const, title: `lỗi ở ${f}`, file: f, lineStart: 1, lineEnd: 1, why: "", confidence: 0.8 },
          { category: "arch", ruleId: null, severity: "minor" as const, kind: "issue" as const, title: "lạc sang file khác", file: "zzz/other.ts", lineStart: 1, lineEnd: 1, why: "", confidence: 0.8 },
        ] }, usage: { provider: "p", model: "m", costUsd: 0.3, durationMs: 1 } };
      },
    },
  } as unknown as Modules;
  return { m, calls, cache };
}

const files = ["apps/server/src/modules/reviewer/a.ts", "apps/server/src/modules/scoring/b.ts", "apps/web/src/features/reviews/c.tsx"];
const input = (m: Modules, over: Record<string, unknown> = {}) => {
  const diff = files.map((f) => mkDiff(f, 90)).join("");
  const areas = analysis.areas({ files: files.map((path) => ({ path, additions: 90, deletions: 0, binary: false })), diff });
  const warns: string[] = [];
  return { warns, args: { m, emit: (l: string, msg: string) => { if (l === "warn") warns.push(msg); }, provider: "p", model: undefined, workdir: "/tmp", maxBudgetUsd: undefined, repoId: "r", baseSha: "base1", rubric, mr: { title: "t", description: "d" }, areas, byFile: analysis.splitDiff(diff), diffBudget: 100_000, base: {} as never, harnessText: "", staticFindings: [], ...over } };
};

describe("reviewByAreas (T2→T3→T4)", () => {
  it("đọc thiết kế, đánh giá thiết kế, review từng khu vực và chỉ nhận finding đúng file", async () => {
    const { m, calls } = setup();
    const { args } = input(m);
    const r = await reviewByAreas(args as never);
    assert.equal(calls.understand, 3);
    assert.equal(calls.design, 1);
    assert.equal(calls.review.length, 3);
    assert.ok(calls.review.every((c) => c.hasMap), "mỗi lượt T4 nhận designMap của khu vực");
    assert.equal(r.findings.length, 3, "finding lạc sang file khác bị loại");
    assert.deepEqual(r.harnessUsed, ["AGENTS.md"]);
    assert.equal(r.passes.length, 3);
    assert.ok(r.costUsd > 1.4, "cộng chi phí của mọi lượt");
    assert.equal(r.design?.verdict, "conditional");
  });

  it("T2 dùng cache theo base + khu vực ở lần sau", async () => {
    const { m, calls } = setup();
    await reviewByAreas(input(m).args as never);
    await reviewByAreas(input(m).args as never);
    assert.equal(calls.understand, 3, "lần hai không gọi lại T2");
  });

  it("một khu vực lỗi chỉ cảnh báo, file của nó không tính là đã review; mọi khu vực lỗi thì ném lỗi", async () => {
    const one = setup();
    const i1 = input(one.m);
    one.m.reviewer.review = ((orig) => async (r: never) => { if ((r as { focus: { label: string } }).focus.label === i1.args.areas[0]!.label) throw new Error("boom"); return orig(r); })(one.m.reviewer.review) as never;
    const r = await reviewByAreas(i1.args as never);
    assert.equal(r.findings.length, 2);
    assert.ok(r.omitted.length >= 1);
    assert.ok(i1.warns.some((w) => w.includes("lỗi")));
    const all = setup({ failAll: true });
    await assert.rejects(() => reviewByAreas(input(all.m).args as never), /đều lỗi/);
  });

  it("file quá lớn cho ngân sách một lượt không chạy lượt nào và được báo là chưa review", async () => {
    const { m, calls } = setup();
    const { args } = input(m, { diffBudget: 100 });
    const r = await reviewByAreas(args as never);
    assert.equal(calls.review.length, 0);
    assert.equal(r.findings.length, 0);
    assert.deepEqual([...r.omitted].sort(), [...files].sort());
  });

  it("designFindings: bỏ info, giới hạn 5, gắn danh mục thiết kế", () => {
    const fs = designFindings({ verdict: "rework", summary: "", focus: [], splitSuggestion: "", concerns: [{ area: "A", severity: "major", text: "Sai lớp. Chi tiết." }, { area: null, severity: "info", text: "x" }, ...Array.from({ length: 8 }, () => ({ area: null, severity: "minor" as const, text: "y" }))] }, rubric);
    assert.equal(fs.length, 5);
    assert.equal(fs[0]!.category, "arch");
    assert.equal(fs[0]!.severity, "major");
    assert.ok(fs[0]!.title.startsWith("Thiết kế (A): Sai lớp."));
  });

  it("pool giữ thứ tự và giới hạn song song", async () => {
    let running = 0, peak = 0;
    const out = await pool([1, 2, 3, 4, 5], 2, async (n) => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; return n * 2; });
    assert.deepEqual(out, [2, 4, 6, 8, 10]);
    assert.equal(peak, 2);
  });
});
