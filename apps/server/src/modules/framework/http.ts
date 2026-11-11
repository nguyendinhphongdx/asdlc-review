import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FrameworkApi } from "./api.js";

const Severity = z.enum(["blocker", "critical", "major", "minor", "nit"]);
const Sev = z.object({ deduction: z.number().min(0).max(100), label: z.string().max(40), description: z.string().max(400) });
const Edit = z.object({
  name: z.string().max(120),
  language: z.string().max(10).optional(),
  severity: z.object({ blocker: Sev, critical: Sev, major: Sev, minor: Sev, nit: Sev }),
  gates: z.array(z.object({ id: z.string().max(40), reason: z.string().max(200), capTotal: z.number(), when: z.object({ ruleIds: z.array(z.string()).optional(), category: z.string().optional(), minSeverity: Severity.optional() }) })).max(30),
  grades: z.array(z.object({ grade: z.enum(["A", "B", "C", "D", "F"]), min: z.number().min(0).max(100) })).min(1),
  sizeBaseline: z.number().min(1).max(100000),
  publish: z.object({ comments: z.boolean(), inlineMinSeverity: Severity, maxInline: z.number().int().min(0).max(100) }).optional(),
  categories: z.array(z.object({
    id: z.string().max(40), name: z.string().max(120), weight: z.number().min(0).max(1000),
    criteria: z.array(z.object({ id: z.string().max(40), title: z.string().max(200), check: z.string().max(2000), why: z.string().max(1000).default(""), defaultSeverity: Severity, enabled: z.boolean() })).max(200),
  })).max(30),
  note: z.string().max(200).optional(),
});
const Fork = z.object({ baseId: z.string().max(80), name: z.string().max(120) });
const Preview = z.object({ yaml: z.string().max(50_000), frameworkId: z.string().max(80).optional() });

/** Danh sách (kèm số repo) và xoá do `app/` đăng ký vì cần dữ liệu module khác. */
export function registerFrameworkRoutes(app: FastifyInstance, api: FrameworkApi) {
  app.get<{ Params: { id: string }; Querystring: { version?: string } }>("/api/frameworks/:id", (req) => api.detail(req.params.id, req.query.version ? Number(req.query.version) : undefined));
  app.get<{ Params: { id: string }; Querystring: { version?: string } }>("/api/frameworks/:id/diff", (req) => api.diffFromBase(req.params.id, req.query.version ? Number(req.query.version) : undefined));
  app.post("/api/frameworks", async (req, reply) => reply.status(201).send(await api.fork(Fork.parse(req.body))));
  app.put<{ Params: { id: string } }>("/api/frameworks/:id", (req) => api.update(req.params.id, Edit.parse(req.body)));
  app.post<{ Params: { id: string } }>("/api/frameworks/:id/restore", (req) => api.restore(req.params.id, z.object({ version: z.number().int().min(1) }).parse(req.body).version));
  app.post("/api/framework-config/preview", (req) => api.previewConfig(Preview.parse(req.body)));
}
