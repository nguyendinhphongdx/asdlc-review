import type { OverviewBlock } from "@mrd/contracts";

/** Dữ liệu mẫu để xem/thử bộ vẽ khi chưa có AI sinh khối (mở bằng ?overview=demo). */
export const DEMO_BLOCKS: OverviewBlock[] = [
  { kind: "summary", id: "s", title: "Tóm tắt", text: "Thêm bước chờ duyệt trước khi đăng comment lên MR; workflow hiện gọi thẳng publisher nên cần đi qua cổng agent." },
  {
    kind: "flow", id: "f", title: "Luồng đăng comment",
    before: {
      nodes: [
        { id: "done", label: "Review xong", sub: "workflow", status: "unchanged", evidence: ["app/workflows/review-merge-request.ts:210"] },
        { id: "score", label: "Chấm điểm", sub: "scoring", status: "unchanged", evidence: ["modules/scoring/api.ts:30"] },
        { id: "post", label: "Đăng comment", sub: "publisher", group: "modules/publisher", status: "unchanged", evidence: ["modules/publisher/api.ts:55"] },
      ],
      edges: [{ from: "done", to: "score", status: "unchanged", violation: false, evidence: [] }, { from: "score", to: "post", status: "unchanged", violation: false, evidence: [] }],
    },
    after: {
      nodes: [
        { id: "done", label: "Review xong", sub: "workflow", status: "unchanged", evidence: ["app/workflows/review-merge-request.ts:210"] },
        { id: "score", label: "Chấm điểm", sub: "scoring", status: "unchanged", evidence: ["modules/scoring/api.ts:30"] },
        { id: "wait", label: "Chờ duyệt", sub: "agent", status: "added", evidence: ["modules/agent/api.ts:112 setActionStatus", "app/workflows/agent-actions.ts:48"], note: "Giữ kết quả ở trạng thái chờ cho tới khi người duyệt quyết định." },
        { id: "post", label: "Đăng comment", sub: "renderSummary", group: "modules/publisher", status: "changed", evidence: ["modules/publisher/api.ts:55"] },
        { id: "draft", label: "Lưu nháp", status: "added", evidence: ["modules/agent/api.ts:140"] },
        { id: "notify", label: "Thông báo", status: "added", evidence: [], note: "Suy ra từ mô tả MR." },
      ],
      edges: [
        { from: "done", to: "score", status: "unchanged", violation: false, evidence: [] },
        { from: "score", to: "wait", status: "added", violation: false, evidence: ["app/workflows/review-merge-request.ts:240"] },
        { from: "wait", to: "post", label: "đồng ý", status: "added", violation: false, evidence: ["app/workflows/agent-actions.ts:60"] },
        { from: "wait", to: "draft", label: "từ chối", status: "added", violation: false, evidence: ["app/workflows/agent-actions.ts:71"] },
        { from: "wait", to: "notify", status: "added", violation: false, evidence: [] },
        { from: "done", to: "post", label: "gọi thẳng publisher", status: "unchanged", violation: true, evidence: ["app/workflows/review-merge-request.ts:262"] },
      ],
    },
  },
  {
    kind: "sequence", id: "q", title: "Trình tự gọi", actors: ["Web", "Server", "Reviewer", "Provider"],
    messages: [
      { from: "Web", to: "Server", text: "PUT /api/settings", reply: false, evidence: [] },
      { from: "Server", to: "Reviewer", text: "review()", reply: false, evidence: [] },
      { from: "Reviewer", to: "Provider", text: "ask(model, prompt)", reply: false, evidence: [] },
      { from: "Provider", to: "Reviewer", text: "kết quả JSON", reply: true, evidence: [] },
      { from: "Reviewer", to: "Server", text: "RawReview", reply: true, evidence: [] },
      { from: "Server", to: "Web", text: "200 · chờ duyệt", reply: true, evidence: [] },
    ],
  },
  { kind: "verdict", id: "v", title: "Kết luận", verdict: "Cần sửa nhẹ", text: "Bỏ lời gọi thẳng publisher ở workflow rồi mới merge." },
];
