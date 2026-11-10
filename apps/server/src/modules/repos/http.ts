import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ReposApi } from "./api.js";

const Patch = z.object({ frameworkId: z.string().nullish(), provider: z.enum(["claude-cli", "codex-cli", "openai-compatible"]).nullish(), enabled: z.boolean().optional(), autoReview: z.boolean().optional() });

export function registerReposRoutes(app: FastifyInstance, api: ReposApi) {
  app.get("/api/repos", () => api.list());
  app.patch<{ Params: { id: string } }>("/api/repos/:id", (req) => api.update(req.params.id, Patch.parse(req.body)));
  app.delete<{ Params: { id: string } }>("/api/repos/:id", async (req, reply) => (await api.remove(req.params.id), reply.status(204).send()));
}
