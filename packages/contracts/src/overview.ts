import { z } from "zod";

/**
 * Tổng quan động: danh sách khối có kiểu. AI chọn khối hợp với loại MR, giao diện vẽ từ dữ liệu này
 * (không nhúng HTML/Mermaid thô). Xem docs/PLAN-REVIEW-V2.md mục 10.
 */
export const DiagramStatusSchema = z.enum(["added", "changed", "removed", "unchanged"]);
export type DiagramStatus = z.infer<typeof DiagramStatusSchema>;

export const DiagramNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  sub: z.string().nullish(),
  /** Nhóm (module/lớp) để vẽ khung bao quanh. */
  group: z.string().nullish(),
  status: DiagramStatusSchema.default("unchanged"),
  /** Bằng chứng dạng `file:dòng` hoặc `file symbol`. Rỗng thì coi là chưa xác minh. */
  evidence: z.array(z.string()).default([]),
  note: z.string().nullish(),
});
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;

export const DiagramEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().nullish(),
  status: DiagramStatusSchema.default("unchanged"),
  /** Cạnh vi phạm quy tắc kiến trúc (vd module import module). */
  violation: z.boolean().default(false),
  evidence: z.array(z.string()).default([]),
});
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;

const GraphSchema = z.object({ nodes: z.array(DiagramNodeSchema).max(24), edges: z.array(DiagramEdgeSchema).max(60) });

const base = { id: z.string(), title: z.string() };

export const OverviewBlockSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("summary"), text: z.string() }),
  z.object({ ...base, kind: z.literal("bullets"), bullets: z.array(z.string()) }),
  z.object({ ...base, kind: z.literal("verdict"), verdict: z.string(), text: z.string().default("") }),
  /** Sơ đồ luồng/kiến trúc. `before` có thì UI bật chế độ Trước/Sau/Cạnh nhau. */
  z.object({ ...base, kind: z.literal("flow"), after: GraphSchema, before: GraphSchema.nullish() }),
  z.object({ ...base, kind: z.literal("architecture"), after: GraphSchema, before: GraphSchema.nullish() }),
  z.object({
    ...base,
    kind: z.literal("sequence"),
    actors: z.array(z.string()).min(2).max(8),
    messages: z.array(z.object({ from: z.string(), to: z.string(), text: z.string(), reply: z.boolean().default(false), evidence: z.array(z.string()).default([]) })).max(24),
  }),
]);
export type OverviewBlock = z.infer<typeof OverviewBlockSchema>;
export type DiagramGraph = z.infer<typeof GraphSchema>;
export type FlowBlock = Extract<OverviewBlock, { kind: "flow" | "architecture" }>;
export type SequenceBlock = Extract<OverviewBlock, { kind: "sequence" }>;

/** Loại MR do bước T0 (tất định) gắn nhãn; quyết định khối tổng quan nào cần vẽ. */
export const MR_KINDS = ["new-feature", "flow-change", "refactor", "bugfix", "schema-change", "api-change", "config-infra", "deps", "docs", "test-only"] as const;
export type MrKind = (typeof MR_KINDS)[number];

/** Dạng khối AI được trả (một hình chung, chỉ gồm các khối cần suy luận cấu trúc; chữ/ý chính/kết luận vẫn theo `overview` của framework). */
export const AiBlockSchema = z.object({
  kind: z.enum(["flow", "architecture", "sequence"]),
  title: z.string(),
  nodes: z.array(DiagramNodeSchema).default([]),
  edges: z.array(DiagramEdgeSchema).default([]),
  /** Chỉ điền khi thấy rõ thiết kế hiện có trong code; rỗng = không có chế độ Trước. */
  beforeNodes: z.array(DiagramNodeSchema).default([]),
  beforeEdges: z.array(DiagramEdgeSchema).default([]),
  actors: z.array(z.string()).default([]),
  messages: z.array(z.object({ from: z.string(), to: z.string(), text: z.string(), reply: z.boolean().default(false), evidence: z.array(z.string()).default([]) })).default([]),
});
export type AiBlock = z.infer<typeof AiBlockSchema>;

export const DIAGRAM_KINDS = ["flow", "architecture", "sequence"] as const;
export type DiagramKind = (typeof DIAGRAM_KINDS)[number];
/** Khối sơ đồ cần vẽ cho một loại MR: `required` AI phải vẽ, `optional` chỉ vẽ khi MR thật sự đụng tới. */
export const OverviewViewSchema = z.object({ required: z.array(z.enum(DIAGRAM_KINDS)).max(3).default([]), optional: z.array(z.enum(DIAGRAM_KINDS)).max(3).default([]) });
export type OverviewView = z.infer<typeof OverviewViewSchema>;
/** Ghi đè theo loại MR trong framework (loại không ghi thì dùng DEFAULT_VIEWS). */
export const OverviewViewsSchema = z.record(z.enum(MR_KINDS), OverviewViewSchema);

/** Mặc định: MR nhỏ không vẽ gì (chỉ chữ + kết luận). */
export const DEFAULT_VIEWS: Record<MrKind, OverviewView> = {
  "new-feature": { required: ["flow"], optional: ["architecture", "sequence"] },
  "flow-change": { required: ["flow"], optional: ["sequence", "architecture"] },
  refactor: { required: ["architecture"], optional: ["flow"] },
  bugfix: { required: [], optional: [] },
  "schema-change": { required: [], optional: ["flow"] },
  "api-change": { required: ["sequence"], optional: ["flow"] },
  "config-infra": { required: [], optional: [] },
  deps: { required: [], optional: [] },
  docs: { required: [], optional: [] },
  "test-only": { required: [], optional: [] },
};

/** View hiệu lực của một loại MR: framework ghi đè nếu có, không thì mặc định. */
export const viewFor = (kind: MrKind, views?: Partial<Record<string, OverviewView>> | null): OverviewView => views?.[kind] ?? DEFAULT_VIEWS[kind];
