import { z } from "zod";
import { SeveritySchema } from "@mrd/contracts";

const CriterionSchema = z.object({
  id: z.string(),
  title: z.string(),
  check: z.string(),
  why: z.string().default(""),
  defaultSeverity: SeveritySchema.default("minor"),
  enabled: z.boolean().default(true),
  /** Rule bảo mật nền: không tắt/hạ mức độ được (kể cả bằng `.asdlc.yml`). */
  locked: z.boolean().default(false),
});

const OverviewSectionSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().max(120),
  enabled: z.boolean().default(true),
  kind: z.enum(["text", "bullets", "verdict"]).default("text"),
  maxWords: z.number().int().min(20).max(400).default(100),
  guide: z.string().max(2000).default(""),
  verdicts: z.array(z.string().max(60)).max(8).default([]),
});

const OverviewSchema = z.object({ guide: z.string().max(4000).default(""), sections: z.array(OverviewSectionSchema).max(12) });

/** Khung mặc định của "Đánh giá tổng quan" khi framework không khai báo: nhìn MR từ xa như một kiến trúc sư. */
export const DEFAULT_OVERVIEW: z.infer<typeof OverviewSchema> = {
  guide: "Viết như một kiến trúc sư đọc MR từ xa: nêu mục đích và đánh đổi trước, chi tiết dòng code sau. Khách quan, có chính kiến, không khen xã giao. Câu ngắn. Mỗi nhận định phải dẫn được file, commit hoặc tài liệu; không bịa số liệu.",
  sections: [
    { id: "what", title: "MR này làm gì", enabled: true, kind: "text", maxWords: 90, verdicts: [], guide: "Tóm tắt hành vi hệ thống thay đổi, không liệt kê file. Người chưa đọc code phải hiểu được: cái gì được thêm, bỏ, đổi." },
    { id: "how", title: "Cách giải quyết", enabled: true, kind: "text", maxWords: 90, verdicts: [], guide: "Mô tả cơ chế kỹ thuật chính và nó nằm ở tầng nào. Chỉ nói thiết kế, không bình luận chất lượng ở mục này." },
    { id: "why", title: "Vì sao chọn cách này", enabled: true, kind: "bullets", maxWords: 120, verdicts: [], guide: "Suy ra lý do từ mô tả MR và tài liệu liên kết. Liệt kê các đánh đổi tác giả đã chấp nhận. Không có căn cứ thì ghi rõ “không rõ lý do”." },
    { id: "simpler", title: "Có cách đơn giản hơn?", enabled: true, kind: "verdict", maxWords: 100, verdicts: ["Không", "Có, đáng thử trước", "Có, nên làm thay"], guide: "Đề xuất giải pháp ít thay đổi hơn mà đạt cùng mục tiêu; so sánh chi phí vận hành, độ phức tạp, rủi ro. Chọn “Không” nếu đây thật sự là cách gọn nhất." },
    { id: "far", title: "Nhìn từ xa", enabled: true, kind: "bullets", maxWords: 120, verdicts: [], guide: "Lùi khỏi diff: có hợp kiến trúc không, tạo phụ thuộc mới gì, rủi ro vận hành, ảnh hưởng module khác. Lấy quy tắc kiến trúc của repo làm chuẩn." },
    { id: "next", title: "Đề xuất", enabled: false, kind: "bullets", maxWords: 60, verdicts: [], guide: "Tối đa 3 việc, xếp theo tác động lên điểm. Mỗi việc một dòng, bắt đầu bằng động từ." },
  ],
};

const MrDocSchema = z.object({ kind: z.string().max(60), required: z.boolean().default(false), pattern: z.string().max(300), hint: z.string().max(200).default("") });
const MrDescriptionSchema = z.object({ docs: z.array(MrDocSchema).max(12), penalty: z.number().min(0).max(30).default(0) });
/** Mặc định: không đòi tài liệu nào, để framework tự khai báo chuẩn của đội. */
export const DEFAULT_MR_DESCRIPTION: z.infer<typeof MrDescriptionSchema> = { docs: [], penalty: 0 };

export const FrameworkFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  kind: z.enum(["default", "template"]).optional(),
  language: z.string().default("vi"),
  severity: z.record(SeveritySchema, z.object({ deduction: z.number(), label: z.string(), description: z.string() })),
  gates: z
    .array(
      z.object({
        id: z.string(),
        when: z.object({
          ruleIds: z.array(z.string()).optional(),
          category: z.string().optional(),
          minSeverity: SeveritySchema.optional(),
          minCount: z.number().int().min(1).optional(),
        }),
        capTotal: z.number(),
        reason: z.string(),
        locked: z.boolean().default(false),
      }),
    )
    .default([]),
  grades: z.array(z.object({ grade: z.enum(["A", "B", "C", "D", "F"]), min: z.number() })),
  sizeBaseline: z.number().default(200),
  /** Chính sách đăng comment lên MR; mặc định KHÔNG tự đăng. */
  publish: z.object({ comments: z.boolean().default(false), inlineMinSeverity: SeveritySchema.default("major"), maxInline: z.number().int().min(0).max(100).default(15) }).default({}),
  /** Khung "Đánh giá tổng quan" (mục, hướng dẫn cho AI, dạng hiển thị). */
  overview: OverviewSchema.default(DEFAULT_OVERVIEW),
  /** Chuẩn mô tả MR: tài liệu cần đính kèm. */
  mrDescription: MrDescriptionSchema.default(DEFAULT_MR_DESCRIPTION),
  categories: z.array(
    z.object({ id: z.string(), name: z.string(), weight: z.number().min(0), criteria: z.array(CriterionSchema).default([]) }),
  ),
});
export type FrameworkFile = z.infer<typeof FrameworkFileSchema>;

/** Cấu hình riêng của repo (`.asdlc.yml`). */
export const RepoConfigSchema = z.object({
  framework: z.string().optional(),
  language: z.string().optional(),
  weights: z.record(z.string(), z.number().min(0)).optional(),
  disable: z.array(z.string()).optional(),
  extraRules: z
    .array(
      z.object({
        id: z.string(),
        category: z.string(),
        title: z.string(),
        check: z.string(),
        why: z.string().default(""),
        defaultSeverity: SeveritySchema.default("minor"),
      }),
    )
    .optional(),
  ignore: z.array(z.string()).optional(),
  docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type RepoConfig = z.infer<typeof RepoConfigSchema>;
