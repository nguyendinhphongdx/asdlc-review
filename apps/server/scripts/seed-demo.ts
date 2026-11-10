/**
 * Dữ liệu demo cho ảnh chụp README: `DATA_DIR=/tmp/demo node --import tsx scripts/seed-demo.ts`
 * (chạy `db:push` trước). Chỉ dùng cho dev, dữ liệu hoàn toàn giả.
 */
import { buildContainer } from "../src/app/container.js";
import { loadConfig } from "../src/kernel/config.js";
import { createLogger } from "../src/kernel/logger.js";

const cfg = loadConfig({ ...process.env, REDIS_URL: "memory" });
process.env.DATABASE_URL = cfg.databaseUrl;
const c = buildContainer(cfg, createLogger("seed", "warn"));
const { identity, repos, reviews } = c.modules;

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
const DAY = 86_400_000;

const people = [
  ["Minh Anh", "minhanh", "Backend"], ["Quốc Bảo", "quocbao", "Backend"], ["Thu Hà", "thuha", "Frontend"],
  ["Đức Huy", "duchuy", "Frontend"], ["Lan Phương", "lanphuong", "Mobile"], ["Hoàng Nam", "hoangnam", "Platform"],
] as const;
const members = new Map<string, string>();
for (const [displayName, u, team] of people) members.set(u, (await identity.create({ displayName, team, identities: [{ platform: "gitlab", username: u }] })).id);
const repoList = [];
for (const p of ["acme/payments-api", "acme/web-portal", "acme/mobile-app", "acme/infra-tools"]) {
  repoList.push(await repos.register({ platform: "gitlab", fullPath: p, webUrl: `https://gitlab.example.com/${p}` }));
}

const RULES: [string, string, string, string, string][] = [
  ["SEC-01", "security", "blocker", "Hard-coded API key trong cấu hình", "Khoá API bị commit thẳng vào mã nguồn."],
  ["SEC-02", "security", "critical", "Câu SQL ghép chuỗi từ input người dùng", "Có nguy cơ SQL injection."],
  ["ARC-02", "architecture", "major", "Controller gọi trực tiếp repository, bỏ qua service", "Vi phạm phân tầng đã nêu trong AGENTS.md."],
  ["NAM-01", "naming", "minor", "Tên hàm `doStuff` không nói lên ý định", "Tên cần mô tả hành vi theo convention của repo."],
  ["TST-02", "testing", "major", "Logic tính phí mới không có test", "Thay đổi hành vi nhưng không có test đi kèm."],
  ["CON-05", "conventions", "minor", "Thêm `eslint-disable` không có lý do", "Suppress lint cần comment giải thích."],
  ["MNT-03", "maintainability", "minor", "console.log còn sót lại", "Debug code chưa được dọn."],
  ["COR-03", "correctness", "major", "Thiếu xử lý lỗi khi gọi dịch vụ ngoài", "Promise bị reject sẽ làm sập luồng xử lý."],
  ["DOC-01", "documentation", "nit", "README chưa cập nhật biến môi trường mới", "Người triển khai sẽ không biết cần cấu hình gì."],
];
const cats = ["correctness", "security", "architecture", "conventions", "testing", "maintainability", "naming", "documentation"];
const grade = (s: number) => (s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F");
const DEDUCT = { blocker: 35, critical: 25, major: 12, minor: 4, nit: 1 } as const;

const skill: Record<string, number> = { minhanh: 0.9, quocbao: 0.7, thuha: 0.85, duchuy: 0.6, lanphuong: 0.75, hoangnam: 0.8 };
let iid = 100;
for (let d = 29; d >= 0; d--) {
  const n = rnd() < 0.35 ? 0 : 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < n; k++) {
    const [name, user] = pick([...people]);
    const repo = pick(repoList);
    const opened = new Date(Date.now() - d * DAY - rnd() * DAY * 0.5);
    const mr = await reviews.upsertMr({
      repositoryId: repo.id, iid: ++iid, title: pick(["Thêm xuất báo cáo CSV", "Sửa lỗi tính phí hoàn tiền", "Refactor module thông báo", "Tích hợp đăng nhập SSO", "Tối ưu truy vấn danh sách", "Cập nhật pipeline CI", "Thêm màn hình cài đặt"]),
      description: "", webUrl: `https://gitlab.example.com/${repo.fullPath}/-/merge_requests/${iid}`, sourceBranch: `feat/${iid}`, targetBranch: "main",
      authorUsername: user, memberId: members.get(user), state: rnd() < 0.7 ? "merged" : "opened", draft: false, openedAt: opened,
      mergedAt: rnd() < 0.7 ? new Date(opened.getTime() + (4 + rnd() * 60) * 3_600_000) : null,
    });
    const rounds = 1 + (rnd() < 0.45 ? 1 : 0) + (rnd() < 0.15 ? 1 : 0);
    let q = skill[user]! - 0.15 + rnd() * 0.2;
    for (let r = 1; r <= rounds; r++) {
      const nf = Math.max(0, Math.round((1 - q) * 9 * (r === 1 ? 1 : 0.5) * (0.5 + rnd())));
      const picked = Array.from({ length: nf }, () => { let r = pick(RULES); while (r[0] === "SEC-01" && rnd() < 0.85) r = pick(RULES); return r; });
      const findings = picked.map(([ruleId, category, severity, title, why]) => ({
        source: ruleId === "SEC-01" || ruleId === "MNT-03" || ruleId === "CON-05" ? ("static" as const) : ("ai" as const),
        category, ruleId, severity, kind: "issue", title, why, confidence: 0.7 + rnd() * 0.3, deduction: DEDUCT[severity as keyof typeof DEDUCT] * 0.85,
        file: `src/${pick(["billing", "auth", "notify", "report"])}/${pick(["service", "controller", "repo"])}.ts`, lineStart: 10 + Math.floor(rnd() * 200),
        suggestion: "Xem lại theo quy ước trong AGENTS.md của repo.", question: rnd() < 0.4 ? "Vì sao chọn cách này thay vì dùng helper sẵn có?" : null,
      }));
      const total = findings.reduce((s, f) => s + f.deduction, 0);
      const secret = findings.some((f) => f.ruleId === "SEC-01");
      const score = Math.max(8, Math.min(99, Math.round(100 - total * 0.9 - rnd() * 4)));
      const final = secret ? Math.min(score, 30) : score;
      const { runId } = await reviews.startRun({ mrId: mr.id, trigger: "webhook", headSha: `${iid}${r}`.padEnd(40, "a"), provider: "claude-cli", frameworkId: "asdlc", frameworkVersion: "1.0", commits: r });
      await reviews.completeRun(runId, {
        score: final, rawScore: score, grade: grade(final) as never, verdict: (final >= 80 ? "approve" : final >= 60 ? "comment" : "request_changes") as never,
        gates: secret ? [{ id: "secret-leak", reason: "Phát hiện secret bị commit (SEC-01)", cap: 30 }] : [],
        summary: "MR bổ sung tính năng đúng hướng, cần chú ý một số điểm về phân tầng và kiểm thử trước khi merge.", intent: "Thêm/sửa tính năng theo yêu cầu trong mô tả MR.",
        strengths: ["Tách hàm rõ ràng, dễ đọc", "Có cập nhật tài liệu liên quan"], harnessFiles: ["README.md", "AGENTS.md", "CLAUDE.md"],
        filesChanged: 2 + Math.floor(rnd() * 18), additions: 20 + Math.floor(rnd() * 400), deletions: Math.floor(rnd() * 150), durationMs: 40_000 + Math.floor(rnd() * 150_000),
        costUsd: 0.2 + rnd() * 1.2, model: "claude-opus-5-5", findings,
        categoryScores: cats.map((cat) => {
          const fs = findings.filter((f) => f.category === cat); const ded = fs.reduce((s, f) => s + f.deduction, 0);
          return { category: cat, name: cat[0]!.toUpperCase() + cat.slice(1), weight: 10, score: Math.max(0, 100 - ded), deduction: ded, findings: fs.length };
        }),
      });
      const at = new Date(opened.getTime() + (r * 3 + rnd() * 3) * 3_600_000);
      await c.db.reviewRun.update({ where: { id: runId }, data: { createdAt: at, startedAt: at, finishedAt: new Date(at.getTime() + 90_000) } });
      q = Math.min(0.97, q + 0.12);
    }
  }
}
console.log("seed xong");
await c.stop();
