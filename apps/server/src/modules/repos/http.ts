import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ReposApi } from "./api.js";

const Patch = z.object({ frameworkId: z.string().nullish(), provider: z.enum(["claude-cli", "codex-cli", "openai-compatible"]).nullish(), model: z.string().max(120).nullish(), enabled: z.boolean().optional(), autoReview: z.boolean().optional(), skipDrafts: z.boolean().nullish(), targetBranches: z.string().max(300).nullish(), publishComments: z.boolean().nullish(), diffBudgetChars: z.number().int().min(10_000).max(1_000_000).nullish() });

export function registerReposRoutes(app: FastifyInstance, api: ReposApi) {
  app.get("/api/repos", async () => {
    const repos = await api.list();
    const sums = await api.webhookStatuses(repos.map((r) => `${r.platform}/${r.fullPath}`));
    return repos.map((r) => {
      const s = sums[`${r.platform}/${r.fullPath}`];
      return { ...r, webhook: s ? { status: s.status, lastEventAt: s.lastEventAt?.toISOString() ?? null } : undefined };
    });
  });
  app.patch<{ Params: { id: string } }>("/api/repos/:id", (req) => api.update(req.params.id, Patch.parse(req.body)));
  app.delete<{ Params: { id: string } }>("/api/repos/:id", async (req, reply) => (await api.remove(req.params.id), reply.status(204).send()));
}
